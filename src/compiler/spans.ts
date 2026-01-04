import type { Node, Edge } from 'reactflow'
import type { SpanNode } from '../types'
import type { Call, EndSpan, Expression, LetStar, StartSpan, Symbol } from './types'
import { newCxSymbol, newParamSymbol } from './spec'

// whether any node in targetIds depends on any node in sourceIds
function dependsOn(
    sourceIds: Set<string>,
    targetIds: Set<string>,
    edges: Edge[]
): boolean {
    const toVisit = [...targetIds]
    const visited = new Set<string>()

    while (toVisit.length) {
        const current = toVisit.pop()!
        if (visited.has(current)) continue
        visited.add(current)
        if (sourceIds.has(current)) return true

        for (const e of edges) {
            if (e.target === current && !visited.has(e.source)) {
                toVisit.push(e.source)
            }
        }
    }

    return false
}

export function wrapInSpan(spanNode: Node, nodes: Node[], expr: Expression | null, previous: Expression | null, lastNodeSymbol: Symbol | null): Expression {
    let parentSpan = spanNode.parentId ? nodes.find(n => n.id === spanNode.parentId) : null;
    let incomingCx = parentSpan ? parentSpan.id : null;
    let incomingCxSym = incomingCx ? newCxSymbol(incomingCx) : { id: 'telemetry_context::none)', prefix: '(option::stdlib' };

    let outgoingCx = spanNode.id
    // TODO: are we ok with the returned symbol being the last node symbol?
    let retSymbol = lastNodeSymbol ? lastNodeSymbol : newParamSymbol(`ret-${spanNode.id}`);

    // TODO: if the current span is parent of the previous, it should be ended after
    // the previous expression, not before
    let callBodyArgs: Call['args'] = [
        {
            type: 'end-span',
            context: { type: 'var', sym: newCxSymbol(outgoingCx) }
        } as EndSpan
    ];
    if (previous !== null) {
        callBodyArgs.push(previous);
    }
    callBodyArgs.push({ type: 'var', sym: retSymbol });


    let spanExpr: Expression = {
        type: 'let*',
        bindings: [
            {
                sym: newCxSymbol(outgoingCx),
                expr: {
                    type: 'start-span',
                    spanName: spanNode.data.name,
                    context: { type: 'var', sym: incomingCxSym }
                } as StartSpan
            },
            {
                sym: retSymbol,
                expr: expr!
            }
        ],
        body: {
            type: 'call',
            name: 'begin',
            args: callBodyArgs
        } as Call
    } as LetStar;

    return spanExpr;
}

function findUpstreamIfCond(
    startIds: Set<string>,
    nodes: Node[],
    edges: Edge[]
): Set<string> {
    const result = new Set<string>()
    const queue = [...startIds]
    const visited = new Set<string>()

    while (queue.length > 0) {
        const id = queue.shift()!
        if (visited.has(id)) continue
        visited.add(id)

        const node = nodes.find(n => n.id === id)
        if (!node) continue

        if (node.type === 'if' || node.type === 'cond') {
            result.add(id)
            continue // stop walking past control nodes
        }

        // walk upstream (sources feeding this node)
        edges
            .filter(e => e.target === id)
            .forEach(e => queue.push(e.source))
    }

    return result
}


export function computeNodesAfterCreateSpan(
    nodes: Node[],
    edges: Edge[],
    newSpanWraps: Node[],
    newSpanId: string,
    newSpanName: string
): Node[] {
    const wrappedNodeIds = new Set(newSpanWraps.map(n => n.id))

    // TODO change logic: parent span is the "closest" span that includes at least all the nodes wrapped by the new span
    // i.e. the one with smallest scope among those with wider scope than the new span
    let parents = nodes.filter(n => {
        if (n.type !== 'span') return false;
        if (n.id === newSpanId) return false;
        // check if all wrapped nodes are also wrapped by this span
        let wrappedByParent = n.data.wrappedNodeIds || [];
        return newSpanWraps.every(n => wrappedByParent.includes(n.id));
    })
    // pick the parent span that wraps the least nodes
    let parentSpan: Node | null = parents.reduce((best, current) => {
        let bestWrapped = best.data.wrappedNodeIds.length;
        let currentWrapped = current.data.wrappedNodeIds.length;
        return currentWrapped < bestWrapped ? current : best;
    }, parents[0]) || null;

    // find the child spans that need to be reparented
    // TODO: child spans are those that are fully contained in the new span
    // we update them only if they did not have a parent before or if their parent was the parent of the new span (the one we just found)
    const childSpanIds = new Set(nodes.filter(n => {
        if (n.type !== 'span') return false;
        if (n.id === newSpanId) return false;

        // check if the span depends only on nodes inside the new span
        const wrapped = n.data.wrappedNodeIds || [];
        return wrapped.every((nId: string) => newSpanWraps.map(n => n.id).includes(nId));
    }).map(n => n.id));

    const spanX = Math.min(...newSpanWraps.map(n => n.position.x)) - 40
    const spanY = Math.min(...newSpanWraps.map(n => n.position.y)) - 40
    const newSpanNode: SpanNode = {
        id: newSpanId,
        type: 'span',
        position: { x: spanX, y: spanY },
        parentId: parentSpan?.id,
        data: { name: newSpanName, kind: 'span', wrappedNodeIds: Array.from(wrappedNodeIds) },
        style: { width: 300, height: 200 },
    }

    // we only reparent nodes that were in the parent and are now in the new span
    // or that were in no span and are now in the new span
    const toReparent = new Set<string>()
    wrappedNodeIds.forEach(id => {
        const node = nodes.find(n => n.id === id)
        if (!node) throw new Error(`Node with id ${id} not found`)
        if (node.parentId === parentSpan?.id || node.parentId === undefined) {
            toReparent.add(id)
        }
    })

    return [
        newSpanNode,
        ...nodes.map(n => {
            // Move selected nodes into new span
            if (toReparent.has(n.id)) {
                return {
                    ...n,
                    parentId: newSpanId,
                    extent: 'parent' as const,
                    position: {
                        x: n.position.x - spanX,
                        y: n.position.y - spanY,
                    },
                }
            }

            // Reparent child spans
            if (n.type === 'span' && childSpanIds.has(n.id)) {
                return {
                    ...n,
                    parentId: newSpanId,
                }
            }

            return n
        }),
    ]
}
