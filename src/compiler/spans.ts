import type { Node, Edge } from 'reactflow'
import type { SpanNode } from '../types'
import type { Call, EndSpan, Expression, Let, StartSpan } from './types'
import { newCxSymbol, newParamSymbol, newRetSymbol } from './spec'

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
        if (sourceIds.has(current)) return true
        visited.add(current)

        for (const e of edges) {
            if (e.target === current && !visited.has(e.source)) {
                toVisit.push(e.source)
            }
        }
    }

    return false
}

export function wrapInSpanIfNeeded(nodes: Node[], visited: Set<string>, expr: Expression, nodeSpan: Node): Expression {
    // Span wrapping:
    const nodesWrappedBySpan = nodes.filter(n => n.type === 'expr' && n.parentId === nodeSpan?.id);
    // if all nodes in the span have been visited it means we are at the root of the span
    if (nodesWrappedBySpan.every((n: Node) => visited.has(n.id))) {
        // if the span has a parent, we need to pass the parent context
        let spanNode = nodes.find(n => n.id === nodeSpan.id)!;
        if (spanNode == undefined) {
            throw new Error(`Span node with id ${nodeSpan.id} not found`);
        }
        let parentSpan = spanNode.parentId ? nodes.find(n => n.id === spanNode.parentId) : null;
        let incomingCx = parentSpan ? parentSpan.id : 'none'

        // wrap the call_expr in the span
        let outgoingCx = nodeSpan.id
        let retSymbol = newRetSymbol();

        // a Span is just a Let that starts a span, runs some code, then ends the span
        expr = {
            type: 'let',
            bindings: [
                {
                    sym: newCxSymbol(outgoingCx),
                    expr: {
                        type: 'start-span',
                        spanName: nodeSpan.data.name,
                        context: { type: 'var', sym: newCxSymbol(incomingCx) }
                    } as StartSpan
                },
                {
                    sym: retSymbol,
                    expr: expr
                }
            ],
            body: {
                type: 'call',
                name: 'begin',
                args: [
                    {
                        type: 'end-span',
                        context: { type: 'var', sym: newCxSymbol(outgoingCx) }
                    } as EndSpan,
                    { type: 'var', sym: retSymbol }
                ]
            } as Call
        } as Let;
    }
    return expr;
}

export function computeNodesAfterCreateSpan(
    nodes: Node[],
    edges: Edge[],
    newSpanWraps: Node[],
    newSpanId: string,
    newSpanName: string
): Node[] {
    const wrappedNodesIds = new Set(newSpanWraps.map(n => n.id))
    // find the parent span of the new span, if any
    const parentSpan = nodes.find(spanNode =>
        // filter span nodes
        spanNode.type === 'span' &&
        // where there is a dependency between the nodes wrapped by the new
        // span and the nodes wrapped by this span
        dependsOn(new Set(
            nodes.find(n => n.parentId === spanNode.id)?.id
        ), wrappedNodesIds, edges)
    )
    // find the child spans that need to be reparented
    const childSpanIds = new Set(
        nodes
            .filter(spanNode =>
                spanNode.type === 'span' &&
                dependsOn(wrappedNodesIds, new Set(
                    nodes.find(n => n.parentId === spanNode.id)?.id
                ), edges))
            .map(s => s.id)
    )
    const spanX = Math.min(...newSpanWraps.map(n => n.position.x)) - 40
    const spanY = Math.min(...newSpanWraps.map(n => n.position.y)) - 40
    const newSpanNode: SpanNode = {
        id: newSpanId,
        type: 'span',
        position: { x: spanX, y: spanY },
        parentId: parentSpan?.id,
        data: { name: newSpanName },
        style: { width: 300, height: 200 },
    }

    return [
        newSpanNode,
        ...nodes.map(n => {
            // Move selected nodes into new span
            if (wrappedNodesIds.has(n.id)) {
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
