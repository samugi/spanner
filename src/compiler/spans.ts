import type { Node, Edge } from 'reactflow'
import type { SpanNode } from '../types'

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

    const parentSpan = nodes.find(spanNode => {
        if (spanNode.type !== 'span') return false

        // nodes already inside this span
        const spanChildIds = new Set(
            nodes
                .filter(n => n.parentId === spanNode.id)
                .map(n => n.id)
        )

        // case 1: direct dependency
        if (dependsOn(spanChildIds, wrappedNodeIds, edges)) {
            return true
        }

        // case 2: wrapped nodes are fed by if/cond nodes
        const ifCondNodeIds = findUpstreamIfCond(wrappedNodeIds, nodes, edges)

        if (ifCondNodeIds.size > 0 &&
            dependsOn(spanChildIds, ifCondNodeIds, edges)) {
            return true
        }
    })

    // find the child spans that need to be reparented
    const childSpanIds = new Set(
        nodes
            .filter(s =>
                s.type === 'span' &&
                dependsOn(
                    wrappedNodeIds,
                    new Set(
                        nodes
                            .filter(n => n.parentId === s.id)
                            .map(n => n.id)
                    ),
                    edges
                )
            )
            .map(s => s.id)
    )
    const spanX = Math.min(...newSpanWraps.map(n => n.position.x)) - 40
    const spanY = Math.min(...newSpanWraps.map(n => n.position.y)) - 40
    const newSpanNode: SpanNode = {
        id: newSpanId,
        type: 'span',
        position: { x: spanX, y: spanY },
        parentId: parentSpan?.id,
        data: { name: newSpanName, kind: 'span' },
        style: { width: 300, height: 200 },
    }

    return [
        newSpanNode,
        ...nodes.map(n => {
            // Move selected nodes into new span
            if (wrappedNodeIds.has(n.id)) {
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
