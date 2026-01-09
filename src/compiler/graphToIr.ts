// Generate intermediate representation
// this depends on other nodes and edges as well because depending on the node's
// inputs/outputs it may have to be generated differently (with/without lets, etc)
//

import type { Node, Edge } from 'reactflow'
import { type Expression, type Let, type Call, type Symbol, isExprObj, isLetLike, type LetStar, type VarRef, type EndSpan, type StartSpan, isTraceableExpr } from './types'
import _, { find } from 'lodash';
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

                // If we can't expand in previous, we need to create a new outer scope
                const squashed =
                    // if previous is a let-like, we can squash the literal into it
                    isLetLike(previous) && squashLets(previous, nodeOutSymbol, node.data.value)
                    // else create a new let
                    || {
                        type: 'let',
                        bindings: [{ sym: nodeOutSymbol, expr: node.data.value }],
                        body: previous,
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

            let ifExpr: Expression = {
                type: 'call',
                name: 'if',
                args: [
                    { type: 'var', sym: condSym },
                    thenExpr,
                    elseExpr
                ],
                output: false,
                spanIds: allSpanNodes.filter(sn => sn.data.wrappedNodeIds.includes(node.id))?.map(sn => sn.id) || null,
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

// TODO: we need a check that there are no cross-flow dependencies: error out
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



// recursively finds expressions that have an active span (spanId)
// starts every span before the first expression that uses it
// ends every span after the last expression that uses it
export function generateTir(currExpr: Expression, fullExpr: Expression, allNodes: Node[]): Expression {
    if (!isExprObj(currExpr) || !isTraceableExpr(currExpr)) {
        return currExpr;
    }

    let spanIds = currExpr.spanIds ? currExpr.spanIds : null;
    let spanNodes = spanIds ? allNodes.filter(n => spanIds.includes(n.id)) : null;
    let activeSpanId = currExpr.activeSpanId ? currExpr.activeSpanId : null;
    let activeSpanNode = activeSpanId ? allNodes.find(n => n.id === activeSpanId) : null;

    switch (currExpr.type) {
        case 'call': {
            for (const arg of currExpr.args) {
                const tArg = generateTir(arg, fullExpr, allNodes);
                currExpr = {
                    ...currExpr,
                    args: currExpr.args.map(a => a === arg ? tArg : a)
                } as Call;
            }

            if (!spanIds) {
                return currExpr;
            }
            if (!spanNodes || spanNodes.some(n => n.data.kind !== 'span')) {
                throw new Error(`Span node not found for some ids: ${spanIds}`);
            }

            const sortedSpanNodes = spanNodes.sort((a, b) => {
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
                currExpr = {
                    type: 'let',
                    bindings: [
                        {
                            sym: prevSym,
                            expr: currExpr
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
                // currExpr = {
                //     type: 'call',
                //     name: 'begin',
                //     output: currExpr.type === 'call' && currExpr.output ? true : false,
                //     args: [
                //         currExpr,
                //         ...endSpanCalls
                //     ],
                //     spanIds: [],
                //     activeSpanId: ""
                // };
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
                currExpr = {
                    type: 'let',
                    bindings: startSpanBindings,
                    body: currExpr,
                    spanIds: [],
                    activeSpanId: ""
                }
            }

            return currExpr;
        }
        case 'let':
        case 'let*': {
            for (const b of currExpr.bindings) {
                const tExpr = generateTir(b.expr, fullExpr, allNodes);
                currExpr = {
                    ...currExpr,
                    bindings: currExpr.bindings.map(bind => bind === b ? { ...bind, expr: tExpr } : bind)
                } as Let | LetStar;
            }
            const tBody = generateTir(currExpr.body, fullExpr, allNodes);
            currExpr = {
                ...currExpr,
                body: tBody
            } as Let | LetStar;
            return currExpr;
        }
        default:
            return currExpr;
    }
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
