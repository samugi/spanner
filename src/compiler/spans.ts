import type { Node, Edge } from 'reactflow'
import type { Span } from './types'

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

export function computeNodesAfterCreateSpan(
    ns: Node[],
    selected: Node[],
    spans: Span[],
    edges: Edge[],
    newSpanId: string,
    name: string
): Node[] {
    const selectedIds = new Set(selected.map(n => n.id))

    const spanX = Math.min(...selected.map(n => n.position.x)) - 40
    const spanY = Math.min(...selected.map(n => n.position.y)) - 40

    // find the parent span of the new span, if any
    const parentSpan = spans.find(span =>
        dependsOn(new Set(span.nodeIds), selectedIds, edges)
    )

    // find the child spans that need to be reparented
    const childSpanIds = new Set(
        spans
            .filter(s => dependsOn(selectedIds, new Set(s.nodeIds), edges))
            .map(s => s.id)
    )

    const newSpanNode: Node = {
        id: newSpanId,
        type: 'span',
        position: { x: spanX, y: spanY },
        parentId: parentSpan?.id,
        data: { name },
        style: { width: 300, height: 200 },
    }

    return [
        newSpanNode,
        ...ns.map(n => {
            // Move selected nodes into new span
            if (selectedIds.has(n.id)) {
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

