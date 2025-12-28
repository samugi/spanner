// Generate intermediate representation
// this depends on other nodes and edges as well because depending on the node's
// inputs/outputs it may have to be generated differently (with/without lets, etc)
//

import type { Node, Edge } from 'reactflow'
import { type Expression, type Let, type Call, type Symbol, isExprObj, isLetLike, type LetStar, type VarRef, type EndSpan, type StartSpan } from './types'
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
): Let | LetStar {
    if (!isLetLike(expr)) {
        throw new Error('Can only squash lets into Let or LetStar expressions');
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

function hasSingleOutput(nodes: Node[], edges: Edge[], nodeId: string): boolean {
    let outputs = edges.filter(e => e.source === nodeId && e.data && e.data.kind === 'data');
    return outputs.length === 1;
}

function hasAnyDataOutput(edges: Edge[], nodeId: string): boolean {
    return edges.some(e => e.source === nodeId && e.data?.kind === 'data');
}

// Expand an expression within a previous expression by replacing all occurrences of oldSym with newExpr
function replaceExprInPrevious(previous: Expression, oldSym: Symbol, newExpr: Expression): Expression {
    if (!isExprObj(previous)) {
        return previous;
    }

    switch (previous.type) {
        case 'call':
            const newArgs = previous.args.map(arg => {
                return replaceExprInPrevious(arg, oldSym, newExpr);
            });
            return {
                type: 'call',
                name: previous.name,
                args: newArgs,
                output: previous.output
            } as Call;

        case 'let':
        case 'let*':
            const newBindings = previous.bindings.map(b => {
                let nExpr = replaceExprInPrevious(b.expr, oldSym, newExpr);
                return {
                    sym: b.sym,
                    expr: nExpr
                };
            });

            const newBody = replaceExprInPrevious(previous.body, oldSym, newExpr);

            return {
                type: previous.type,
                bindings: newBindings,
                body: newBody
            } as Let | LetStar;

        case 'var':
            if (_.isEqual(previous.sym, oldSym)) {
                return newExpr as VarRef;
            }
            return previous;

        case 'start-span':
        case 'end-span':
            return previous;

        default:
            const _exhaustiveCheck: never = previous;
            return _exhaustiveCheck;
    }
}

// Generate IR for a single node
function generateIrSingleNode(nodeId: string, nodes: Node[], edges: Edge[], previous: Expression | null, visited: Set<string>): Expression {
    const node = nodes.find(n => n.id === nodeId)!
    const incomingData = edges.filter(e => e.target === nodeId && e.data && e.data.kind === 'data')
    const nodeOutSymbol = newParamSymbol(node.id); // output symbol for this node

    switch (node.data.kind) {
        case 'literal': {
            if (previous) {
                // check if we should expand in previous directly instead of creating a new outer scope
                if (hasSingleOutput(nodes, edges, nodeId)) {
                    return replaceExprInPrevious(previous, nodeOutSymbol, node.data.value);
                }

                // If we can't expand in previous, we need to create a new outer scope
                const squashed =
                    // if previous is a let-like, we can squash the literal into it
                    isLetLike(previous) && squashLets(previous, nodeOutSymbol, node.data.value)
                    // else create a new let
                    || {
                        type: 'let',
                        bindings: [{ sym: nodeOutSymbol, expr: node.data.value }],
                        body: previous
                    } as Let;
                return squashed;
            }
            return node.data.value;
        }
        case 'cond': {
            // cond branches are in the format: test-{i} and action-{i}
            const branches = edges.filter(e => e.target === node.id
                && e.targetHandle?.startsWith('action-'))
                .map(e => {
                    const testEdge = edges.find(te =>
                        te.target === node.id &&
                        te.targetHandle === e.targetHandle!.replace('action-', 'test-')
                    )!;
                    return {
                        testEdge,
                        actionEdge: e
                    }
                });

            const condArgs: Call[] = [];
            for (const br of branches) {
                const testSym = newParamSymbol(br.testEdge.source);
                // actions are conditional to the test being true
                // they must be treated as sub-programs so their scope is contained
                const actionNodes = collectReachableNodes(br.actionEdge.source, edges);
                const actionExpr = generateIrSubProgram(
                    nodes,
                    edges,
                    actionNodes
                )
                actionNodes.forEach(id => visited.add(id));

                // create a call that represents the test and action
                // the name is empty because cond condss are anonymous
                // example: ( (= 1 1) (print "foo") )
                const condCall: Call = {
                    type: 'call',
                    name: '',
                    args: [
                        { type: 'var', sym: testSym } as VarRef,
                        actionExpr
                    ],
                    output: false
                }
                condArgs.push(condCall);
            }

            const condExpr: Call = {
                type: 'call',
                name: 'cond',
                args: condArgs,
                output: node.data.output !== false
            }

            if (!previous) return condExpr;
            // cond is combined with "previous" with a begin
            // because cond has no output (so no need to create a let scope)
            return {
                type: 'call',
                name: 'begin',
                output: false,
                args: [condExpr, previous]
            }
        }
        case 'if': {
            const condEdge = incomingData.find(e => e.targetHandle === 'cond')!
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

            if (!previous) return ifExpr;
            // if is combined with previous with a begin
            // because if has no output (so no need to create a let scope)
            return {
                type: 'call',
                name: 'begin',
                output: false,
                args: [ifExpr, previous]
            }
        }
        case 'call': {
            // prepare the arguments to the call
            // each argument is a VarRef to the output of the incoming data nodes
            const args: VarRef[] = incomingData
                .map(e => ({ type: 'var', sym: newParamSymbol(`${nodes.find(n => n.id === e.source)?.id!}`) }));

            // create the call expression
            let callExpr: Call = {
                type: 'call',
                name: node.data.name,
                args: args,
                output: node.data.output !== false
            }

            // if there is no previous expression, just return the call
            if (!previous) {
                return callExpr;
            }

            // handle calls with a previous but no data output: we just chain them in a begin
            const hasDataOutput = hasAnyDataOutput(edges, nodeId);
            if (!hasDataOutput) {
                return {
                    type: 'call',
                    name: 'begin',
                    output: node.data.output,
                    args: [
                        callExpr,
                        previous
                    ]
                } as Call
            }

            // There is a previous that takes this node's output:

            // check if we should expand in previous directly instead of creating a new scope
            if (hasSingleOutput(nodes, edges, nodeId)) {
                return replaceExprInPrevious(previous, nodeOutSymbol, callExpr);
            }

            // output will be reused: create a let scope
            let binding = {
                sym: nodeOutSymbol,
                expr: callExpr
            };

            if (isLetLike(previous)) {
                return squashLets(previous, binding.sym, binding.expr as Expression);
            } else {
                // has multiple outputs and a previous that is not a let: create a new let
                return {
                    type: 'let',
                    bindings: [binding],
                    body: previous
                } as Expression;
            }

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

    // visit all nodes in traverseNodes
    while ([...traverseNodes].some(id => !visited!.has(id))) {
        for (const n of allNodes) {
            if (!traverseNodes.has(n.id) || visited.has(n.id)) {
                continue;
            }
            // fetch all the children of the current node n
            const outgoing = allEdges.filter(e => e.source === n.id)

            // check if all children (that are visitable) have been visited
            // a node can only be visited if all its (visitable) children
            // have been visited
            const allChildrenVisited = outgoing
                .filter(e => traverseNodes.has(e.target))
                .every(e => visited.has(e.target));

            if (allChildrenVisited) {
                visited.add(n.id);
                result = generateIrSingleNode(n.id, allNodes, allEdges, result, visited);

                // fetch, if any, the span that wraps this node
                const span = n.parentId
                    ? allNodes.find(s => s.type === 'span' && s.id === n.parentId)
                    : null;
                if (span) {
                    result = wrapInSpanIfNeeded(allNodes, visited, result, span);
                }
                break;
            }
        }
    }

    return result!;
}
