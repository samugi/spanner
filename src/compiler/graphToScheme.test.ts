import { describe, it, expect } from 'vitest'
import type { Node, Edge } from 'reactflow'
import { generateProgram } from './graphToScheme'
import type { Span } from './types'

function normalizeScheme(code: string): string {
    return code
        // remove newlines
        .replace(/\n/g, ' ')

        // remove spaces after '('
        .replace(/\(\s+/g, '(')

        // remove spaces before ')'
        .replace(/\s+\)/g, ')')

        // collapse multiple spaces into one
        .replace(/\s+/g, ' ')

        // trim leading/trailing space
        .trim()
}

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
            { id: '2', type: 'expr', data: { kind: 'call', name: 'display', n_args: 1 }, position: { x: 0, y: 0 }, parentId: 'span-1' },
            { id: 'span-1', type: 'span', data: {}, position: { x: 0, y: 0 } },
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

describe('generateProgram – spans + dataflow', () => {
    it('adds two literals, then displays the result, with separate spans', () => {
        const nodes: Node[] = [
            {
                id: 'lit1',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: 1 },
            },
            {
                id: 'lit2',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: 2 },
            },
            {
                id: 'sum',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'call', name: '+', n_args: 2 },
                parentId: 'span-sum',
            },
            {
                id: 'display',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'call', name: 'display', n_args: 1 },
                parentId: 'span-display',
            },
            {
                id: 'span-sum',
                type: 'span',
                position: { x: 0, y: 0 },
                data: {},
            },
            {
                id: 'span-display',
                type: 'span',
                position: { x: 0, y: 0 },
                data: {},
                parentId: 'span-sum',
            }
        ]

        const edges: Edge[] = [
            // literals -> sum (data)
            {
                id: 'e1',
                source: 'lit1',
                target: 'sum',
                sourceHandle: 'value',
                targetHandle: 'arg-0',
                data: { kind: 'data' },
            },
            {
                id: 'e2',
                source: 'lit2',
                target: 'sum',
                sourceHandle: 'value',
                targetHandle: 'arg-1',
                data: { kind: 'data' },
            },

            // sum -> display (data)
            {
                id: 'e3',
                source: 'sum',
                target: 'display',
                sourceHandle: 'value',
                targetHandle: 'arg-0',
                data: { kind: 'data' },
            },
        ]

        const spans: Span[] = [
            {
                id: 'span-sum',
                name: 'sum-span',
                nodeIds: ['sum'],
            },
            {
                id: 'span-display',
                name: 'display-span',
                nodeIds: ['display'],
            },
        ]

        const program = generateProgram(
            nodes,
            edges,
            spans
        )

        // ---- Assertions ----

        expect(normalizeScheme(program)).toBe(normalizeScheme(`
            (let ((p-lit2 2))
                (let ((p-lit1 1))
                    (let ((cx-span-sum (start-span "sum-span" none)))
                        (begin
                            (let ((p-sum (+ p-lit1 p-lit2)))
                                (let ((cx-span-display (start-span "display-span" cx-span-sum)))
                                    (begin
                                        (let ((p-display (display p-sum))) p-display)
                                        (end-span cx-span-display)
                                    )
                                )
                            )
                            (end-span cx-span-sum)
                        )
                    )
                )
            )`))
    })
})
