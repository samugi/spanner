// Generate intermediate representation
// this depends on other nodes and edges as well because depending on the node's
// inputs/outputs it may have to be generated differently (with/without lets, etc)
//

import type { Node, Edge } from 'reactflow'
import { type Expression, type Let, type Call, type Symbol, isExprObj, isLetLike, type LetStar, type VarRef } from './types'
import _ from 'lodash';
import { newParamSymbol } from './spec';
import { wrapInSpanIfNeeded } from './spans';


function usesVar(expr: Expression, sym: Symbol): boolean {
    if (typeof expr === 'number' || typeof expr === 'boolean' || typeof expr === 'string') {
        return false
    }

    // Helper: check if expression creates a new scope
    // in which case we don't look inside it as we are only interested
    // in top-level variable usages for let-squashing
    const createsScope = (e: Expression): boolean => {
        return isExprObj(e) && (isLetLike(e));
    }

    switch (expr.type) {
        case 'var':
            return _.isEqual((expr as VarRef).sym, sym);
        case 'call':
            return expr.args.some(arg =>
                !createsScope(arg) && usesVar(arg, sym)
            )

        case 'let':
        case 'let*':
            return expr.bindings.some(b =>
                !createsScope(b.expr) && usesVar(b.expr, sym)
            )

        case 'start-span':
        case 'end-span':
            return !createsScope(expr.context) && usesVar(expr.context, sym)

        default: {
            const _exhaustive: never = expr
            return _exhaustive
        }
    }
}

function squashLets(
    expr: Expression,
    outParam: Symbol,
    outExpr: Expression
): Let | LetStar | null {
    if (!isLetLike(expr)) {
        return null
    }

    const needsLetStar = expr.bindings.some(b => usesVar(b.expr, outParam))

    return {
        type: needsLetStar ? 'let*' : expr.type,
        bindings: [
            { sym: outParam, expr: outExpr },
            ...expr.bindings,
        ],
        body: expr.body,
    } as Let | LetStar
}

// Collect all nodes reachable from a start node by following edges backwards (dependencies)
function collectReachableNodes(
    startNodeId: string,
    allEdges: Edge[]
): Set<string> {
    const reachable = new Set<string>();
    const queue = [startNodeId];

    while (queue.length > 0) {
        const nodeId = queue.shift()!;
        if (reachable.has(nodeId)) {
            continue;
        }
        reachable.add(nodeId);

        // Find all nodes that this node depends on (incoming edges)
        const dependencies = allEdges
            .filter(e => e.target === nodeId)
            .map(e => e.source);
        queue.push(...dependencies);
    }

    return reachable;
}

// This is also where we wrap calls in spans
function generateIrSingleNode(nodeId: string, nodes: Node[], edges: Edge[], previous: Expression | null, visited: Set<string>): Expression {
    visited.add(nodeId);
    const node = nodes.find(n => n.id === nodeId)!
    const incoming_data = edges.filter(e => e.target === nodeId && e.data && e.data.kind === 'data')
    const symbol = newParamSymbol(node.id); // output symbol for this node

    switch (node.data.kind) {
        case 'literal': {
            if (previous) {
                const squashed = squashLets(previous, symbol, node.data.value) ||
                    {
                        type: 'let',
                        bindings: [{ sym: symbol, expr: node.data.value }],
                        body: previous
                    } as Let;
                return squashed;
            }
            return node.data.value;
        }
        case 'if': {
            const condEdge = incoming_data.find(e => e.targetHandle === 'cond')!
            const thenEdge = edges.find(e =>
                e.target === node.id &&
                e.targetHandle === 'then'
            )!
            const elseEdge = edges.find(e =>
                e.target === node.id &&
                e.targetHandle === 'else'
            )!

            const condSym = newParamSymbol(condEdge.source)

            // `then` and `else` branches are treated as programs of their own
            // because they are not dependencies like other inputs, they are
            // control flow branches that are executed conditionally.
            // So we collect all nodes reachable from the `then` and `else` nodes
            // and generate IR for those subgraphs separately, then add all those
            // nodes to the visited set to avoid re-processing them.
            const thenNodes = collectReachableNodes(thenEdge.source, edges);
            const elseNodes = collectReachableNodes(elseEdge.source, edges);
            const thenExpr = generateIrSubProgram(
                nodes,
                edges,
                thenNodes
            )
            const elseExpr = generateIrSubProgram(
                nodes,
                edges,
                elseNodes
            )
            thenNodes.forEach(id => visited.add(id));
            elseNodes.forEach(id => visited.add(id));

            const ifExpr: Call = {
                type: 'call',
                name: 'if',
                args: [
                    { type: 'var', sym: condSym },
                    thenExpr,
                    elseExpr
                ],
                output: false
            }

            if (!previous) return ifExpr

            return {
                type: 'call',
                name: 'begin',
                output: false,
                args: [ifExpr, previous]
            }
        }
        case 'call': {
            // prepare the arguments to the call
            const args: VarRef[] = incoming_data
                .sort((a, b) => a.targetHandle!
                    .localeCompare(b.targetHandle!))
                .map(e => ({ type: 'var', sym: newParamSymbol(`${nodes.find(n => n.id === e.source)?.id!}`) }));

            let callExpr: Call = {
                type: 'call',
                name: node.data.name,
                args: args,
                output: node.data.output !== false
            }

            // handle calls with no output (if, display, etc)
            if (node.data.output === false) {
                if (previous) {
                    callExpr = {
                        type: 'call',
                        name: 'begin',
                        output: false,
                        args: [
                            callExpr,
                            previous
                        ]
                    } as Call
                }

                return callExpr;
            }

            // normal call with output: use let
            let binding = {
                sym: symbol,
                expr: callExpr
            };

            let expr: Expression | null = null;
            // if there is a previous node, try to squash lets
            if (previous) {
                expr = squashLets(previous, binding.sym, binding.expr as Expression);
            }

            // no expression was generated by let squashing: create a new let
            if (!expr) {
                // if there's a previous, we need to create a let, else just return the binding expr
                expr = previous ? {
                    type: 'let',
                    bindings: [binding],
                    body: previous
                } as Expression : binding.expr as Expression;
            }

            return expr;
        }
        default: {
            throw new Error(`Unknown node kind: ${node.data.kind}`)
        }
    }
}

// Main function to generate IR from a set of nodes and edges
export function generateIrSubProgram(allNodes: Node[], allEdges: Edge[], traverseNodes: Set<string>): Expression {
    const visited = new Set<string>();
    let result: Expression | null = null;

    // visited all in traverseNodes?
    while ([...traverseNodes].some(id => !visited!.has(id))) {
        for (const n of allNodes) {
            if (!traverseNodes.has(n.id) || visited.has(n.id)) {
                continue;
            }
            // visit all the children of the current node n
            const outgoing = allEdges.filter(e => e.source === n.id)

            // check if all children (that are visitable) have been visited
            // a node can only be visited if all its (visitable) children
            // have been visited
            const allChildrenVisited = outgoing
                .filter(e => traverseNodes.has(e.target))
                .every(e => visited.has(e.target));

            if (allChildrenVisited && !visited.has(n.id)) {
                visited.add(n.id);
                const spanNode = n.parentId
                    ? allNodes.find(s => s.type === 'span' && s.id === n.parentId)
                    : null;
                result = generateIrSingleNode(n.id, allNodes, allEdges, result, visited);
                // wrap node in span if needed
                result = wrapInSpanIfNeeded(allNodes, visited, result, spanNode || null);
                break;
            }
        }
    }

    return result!;
}
