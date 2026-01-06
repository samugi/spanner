// Generate intermediate representation
// this depends on other nodes and edges as well because depending on the node's
// inputs/outputs it may have to be generated differently (with/without lets, etc)
//

import type { Node, Edge } from 'reactflow'
import { type Expression, type Let, type Call, type Symbol, isExprObj, isLetLike, type LetStar, type VarRef, type EndSpan, type StartSpan } from './types'
import _ from 'lodash';
import { newParamSymbol } from './spec';
import { wrapInSpan } from './spans';

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
            return expr.context && !createsScope(expr.context) && usesVar(expr.context, sym)

        default: {
            const _exhaustive: never = expr
            return _exhaustive
        }
    }
}

function squashBegins(
    previous: Expression,
    curr: Expression,
): Call {
    if (!isExprObj(curr) || curr.type !== 'call' || curr.name !== 'begin') {
        throw new Error('Can only squash begins into Call expressions');
    }

    if (!isExprObj(previous) || previous.type !== 'call' || previous.name !== 'begin') {
        return {
            type: 'call',
            name: 'begin',
            output: curr.output,
            args: [
                ...curr.args,
                previous,
            ]
        } as Call;
    }

    return {
        type: 'call',
        name: 'begin',
        output: curr.output,
        args: [
            ...curr.args,
            ...previous.args,
        ]
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
    allEdges: Edge[],
    allNodes: Node[],
    rootEdge: Edge,
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
        // and all those that depend on this node (outgoing edges)
        const dependencies = allEdges
            .filter(e => e.target === nodeId && e !== rootEdge)
            .map(e => e.source);
        const dependents = allEdges
            .filter(e => e.source === nodeId && e !== rootEdge)
            .map(e => e.target);

        // Add them to the queue for further exploration
        queue.push(...dependents);
        queue.push(...dependencies);
    }

    // add span nodes that are "reachable", i.e. all their children are reachable
    const spanNodes = allNodes
        .filter(n => n.data.kind === 'span')
        .map(n => n.id);
    for (const spanId of spanNodes) {
        const spanChildren = allNodes
            .filter(n => n.parentId === spanId)
            .map(n => n.id);
        if (spanChildren.every(childId => reachable.has(childId))) {
            reachable.add(spanId);
        }
    }

    return reachable;
}

function hasSingleOutput(edges: Edge[], node: Node): boolean {
    let outputs = edges.filter(e => e.source === node.id && e.data && e.data.kind === 'data');
    // also verify that it has no span. If a node has a span it automatically gains an output context
    let hasSpan = node.parentId !== undefined && node.parentId !== null;
    return outputs.length === 1 && !hasSpan;
}

function hasAnyDataOutput(edges: Edge[], nodeId: string): boolean {
    return edges.some(e => e.source === nodeId && e.data?.kind === 'data');
}

// Expand an expression within a previous expression by replacing all occurrences of oldSym with newExpr
// oldSym is used as a placeholder during traversal, later it will be either kept as a VarRef
// to be used within a let scope, or replaced with the actual expression as we are doing here.
function replaceExprInPrevious(previous: Expression, oldSym: Symbol, newExpr: Expression): Expression {
    if (!isExprObj(previous)) {
        return previous;
    }

    switch (previous.type) {
        case 'call':
            // for calls, we need to replace in all arguments
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
            // for lets, we need to replace in all bindings and the body
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
            // for var, we check if it matches oldSym and just replace it
            if (_.isEqual(previous.sym, oldSym)) {
                return newExpr as VarRef;
            }
            return previous;

        case 'start-span':
        case 'end-span':
            // spans are ignored for replacement
            // because they don't take part in data flow
            return previous;

        default:
            const _exhaustiveCheck: never = previous;
            return _exhaustiveCheck;
    }
}

