// Generate intermediate representation
// this depends on other nodes and edges as well because depending on the node's
// inputs/outputs it may have to be generated differently (with/without lets, etc)
//

import type { Node, Edge } from 'reactflow'
import { type Expression, type Let, type Call, type Symbol, isExprObj, isLetLike, type LetStar, type VarRef, type EndSpan, type StartSpan, isTraceableExpr } from './types'
import _, { find, first, last } from 'lodash';
import { newCxSymbol, newParamSymbol } from './spec';
import { belongsToControlFlow } from '../utils';

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
            return !!expr.context && !createsScope(expr.context) && usesVar(expr.context, sym)

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
            ],
            spanIds: [],
            activeSpanId: "",
        } as Call;
    }

    return {
        type: 'call',
        name: 'begin',
        output: curr.output,
        args: [
            ...curr.args,
            ...previous.args,
        ],
        spanIds: [],
        activeSpanId: "",
    }
}

function squashLets(
    parentLet: Let | LetStar,
    childLet: Let | LetStar
): Let | LetStar {
    // check if any of the child bindings depend on the parent bindings
    // in which case we need a let* instead of a let
    let needsLetStar = false;
    for (const cb of childLet.bindings) {
        for (const pb of parentLet.bindings) {
            if (usesVar(cb.expr, pb.sym)) {
                needsLetStar = true;
                break;
            }
        }
        if (needsLetStar) {
            break;
        }
    }
    const combinedBindings = [...parentLet.bindings, ...childLet.bindings];

    return {
        type: needsLetStar ? 'let*' : 'let',
        bindings: combinedBindings,
        body: childLet.body,
    } as Let;
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
                output: previous.output,
                spanIds: previous.spanIds,
                activeSpanId: previous.activeSpanId
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
            // let spanIds = previous.spanIds || [];
            // if (isTraceableExpr(newExpr) && newExpr.spanIds) {
            //     spanIds = [...new Set([...spanIds, ...newExpr.spanIds])];
            // }

            return {
                type: previous.type,
                bindings: newBindings,
                body: newBody,
                // spanIds: spanIds,
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
function generateIrSingleNode(node: Node, nodes: Node[], edges: Edge[], previous: Expression | null, visited: Set<string>, allSpanNodes: Node[]): Expression {
    const incomingData = edges.filter(e => e.target === node.id && e.data && e.data.kind === 'data')
    const nodeOutSymbol = newParamSymbol(node.id); // output symbol for this node

    // //  -----------------
    // // |  Span wrapping  |
    // //  -----------------
    // const parentSpanId = node.parentId;
    // const parentSpan = parentSpanId ? nodes.find(n => n.id === parentSpanId) : null;
    // // if there is a parent span for the current node, process the subprogram wrapped in the span first
    // if (parentSpanId && parentSpan && !visited.has(parentSpanId) && traverseNodes.has(parentSpanId)) {
    //     // must collect all nodes in the span
    //     // if it's a parent span, the subprogram includes nodes that are in subspans
    //     // so they can be traversed as well recursively
    //     let subProgram = new Set(nodes.filter(n => n.parentId === parentSpanId)?.map(n => n.id));
    //     let subSpans = nodes.filter(n => n.parentId === parentSpanId && n.data.kind === 'span');
    //     for (const ss of subSpans) {
    //         const spanChildNodes = new Set(nodes.filter(n => n.parentId === ss.id)?.map(n => n.id));
    //         spanChildNodes.forEach(id => subProgram.add(id));
    //     }

    //     if (subProgram) {
    //         // because the subprogram includes the current node, and we have to process it,
    //         // we remove the current node from the visited set so it gets processed again
    //         visited.delete(node.id);

    //         let spanBodyExpr = generateIrSubProgram(nodes, edges, subProgram, visited);
    //         const lastNodeSymbol = newParamSymbol(node.id);

    //         spanBodyExpr = wrapInSpan(parentSpan, nodes, spanBodyExpr, previous, lastNodeSymbol)!;
    //         visited.add(parentSpanId);
    //         //add all nodes in the subprogram to visited
    //         // subProgram.forEach(id => visited.add(id));
    //         return spanBodyExpr;
    //     }
    // }

    // no span is wrapping the current node in this program traversal, proceed normally
    switch (node.data.kind) {
        case 'literal': {
            if (previous) {
                // check if we should expand in previous directly instead of creating a new outer scope
                if (hasSingleOutput(edges, node)) {
                    return replaceExprInPrevious(previous, nodeOutSymbol, node.data.value);
                }

                // let spanIds = [];
                // if (isTraceableExpr(node.data.value) && node.data.value.spanIds) {
                //     spanIds = node.data.value.spanIds;
                // }
                // if (isTraceableExpr(previous) && previous.spanIds) {
                //     spanIds = [...new Set([...spanIds, ...previous.spanIds])];
                // }

                // If we can't expand in previous, we need to create a new outer scope
                const squashed =
                    // if previous is a let-like, we can squash the literal into it
                    // isLetLike(previous) && squashLets(previous, nodeOutSymbol, node.data.value)
                    // else create a new let
                    // || {
                    {
                        type: 'let',
                        bindings: [{ sym: nodeOutSymbol, expr: node.data.value }],
                        body: previous,
                        // spanIds: spanIds,
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
                let actionExpr = generateIrSubProgram(
                    nodes,
                    edges,
                    allSpanNodes,
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
                    output: false,
                    spanIds: allSpanNodes.filter(sn => sn.data.wrappedNodeIds.includes(node.id))?.map(sn => sn.id) || null,
                    activeSpanId: node.parentId || ""
                }
                condArgs.push(condCall);
            }

            let condExpr: Expression = {
                type: 'call',
                name: 'cond',
                args: condArgs,
                output: node.data.output !== false,
                spanIds: allSpanNodes.filter(sn => sn.data.wrappedNodeIds.includes(node.id))?.map(sn => sn.id) || null,
                activeSpanId: node.parentId || ""
            }

            if (!previous) return condExpr;
            // cond is combined with "previous" with a begin
            // because cond has no output (so no need to create a let scope)
            let beginExpr = {
                type: 'call',
                name: 'begin',
                output: false,
                args: [condExpr],
                spanIds: [],
                activeSpanId: ""
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
            const thenEdges = edges.filter(e => thenNodes.has(e.source) && thenNodes.has(e.target) && e !== thenEdge);
            const elseNodes = collectReachableNodes(elseEdge.source, edges, nodes, elseEdge);
            const elseEdges = edges.filter(e => elseNodes.has(e.source) && elseNodes.has(e.target) && e !== elseEdge);

            const thenExpr = generateIrMultiFlow(
                thenNodes.size > 0 ? nodes.filter(n => thenNodes.has(n.id)) : [],
                thenEdges,
                allSpanNodes,
                visited
            )
            // thenNodes.forEach(id => visited.add(id));
            const elseExpr = generateIrMultiFlow(
                elseNodes.size > 0 ? nodes.filter(n => elseNodes.has(n.id)) : [],
                elseEdges,
                allSpanNodes,
                visited
            )
            // elseNodes.forEach(id => visited.add(id));

            // collect all span IDs of this IF node
            let spanIds: string[] = [];
            // if (isTraceableExpr(thenExpr) && thenExpr.spanIds) {
            //     spanIds = thenExpr.spanIds;
            // }
            // if (isTraceableExpr(elseExpr) && elseExpr.spanIds) {
            //     spanIds = [...new Set([...spanIds, ...elseExpr.spanIds])];
            // }
            allSpanNodes.filter(sn => sn.data.wrappedNodeIds.includes(node.id))?.map(sn => sn.id).forEach(id => {
                if (!spanIds.includes(id)) {
                    spanIds.push(id);
                }
            });

            let ifExpr: Expression = {
                type: 'call',
                name: 'if',
                args: [
                    { type: 'var', sym: condSym },
                    thenExpr,
                    elseExpr
                ],
                output: false,
                spanIds: spanIds,
                activeSpanId: node.parentId || ""
            }

            if (!previous) return ifExpr;
            // if is combined with previous with a begin
            // because if has no output (so no need to create a let scope)
            let beginExpr = {
                type: 'call',
                name: 'begin',
                output: false,
                args: [ifExpr],
                spanIds: [],
                activeSpanId: ""
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
                output: node.data.output !== false,
                spanIds: allSpanNodes.filter(sn => sn.data.wrappedNodeIds.includes(node.id))?.map(sn => sn.id) || null,
                activeSpanId: node.parentId || ""
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
                    ],
                    spanIds: [],
                    activeSpanId: ""
                } as Call
                return squashBegins(previous, beginExpr);
            }

            // There is a previous that takes this node's output:

            // check if we should expand in previous directly instead of creating a new scope
            if (hasSingleOutput(edges, node)) {
                return replaceExprInPrevious(previous, nodeOutSymbol, callExpr);
            }

            // let spanIds: string[] = [];
            // if (isTraceableExpr(callExpr) && callExpr.spanIds) {
            //     spanIds = callExpr.spanIds;
            // }
            // if (isTraceableExpr(previous) && previous.spanIds) {
            //     spanIds = [...new Set([...spanIds, ...previous.spanIds])];
            // }

            // output will be reused: create a let scope
            let binding = {
                sym: nodeOutSymbol,
                expr: callExpr,
            };

            // if (/*isLetLike(previous)*/ false) {
            //     return squashLets(previous, binding.sym, binding.expr as Expression);
            // } else {
            // has multiple outputs and a previous that is not a let: create a new let
            return {
                type: 'let',
                bindings: [binding],
                body: previous,
                // spanIds: spanIds,
            } as Expression;
            // }

        }
        case 'span': {
            throw new Error('Span nodes should be handled separately');
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

function areChildrenVisited(n: Node, allEdges: Edge[], allNodes: Node[], visited: Set<string>): boolean {
    // fetch all the children of the current node n
    const outgoing = allEdges.filter(e => e.source === n.id && e.data && (e.data.kind === 'data'));

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

function visitable(allNodes: Node[], allEdges: Edge[], node: Node, traverseNodes: Set<string>, visited: Set<string>): boolean {
    if (!traverseNodes.has(node.id) || visited.has(node.id))
        return false;

    if (!areChildrenVisited(node, allEdges, allNodes, visited)) {
        return false;
    }

    return true;
}

function pickNextNode(visitableNodes: Node[], allEdges: Edge[], visited: Set<string>): Node {
    // first candidates: nodes that have output data for other nodes
    for (const n of visitableNodes) {
        const outgoing = allEdges.filter(e => e.source === n.id && e.data && e.data.kind === 'data');
        if (outgoing.length > 0) {
            return n;
        }
    }

    // second candidates: nodes that share input data with other already visited nodes
    for (const n of visitableNodes) {
        const sourceNodes = allEdges.filter(e => e.target === n.id && e.data && e.data.kind === 'data').map(e => e.source);
        const sharedInputWithVisited = allEdges.some(e => sourceNodes.includes(e.source) && visited.has(e.target));
        if (sharedInputWithVisited) {
            return n;
        }
    }

    return visitableNodes[0];
}

// Main function to generate IR from a set of nodes and edges
export function generateIrSubProgram(allNodes: Node[], allEdges: Edge[], allSpanNodes: Node[], traverseNodes: Set<string>, visited: Set<string> | null): Expression {
    visited = visited || new Set<string>();
    let result: Expression | null = null;

    // visit all nodes in traverseNodes
    while ([...traverseNodes].some(id => !visited!.has(id))) {
        const visitableNodes = allNodes.filter(n => visitable(allNodes, allEdges, n, traverseNodes, visited!));
        if (visitableNodes.length === 0) {
            throw new Error('No visitable nodes found, but traversal not complete. Possible cyclic dependency.');
        }
        const node = pickNextNode(visitableNodes, allEdges, visited);
        if (!node) {
            throw new Error('No visitable node could be picked.');
        }

        visited.add(node.id);
        result = generateIrSingleNode(node, allNodes, allEdges, result, visited, allSpanNodes);
    }

    return result!;
}

function collectFlowNodes(node: Node, allEdges: Edge[]): Set<string> {
    const flowNodes = new Set<string>();
    const queue = [node.id];

    while (queue.length > 0) {
        const nodeId = queue.shift()!;
        if (flowNodes.has(nodeId)) {
            continue;
        }
        flowNodes.add(nodeId);

        // Find all nodes that are connected by non-flow edges
        const connectedNodes = allEdges
            .filter(e => (e.source === nodeId || e.target === nodeId) && e.data && (e.data.kind === 'data' || e.data.kind === 'control'))
            .map(e => e.source === nodeId ? e.target : e.source);
        queue.push(...connectedNodes);
    }

    return flowNodes;
}

// can from reach to by following flow edges going forward?
function canReach(from: string, to: string, flowEdges: Edge[]): boolean {
    if (from === to) return false;

    const visited = new Set<string>();
    const queue = [from];

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current === to) return true;
        if (visited.has(current)) continue;
        visited.add(current);

        for (const edge of flowEdges) {
            if (edge.source === current) {
                queue.push(edge.target);
            }
        }
    }

    return false;
}

export function generateIrMultiFlow(allNodes: Node[], allEdges: Edge[], allSpanNodes: Node[] | null, visited: Set<string> | null): Expression {
    const allDataNodes = allNodes.filter(n => n.data.kind !== 'span');
    allSpanNodes = allSpanNodes || allNodes.filter(n => n.data.kind === 'span');

    // result is a begin of all subprograms for each independent flow
    // here we identify independent flows as groups of nodes that are connected by data edges
    // to split into flows we identify flow roots as nodes that have incoming flow edges
    const flowEdges = allEdges.filter(e => e.data && e.data.kind === 'flow');
    const flowRoots = new Set<string>();
    for (const fe of flowEdges) {
        flowRoots.add(fe.target);
        flowRoots.add(fe.source);
    }

    const sortedRoots = Array.from(flowRoots).sort((a, b) => canReach(a, b, flowEdges) ? -1 : 1);
    let flows = sortedRoots.map(rootId => {
        const rootNode = allDataNodes.find(n => n.id === rootId);
        if (!rootNode) {
            throw new Error(`Flow root node not found: ${rootId}`);
        }
        return collectFlowNodes(rootNode, allEdges);
    });

    // if no flows detected, create a single flow with all nodes
    if (flows.length === 0) {
        flows = [new Set(allDataNodes.map(n => n.id))];
    }

    // the result is a begin of all flow subprograms
    const flowExprs: Expression[] = [];
    visited = visited || new Set<string>();
    for (let flowNodes of flows) {
        // remove any visited nodes from the flow
        flowNodes = new Set(Array.from(flowNodes).filter(id => !visited.has(id)));
        if (flowNodes.size === 0) {
            continue;
        }

        const allDataNodesInFlow = allDataNodes.filter(n => flowNodes.has(n.id));
        // TODO: careful here
        // remove control flow branches
        let filteredNodes = allDataNodesInFlow.filter(n => {
            if (belongsToControlFlow(n.id, allEdges)) return false;
            return true;
        });

        const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

        // TODO: maybe allNodesInFlow instead of allNodes?
        const flowExpr = generateIrSubProgram(allDataNodes, allEdges, allSpanNodes, filteredNodeIds, visited);
        flowExprs.push(flowExpr);
    }

    if (flowExprs.length === 1) {
        return flowExprs[0];
    }

    return {
        type: 'call',
        name: 'begin',
        output: false,
        args: flowExprs,
        spanIds: [],
        activeSpanId: ""
    } as Call;
}

function findFirstUsageSpan(expr: Expression, spanId: string): Expression | null {
    if (!isTraceableExpr(expr)) {
        return null;
    }

    switch (expr.type) {
        case 'call':
            if (expr.spanIds && expr.spanIds.some(id => id === spanId)) {
                return expr;
            }
            for (const arg of expr.args) {
                const result = findFirstUsageSpan(arg, spanId);
                if (result) {
                    return result;
                }
            }
            return null;
        case 'let':
        case 'let*':
            for (const b of expr.bindings) {
                const result = findFirstUsageSpan(b.expr, spanId);
                if (result) {
                    return result;
                }
            }
            return findFirstUsageSpan(expr.body, spanId);

        default:
            return null;
    }
}

function findAnyUsageSpan(expr: Expression, spanId: string): boolean {
    if (!isTraceableExpr(expr)) {
        return false;
    }

    switch (expr.type) {
        case 'call':
            if (expr.spanIds && expr.spanIds.some(id => id === spanId)) {
                return true;
            }
            for (const arg of expr.args) {
                const result = findAnyUsageSpan(arg, spanId);
                if (result) {
                    return true;
                }
            }
            return false;
        case 'let':
        case 'let*':
            for (const b of expr.bindings) {
                const result = findAnyUsageSpan(b.expr, spanId);
                if (result) {
                    return true;
                }
            }
            return findAnyUsageSpan(expr.body, spanId);

        default:
            return false;
    }
}

// must find the last usage (in a depth-first traversal) of a span in an expression
// so that we know when the span can be closed
// it must traverse all the graph because the last usage may be in a different branch
function findLastUsageSpan(expr: Expression, spanId: string): Expression | null {
    if (!isTraceableExpr(expr)) {
        return null;
    }

    let lastUsage: Expression | null = null;

    switch (expr.type) {
        case 'call':
            for (const arg of expr.args) {
                const result = findLastUsageSpan(arg, spanId);
                if (result) {
                    lastUsage = result;
                }
            }
            if (expr.spanIds && expr.spanIds.some(id => id === spanId)) {
                lastUsage = expr;
            }
            return lastUsage;
        case 'let':
        case 'let*':
            for (const b of expr.bindings) {
                const result = findLastUsageSpan(b.expr, spanId);
                if (result) {
                    lastUsage = result;
                }
            }
            const bodyResult = findLastUsageSpan(expr.body, spanId);
            if (bodyResult) {
                lastUsage = bodyResult;
            }
            return lastUsage;

        default:
            return null;
    }
}

function wrapInSpans(expr: Expression, spanNodesToEnd: Node[], spanNodesToStart: Node[], activeSpanNode: Node | null): Expression {
    // end spans first
    // this needs to make sure the previous value that was last
    // is returned from the call, so it needs to let-bind it, execute the end-span calls,
    // then return the previous value
    if (spanNodesToEnd.length > 0) {
        const endSpanCalls = spanNodesToEnd.map(spanNode => {
            const endSpan: EndSpan = {
                type: 'end-span',
                context: { type: 'var', sym: newCxSymbol(spanNode.id) }
            };
            return endSpan;
        });

        const prevSym = newParamSymbol("tmp-" + spanNodesToEnd.map(n => n.id).join("-"));

        expr = {
            type: 'let',
            bindings: [
                {
                    sym: prevSym,
                    expr: expr
                }
            ],
            body: {
                type: 'call',
                name: 'begin',
                output: true,
                args: [
                    ...endSpanCalls,
                    { type: 'var', sym: prevSym } as VarRef
                ],
                spanIds: [],
                activeSpanId: ""
            },
            spanIds: [],
            activeSpanId: ""
        };

    }

    // then start spans
    if (spanNodesToStart.length > 0) {
        const startSpanBindings = spanNodesToStart.map(spanNode => {
            const startSpan: StartSpan = {
                type: 'start-span',
                spanName: spanNode.data.name,
                context: activeSpanNode?.parentId ? { type: 'var', sym: newCxSymbol(activeSpanNode.parentId) } : null
            };
            return {
                sym: newCxSymbol(spanNode.id),
                expr: startSpan
            };
        });
        expr = {
            type: 'let',
            bindings: startSpanBindings,
            body: expr,
            spanIds: [],
            activeSpanId: ""
        }
    }
    return expr;
}



// recursively finds expressions that have an active span (spanId)
// starts every span before the first expression that uses it
// ends every span after the last expression that uses it
export function generateTir(currExpr: Expression, fullExpr: Expression, spanNodesToUse: Node[], allSpanNodes: Node[], startedSpans: Set<string>, endedSpans: Set<string>): Expression {
    if (!isExprObj(currExpr) || !isTraceableExpr(currExpr)) {
        return currExpr;
    }

    // let spanIds = currExpr.spanIds ? currExpr.spanIds : null;
    // let spanNodes = spanIds ? spanNodesToUse.filter(n => spanIds.includes(n.id)) : null;
    let activeSpanId = currExpr.activeSpanId ? currExpr.activeSpanId : null;
    let activeSpanNode = activeSpanId ? allSpanNodes.find(n => n.id === activeSpanId) : null;
    let sortedSpanNodes: Node[] = [];

    sortedSpanNodes = spanNodesToUse.sort((a, b) => {
        const aParentId = a.parentId;
        const bParentId = b.parentId;

        // If a is parent of b, a should come before b
        if (a.id === bParentId) return -1;
        // If b is parent of a, b should come before a
        if (b.id === aParentId) return 1;

        // If a has no parent (root), it comes first
        if (!aParentId && bParentId) return -1;
        // If b has no parent (root), it comes first
        if (aParentId && !bParentId) return 1;

        return 0;
    });

    switch (currExpr.type) {
        case 'call': {
            let newExpr: Expression = currExpr;

            // if call is a begin, we need to process its args differently
            // because they are sequential expressions and not nested.
            // A span may start in one arg and end in another, in which case
            // it has to wrap args from the first to the last
            if (currExpr.name === 'begin') {
                let argsExprs: Expression[] = [];

                // for each span, check if it has first and last usage in different args
                for (const spanNode of sortedSpanNodes) {
                    if (startedSpans.has(spanNode.id) && endedSpans.has(spanNode.id)) {
                        // span already started and ended, skip
                        continue;
                    }

                    const firstUsage = findFirstUsageSpan(fullExpr, spanNode.id);
                    const lastUsage = findLastUsageSpan(fullExpr, spanNode.id);

                    // if both first and last usage are in this begin's args (but different ones)
                    // we need to wrap from first to last
                    if (firstUsage && lastUsage) {
                        const firstArgIndex = currExpr.args.findIndex(a => _.isEqual(a, firstUsage));
                        const lastArgIndex = currExpr.args.findIndex(a => _.isEqual(a, lastUsage));

                        if (firstArgIndex === -1 && lastArgIndex === -1) {
                            // span not used in this begin's args,
                            continue;
                        }

                        if ((firstArgIndex === -1 && lastArgIndex !== -1) ||
                            (lastArgIndex !== -1 && firstArgIndex === -1)) {
                            throw new Error(`Inconsistent span usage detection for span ${spanNode.id} in begin call.`);
                        }

                        if (firstArgIndex > lastArgIndex) {
                            throw new Error(`First usage comes after last usage for span ${spanNode.id} in begin call.`);
                        }

                        if (firstArgIndex === lastArgIndex) {
                            // span used only in one arg, process that arg normally with all spans
                            const tArg = generateTir(currExpr.args[firstArgIndex], fullExpr, spanNodesToUse, allSpanNodes, startedSpans, endedSpans);
                            argsExprs.push(tArg);
                            continue;
                        }

                        // only keep spans that have not been started and ended yet
                        startedSpans.add(spanNode.id);
                        endedSpans.add(spanNode.id);
                        const otherSpanNodes = spanNodesToUse.filter(n => !startedSpans.has(n.id) || !endedSpans.has(n.id));

                        // process args before first usage
                        for (let i = 0; i < firstArgIndex; i++) {
                            const tArg = generateTir(currExpr.args[i], fullExpr, otherSpanNodes, allSpanNodes, startedSpans, endedSpans);
                            argsExprs.push(tArg);
                        }

                        // process args from first to last usage with span wrapping
                        const argsToWrap: Expression[] = [];
                        for (let i = firstArgIndex; i <= lastArgIndex; i++) {
                            const tArg = generateTir(currExpr.args[i], fullExpr, otherSpanNodes, allSpanNodes, startedSpans, endedSpans);
                            argsToWrap.push(tArg);
                        }
                        let wrappedArgsExpr: Expression = {
                            type: 'call',
                            name: 'begin',
                            output: false,
                            args: argsToWrap,
                            spanIds: [],
                            activeSpanId: ""
                        } as Call;


                        wrappedArgsExpr = wrapInSpans(wrappedArgsExpr, [spanNode], [spanNode], activeSpanNode ? activeSpanNode : null);
                        argsExprs.push(wrappedArgsExpr);

                        // process args after last usage
                        for (let i = lastArgIndex + 1; i < currExpr.args.length; i++) {
                            const tArg = generateTir(currExpr.args[i], fullExpr, otherSpanNodes, allSpanNodes, startedSpans, endedSpans);
                            argsExprs.push(tArg);
                        }

                    }
                }

                if (argsExprs.length === 0) {
                    // no spans wrapped anything, process all args normally
                    for (const arg of currExpr.args) {
                        const tArg = generateTir(arg, fullExpr, spanNodesToUse, allSpanNodes, startedSpans, endedSpans);
                        argsExprs.push(tArg);
                    }
                }

                newExpr = {
                    ...newExpr,
                    args: argsExprs
                } as Call;

                return newExpr;
            }

            // for non-begin calls, we just recurse into the arguments

            for (const arg of currExpr.args) {
                const tArg = generateTir(arg, fullExpr, spanNodesToUse, allSpanNodes, startedSpans, endedSpans);
                newExpr = {
                    ...newExpr,
                    args: newExpr.args.map(a => _.isEqual(a, arg) ? tArg : a)
                } as Call;
            }

            if (sortedSpanNodes.length === 0) {
                return newExpr;
            }

            // find spans for which this expression is the first usage
            const spanNodesToStart: Node[] = [];
            for (const spanNode of sortedSpanNodes) {
                const firstUsage = _.isEqual(findFirstUsageSpan(fullExpr, spanNode.id), currExpr);
                if (firstUsage) {
                    spanNodesToStart.push(spanNode);
                }
            }

            const spanNodesToEnd: Node[] = [];
            for (const spanNode of [...sortedSpanNodes].reverse()) {
                const lastUsage = _.isEqual(findLastUsageSpan(fullExpr, spanNode.id), currExpr);
                if (lastUsage) {
                    spanNodesToEnd.push(spanNode);
                }
            }

            activeSpanNode = activeSpanNode ? activeSpanNode : (spanNodesToStart.length > 0 ? spanNodesToStart[0] : null);

            for (const spanNode of spanNodesToStart) {
                startedSpans.add(spanNode.id);
            }
            for (const spanNode of spanNodesToEnd) {
                endedSpans.add(spanNode.id);
            }

            return wrapInSpans(newExpr, spanNodesToEnd, spanNodesToStart, activeSpanNode);
        }
        case 'let':
        case 'let*': {
            // what in the let needs to access the span ctx?
            // * if it's both the bindings and the body: wrap the entire let
            // * if it's not the body but multiple bindings: wrap the entire let
            // * if it's only the body: wrap only the body (generateTir on body)
            // * if it's only one binding: wrap only that binding (generateTir on individual bindings)

            // so what we do is:
            // 1. collect all spans that wrap the whole let, i.e. they are used in both bindings and body
            //    or in multiple bindings. Start them before the let, end them after the let
            // 2. collect all spans that are only used in the body: generateTir on body with those spans
            // 3. collect all spans that are only used in individual bindings: generateTir on those bindings

            const spanNodesToWrapLet: Node[] = [];
            const spanNodesToProcessBody: Node[] = [];
            const spanNodesToProcessBindings: Node[] = [];

            for (const spanNode of sortedSpanNodes) {
                let usedInBindings = 0;
                for (const b of currExpr.bindings) {
                    if (findAnyUsageSpan(b.expr, spanNode.id)) {
                        usedInBindings++;
                    }
                }
                const usedInBody = findAnyUsageSpan(currExpr.body, spanNode.id);

                // span is used in bindings and body or in multiple bindings: wrap entire let
                if ((usedInBindings > 0 && usedInBody) || (usedInBindings > 1)) {
                    spanNodesToWrapLet.push(spanNode);

                    // span is used only in body
                } else if (usedInBody) {
                    spanNodesToProcessBody.push(spanNode);

                    // span is used only in one binding
                } else if (usedInBindings === 1) {
                    // find which binding
                    spanNodesToProcessBindings.push(spanNode);
                }
            }

            let newBody = currExpr.body;
            if (spanNodesToProcessBody.length > 0) {
                newBody = generateTir(currExpr.body, fullExpr, spanNodesToProcessBody, allSpanNodes, startedSpans, endedSpans);
            }

            const newBindings = currExpr.bindings.map(b => {
                return {
                    sym: b.sym,
                    expr: generateTir(b.expr, fullExpr, spanNodesToProcessBindings, allSpanNodes, startedSpans, endedSpans)
                };
            });

            let newLetExpr: Expression = {
                ...currExpr,
                body: newBody,
                bindings: newBindings
            } as Let | LetStar;

            activeSpanNode = activeSpanNode ? activeSpanNode : (spanNodesToWrapLet.length > 0 ? spanNodesToWrapLet[0] : null);

            if (spanNodesToWrapLet.length > 0) {
                newLetExpr = wrapInSpans(newLetExpr, spanNodesToWrapLet, spanNodesToWrapLet, activeSpanNode ? activeSpanNode : null);
            }

            return newLetExpr;
        }
        default:
            return currExpr;
    }
}

// uses squashLets to compress nested lets where possible
export function compressTir(expr: Expression): Expression {
    if (!isExprObj(expr)) {
        return expr;
    }

    switch (expr.type) {
        case 'call': {
            let newExpr: Expression = expr;

            for (const arg of expr.args) {
                const cArg = compressTir(arg);
                newExpr = {
                    ...newExpr,
                    args: newExpr.args.map(a => _.isEqual(a, arg) ? cArg : a)
                } as Call;
            }

            return newExpr;
        }
        case 'let':
        case 'let*': {
            let newBody = compressTir(expr.body);
            let newBindings = expr.bindings.map(b => {
                return {
                    sym: b.sym,
                    expr: compressTir(b.expr)
                };
            });

            let newLet = {
                ...expr,
                body: newBody,
                bindings: newBindings
            } as Let | LetStar;

            let compressedLet = newLet;
            if (isLetLike(newBody)) {
                // squash the body let into this let
                compressedLet = squashLets(newLet, newBody);
            }

            return compressedLet;
        }
        default:
            return expr;
    }
}