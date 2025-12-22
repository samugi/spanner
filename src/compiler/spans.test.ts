
import { describe, it, expect } from 'vitest'
import type { Edge, Node } from 'reactflow'
import { computeNodesAfterCreateSpan } from './spans'
import type { Span } from './types'

describe('computeNodesAfterCreateSpan', () => {

    it('moves selected nodes into the new span', () => {
        const nodes = [
            { id: 'a', type: 'expr', position: { x: 100, y: 100 } },
            { id: 'b', type: 'expr', position: { x: 200, y: 200 } },
        ] as Node[]

        const selected = [nodes[0]]

        const result = computeNodesAfterCreateSpan(
            nodes,
            selected,
            [],
            [],
            'span-1',
            'test'
        )

        const moved = result.find(n => n.id === 'a')!
        expect(moved.parentId).toBe('span-1')
        expect(moved.extent).toBe('parent')
    })

    it('does not modify non-selected nodes', () => {
        const nodes = [
            { id: 'a', type: 'expr', position: { x: 0, y: 0 } },
            { id: 'b', type: 'expr', position: { x: 10, y: 10 } },
        ] as Node[]

        const result = computeNodesAfterCreateSpan(
            nodes,
            [nodes[0]],
            [],
            [],
            'span-1',
            'test'
        )

        expect(result.find(n => n.id === 'b')!.parentId).toBeUndefined()
    })

    it('positions the new span based on selected nodes', () => {
        const nodes = [
            { id: 'a', type: 'expr', position: { x: 100, y: 150 } },
            { id: 'b', type: 'expr', position: { x: 200, y: 300 } },
        ] as Node[]

        const result = computeNodesAfterCreateSpan(
            nodes,
            nodes,
            [],
            [],
            'span-1',
            'test'
        )

        const span = result.find(n => n.id === 'span-1')!
        expect(span.position).toEqual({ x: 60, y: 110 })
    })

    it('reparents child spans when reachable from selected nodes', () => {
        const nodes = [
            { id: 'a', type: 'expr', position: { x: 0, y: 0 } },
            { id: 'b', type: 'expr', position: { x: 0, y: 0 }, parentId: 'span-old' },
            { id: 'span-old', type: 'span', position: { x: 0, y: 0 } },
        ] as Node[]

        const spans: Span[] = [
            { id: 'span-old', name: 'old', nodeIds: ['b'] },
            { id: 'span-new', name: 'new', nodeIds: ['a'] },
        ]

        const edges: Edge[] = [
            { id: 'e1', source: 'b', target: 'a' },
        ] as Edge[]

        const result = computeNodesAfterCreateSpan(
            nodes,
            [nodes[0]], // selecting `a`
            spans,
            edges,
            'span-new',
            'new'
        )

        expect(result.find(n => n.id === 'span-new')!.parentId)
            .toBe('span-old')
        expect(result.find(n => n.id === 'span-old')!.parentId)
            .toBeUndefined()
        expect(result.find(n => n.id === 'b')!.parentId)
            .toBe('span-old')
        expect(result.find(n => n.id === 'a')!.parentId)
            .toBe('span-new')
    })
})