// Generate IR for a single node
// span wrapping works like this:
// - when visiting a node, if it has a parent span that has not been visited yet,
//   we generate the entire subprogram for that span (including the current node)
function generateIrSingleNode(node: Node, nodes: Node[], edges: Edge[], previous: Expression | null, visited: Set<string>, traverseNodes: Set<string>): Expression {
    const incomingData = edges.filter(e => e.target === node.id && e.data && e.data.kind === 'data')
    const nodeOutSymbol = newParamSymbol(node.id); // output symbol for this node

    //  -----------------
    // |  Span wrapping  |
    //  -----------------
    const parentSpanId = node.parentId;
    const parentSpan = parentSpanId ? nodes.find(n => n.id === parentSpanId) : null;
    // if there is a parent span for the current node, process the subprogram wrapped in the span first
    if (parentSpanId && parentSpan && !visited.has(parentSpanId) && traverseNodes.has(parentSpanId)) {
        // must collect all nodes in the span
        // if it's a parent span, the subprogram includes nodes that are in subspans
        // so they can be traversed as well recursively
        let subProgram = new Set(nodes.filter(n => n.parentId === parentSpanId)?.map(n => n.id));
        let subSpans = nodes.filter(n => n.parentId === parentSpanId && n.data.kind === 'span');
        for (const ss of subSpans) {
            const spanChildNodes = new Set(nodes.filter(n => n.parentId === ss.id)?.map(n => n.id));
            spanChildNodes.forEach(id => subProgram.add(id));
        }

        if (subProgram) {
            // because the subprogram includes the current node, and we have to process it,
            // we remove the current node from the visited set so it gets processed again
            visited.delete(node.id);

            let spanBodyExpr = generateIrSubProgram(nodes, edges, subProgram, visited);
            const lastNodeSymbol = newParamSymbol(node.id);

            spanBodyExpr = wrapInSpan(parentSpan, nodes, spanBodyExpr, previous, lastNodeSymbol)!;
            visited.add(parentSpanId);
            //add all nodes in the subprogram to visited
            // subProgram.forEach(id => visited.add(id));
            return spanBodyExpr;
        }
    }

    // no span is wrapping the current node in this program traversal, proceed normally
    switch (node.data.kind) {
        case 'literal': {
            if (previous) {
                // check if we should expand in previous directly instead of creating a new outer scope
                if (hasSingleOutput(edges, node)) {
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
                const actionNodes = collectReachableNodes(br.actionEdge.source, edges, nodes, br.actionEdge);
                const actionExpr = generateIrSubProgram(
                    nodes,
                    edges,
                    actionNodes,
                    visited
                )
                // actionNodes.forEach(id => visited.add(id));

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

            let condExpr: Expression = {
                type: 'call',
                name: 'cond',
                args: condArgs,
                output: node.data.output !== false
            }

            if (!previous) return condExpr;
            // cond is combined with "previous" with a begin
            // because cond has no output (so no need to create a let scope)
            let beginExpr = {
                type: 'call',
                name: 'begin',
                output: false,
                args: [condExpr]
            } as Call;
            return squashBegins(previous, beginExpr);
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
            const thenNodes = collectReachableNodes(thenEdge.source, edges, nodes, thenEdge);
            const elseNodes = collectReachableNodes(elseEdge.source, edges, nodes, elseEdge);

            const thenExpr = generateIrSubProgram(
                nodes,
                edges,
                thenNodes,
                visited
            )
            // thenNodes.forEach(id => visited.add(id));
            const elseExpr = generateIrSubProgram(
                nodes,
                edges,
                elseNodes,
                visited
            )
            // elseNodes.forEach(id => visited.add(id));

            let ifExpr: Expression = {
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
            let beginExpr = {
                type: 'call',
                name: 'begin',
                output: false,
                args: [ifExpr]
            } as Call;
            return squashBegins(previous, beginExpr);
        }
        case 'call': {
            // prepare the arguments to the call
            // each argument is a VarRef to the output of the incoming data nodes
            const args: VarRef[] = incomingData
                .map(e => ({ type: 'var', sym: newParamSymbol(`${nodes.find(n => n.id === e.source)?.id!}`) }));

            // create the call expression
            let callExpr: Expression = {
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
            const hasDataOutput = hasAnyDataOutput(edges, node.id);
            if (!hasDataOutput) {
                let beginExpr = {
                    type: 'call',
                    name: 'begin',
                    output: node.data.output,
                    args: [
                        callExpr
                    ]
                } as Call
                return squashBegins(previous, beginExpr);
            }

            // There is a previous that takes this node's output:

            // check if we should expand in previous directly instead of creating a new scope
            if (hasSingleOutput(edges, node)) {
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
        case 'span': {
            throw new Error('Span nodes should be handled separately when visiting their child nodes');
            // // if we are visiting a span directly it means all its children were visited and we can wrap
            // const spanExpr = wrapInSpan(
            //     node,
            //     nodes,
            //     null,
            //     previous,
            //     newParamSymbol(node.id)
            // );
            // return spanExpr!;
        }
        default: {
            throw new Error(`Unknown node kind: ${node.data.kind}`)
        }
    }
}

function isVisitable(n: Node, allEdges: Edge[], allNodes: Node[], visited: Set<string>): boolean {
    // fetch all the children of the current node n
    const outgoing = allEdges.filter(e => e.source === n.id)

    // check if all children (that are visitable) have been visited
    // a node can only be visited if all its (visitable) children
    // have been visited
    let allChildrenVisited = outgoing
        // .filter(e => traverseNodes.has(e.target))
        .every(e => visited.has(e.target));
    if (!allChildrenVisited) {
        return false;
    }

    // if it's part of a condition branch, check if the origin node has been visited
    // it's a condition branch if any of the edges connected to this node are of data.kind 'control'
    // TODO: move out of here / unify or similarize with that in utils
    const ctrlSet = new Set<string>();
    const stack = [n.id];
    while (stack.length > 0) {
        const current = stack.pop()!;
        if (ctrlSet.has(current)) continue;
        ctrlSet.add(current);

        for (const e of allEdges) {
            if (e.source === current && e.data?.kind === 'control') {
                if (!visited.has(e.target)) {
                    return false;
                }
            }
            if (e.target === current && !ctrlSet.has(e.source) && e.data?.kind !== 'control') {
                stack.push(e.source);
            }
        }
    }


    // if it's a span, we need to check all its child nodes
    if (n.data.kind === 'span') {
        const spanChildNodes = allNodes.filter(nn => nn.parentId === n.id).map(nn => nn.id);
        allChildrenVisited = spanChildNodes.every(id => visited.has(id));
    }

    return allChildrenVisited;
}

// Main function to generate IR from a set of nodes and edges
export function generateIrSubProgram(allNodes: Node[], allEdges: Edge[], traverseNodes: Set<string>, visited: Set<string> | null): Expression {
    visited = visited || new Set<string>();
    let result: Expression | null = null;

    // visit all nodes in traverseNodes
    while ([...traverseNodes].some(id => !visited!.has(id))) {
        for (const n of allNodes) {
            if (!traverseNodes.has(n.id) || visited.has(n.id)) {
                continue;
            }

            const childrenVisited = isVisitable(n, allEdges, allNodes, visited);
            if (childrenVisited) {
                visited.add(n.id);

                const node = allNodes.find(no => no.id === n.id)!;
                result = generateIrSingleNode(node, allNodes, allEdges, result, visited, traverseNodes);
                break;
            }
        }
    }

    return result!;
}

// export function wrapWithTracing(expr: Expression): Expression {
//     const exporterCfg = newParamSymbol('exporter-config');
//     const provider = newParamSymbol('provider');
//     const tracer = newParamSymbol('tracer');

//     return {
//         type: 'let',
//         bindings: [
//             {
//                 sym: exporterCfg,
//                 expr: {
//                     type: 'call',
//                     name: 'stdlib-telemetry::tracing::exporter-config::with-protocol',
//                     args: [
//                         {
//                             type: 'call',
//                             name: 'stdlib-telemetry::tracing::exporter-config::with-endpoint',
//                             args: [
//                                 {
//                                     type: 'call',
//                                     name: 'stdlib-telemetry::tracing::exporter-config::new-default',
//                                     args: [],
//                                 },
//                                 "http://jaeger:4318/v1/traces",
//                             ],
//                         },
//                         {
//                             type: 'call',
//                             name: 'stdlib-telemetry::common::new-http-protocol',
//                             args: [],
//                         }
//                     ],
//                 }
//             }
//         ],
//         body: {
//             type: 'let',
//             bindings: [
//                 {
//                     sym: provider,
//                     expr: {
//                         type: 'call',
//                         name: 'stdlib-telemetry::tracing::new-provider',
//                         args: [
//                             { type: 'var', sym: exporterCfg } as VarRef,
//                             1000,
//                             {
//                                 type: 'call',
//                                 name: 'option::stdlib-telemetry_resource::none',
//                                 args: [],
//                             }
//                         ],
//                     }
//                 }
//             ],
//             body: {
//                 type: 'let',
//                 bindings: [
//                     {
//                         sym: tracer,
//                         expr: {
//                             type: 'call',
//                             name: 'stdlib-telemetry::tracing::new-tracer',
//                             args: [
//                                 { type: 'var', sym: provider } as VarRef,
//                                 {
//                                     type: 'call',
//                                     name: 'option::stdlib-telemetry_scope::none',
//                                     args: [],
//                                 }
//                             ],
//                         }
//                     }
//                 ],
//                 body: expr
//             }
//         }
//     } as Let;
// }
