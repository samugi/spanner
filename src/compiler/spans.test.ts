
import { describe, it, expect } from 'vitest'
import type { Edge, Node } from 'reactflow'
import { computeNodesAfterCreateSpan } from './spans'

describe('computeNodesAfterCreateSpan', () => {

    it('moves selected nodes into the new span', () => {
        const nodes = [
            { id: 'a', type: 'expr', position: { x: 100, y: 100 } },
            { id: 'b', type: 'expr', position: { x: 200, y: 200 } },
        ] as Node[]

        const selected = [nodes[0]]

        const result = computeNodesAfterCreateSpan(
            nodes,
            [],
            selected,
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
            [],
            [nodes[0]],
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
            [],
            nodes,
            'span-1',
            'test'
        )

        const span = result.find(n => n.id === 'span-1')!
        expect(span.position).toEqual({ x: 60, y: 110 })
    })

    it('reparents child spans when reachable from selected nodes', () => {
        const nodes = [
            { id: 'a', type: 'expr', position: { x: 0, y: 0 }, parentId: 'span-old-parent' },
            { id: 'b', type: 'expr', position: { x: 0, y: 0 }, parentId: 'span-old-parent' },
            { id: 'c', type: 'expr', position: { x: 0, y: 0 } },
            { id: 'd', type: 'expr', position: { x: 0, y: 0 }, parentId: 'span-old-child' },

            // spans
            { id: 'span-old-parent', type: 'span', position: { x: 0, y: 0 }, data: { name: 'old-1', kind: 'span', wrappedNodeIds: ['a', 'b', 'd'] } },
            { id: 'span-old-child', type: 'span', position: { x: 0, y: 0 }, data: { name: 'old-2', kind: 'span', wrappedNodeIds: ['d'] }, parentId: 'span-old-parent' },
        ] as Node[]

        const edges: Edge[] = [
            { id: 'e1', source: 'b', target: 'a' },
            { id: 'e2', source: 'a', target: 'c' },
        ] as Edge[]

        const result = computeNodesAfterCreateSpan(
            nodes,
            edges,
            [nodes[0], nodes[3]], // selecting `a` and `d`
            'span-new',
            'new'
        )

        // span-new should have span-old-parent as parent
        expect(result.find(n => n.id === 'span-new')!.parentId)
            .toBe('span-old-parent')
        // span-old-parent should remain the root span
        expect(result.find(n => n.id === 'span-old-parent')!.parentId)
            .toBeUndefined()
        // `b` should remain in span-old-parent
        expect(result.find(n => n.id === 'b')!.parentId)
            .toBe('span-old-parent')
        // `a` should be in span-new
        expect(result.find(n => n.id === 'a')!.parentId)
            .toBe('span-new')
        // `d` should be in span-new
        expect(result.find(n => n.id === 'd')!.parentId)
            .toBe('span-new')
        // span-old-child should now be child of span-new
        expect(result.find(n => n.id === 'span-old-child')!.parentId)
            .toBe('span-new')
    })
})
