import { describe, it, expect } from 'vitest'
import type { Node, Edge } from 'reactflow'
import { generateProgram, type Span } from './graphToScheme'

describe('graph → scheme compiler', () => {
    it('generates (+ 1 2)', () => {
        const nodes: Node[] = [
            { id: '1', type: 'expr', data: { kind: 'literal', value: 1 }, position: { x: 0, y: 0 } },
            { id: '2', type: 'expr', data: { kind: 'literal', value: 2 }, position: { x: 0, y: 0 } },
            { id: '3', type: 'expr', data: { kind: 'call', name: '+', n_args: 2 }, position: { x: 0, y: 0 } },
        ]

        const edges: Edge[] = [
            { id: 'e1', source: '1', target: '3', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e2', source: '2', target: '3', sourceHandle: 'value', targetHandle: 'arg-1', data: { kind: 'data' } },
        ]

        const spans: Span[] = []

        const program = generateProgram(nodes, edges, spans)

        expect(program).toContain('(let (( p-2 2 )) (let (( p-1 1 )) (let (( p-3 (+ p-1 p-2 ))) p-3 ) ) )')
    })

    it('wraps calls in spans', () => {
        const nodes: Node[] = [
            { id: '1', type: 'expr', data: { kind: 'literal', value: 1 }, position: { x: 0, y: 0 } },
            { id: '2', type: 'expr', data: { kind: 'call', name: 'print', n_args: 1 }, position: { x: 0, y: 0 }, parentId: 'span-1' },
        ]

        const edges: Edge[] = [
            { id: 'e1', source: '1', target: '2', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' } },
        ]

        const spans: Span[] = [
            { id: 'span-1', name: 'my-span', nodeIds: ['2'] },
        ]

        const program = generateProgram(nodes, edges, spans)

        expect(program).toContain('start-span "my-span"')
        expect(program).toContain('end-span')
    })
})
