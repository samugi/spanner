import { describe, it, expect } from 'vitest'
import type { Node, Edge } from 'reactflow'
import { generateProgram } from './compile'


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
    it('generates using let', () => {
        const nodes: Node[] = [
            { id: '1', type: 'expr', data: { kind: 'literal', value: 1 }, position: { x: 0, y: 0 } },
            { id: '2', type: 'expr', data: { kind: 'literal', value: 2 }, position: { x: 0, y: 0 } },
            { id: '3', type: 'expr', data: { kind: 'call', name: '+', n_args: 2 }, position: { x: 0, y: 0 } },
        ]

        const edges: Edge[] = [
            { id: 'e1', source: '1', target: '3', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e2', source: '2', target: '3', sourceHandle: 'value', targetHandle: 'arg-1', data: { kind: 'data' } },
        ]

        const program = generateProgram(nodes, edges)

        expect(normalizeScheme(program)).toContain(normalizeScheme('(+ 1 2)'))
    })

    it('generates using let*', () => {
        const nodes: Node[] = [
            { id: '1', type: 'expr', data: { kind: 'literal', value: '1', name: 'Literal 1' }, position: { x: 0, y: 0 } },
            { id: '2', type: 'expr', data: { kind: 'literal', value: '2', name: 'Literal 2' }, position: { x: 0, y: 0 } },
            { id: '3', type: 'expr', data: { kind: 'call', name: '+', n_args: 2, output: true }, position: { x: 0, y: 0 } },
            { id: '4', type: 'expr', data: { kind: 'call', name: '+', n_args: 2, output: true }, position: { x: 0, y: 0 } },
            { id: '6', type: 'expr', data: { kind: 'call', name: '+', n_args: 2, output: true }, position: { x: 0, y: 0 } },
        ];

        const edges: Edge[] = [
            { id: 'e1', source: '1', target: '3', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e2', source: '2', target: '3', sourceHandle: 'value', targetHandle: 'arg-1', data: { kind: 'data' } },
            { id: 'e3', source: '3', target: '4', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e4', source: '2', target: '4', sourceHandle: 'value', targetHandle: 'arg-1', data: { kind: 'data' } },
            { id: 'e5', source: '3', target: '6', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e6', source: '4', target: '6', sourceHandle: 'value', targetHandle: 'arg-1', data: { kind: 'data' } },
        ];

        const program = generateProgram(nodes, edges);

        // The UI output nests the calls directly because every node's value is consumed
        expect(normalizeScheme(program)).toContain(
            normalizeScheme('(let* ((p-2 2) (p-3 (+ 1 p-2))) (+ p-3 (+ p-3 p-2)))')
        );
    });

    it('wraps calls in spans', () => {
        const nodes: Node[] = [
            { id: '1', type: 'expr', data: { kind: 'literal', value: 1 }, position: { x: 0, y: 0 } },
            { id: '2', type: 'expr', data: { kind: 'call', name: 'display', n_args: 1 }, position: { x: 0, y: 0 }, parentId: 'span-1' },
            { id: 'span-1', type: 'span', data: { name: 'my-span' }, position: { x: 0, y: 0 } },
        ]

        const edges: Edge[] = [
            { id: 'e1', source: '1', target: '2', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' } },
        ]

        const program = generateProgram(nodes, edges)

        expect(normalizeScheme(program)).toContain('start-span "my-span"')
        expect(normalizeScheme(program)).toContain('end-span')
    })
})

describe('generateProgram: spans + dataflow', () => {
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
                id: 'display2',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'call', name: 'display', n_args: 1 },
            },
            {
                id: 'span-sum',
                type: 'span',
                position: { x: 0, y: 0 },
                data: { name: 'sum-span' },
            },
            {
                id: 'span-display',
                type: 'span',
                position: { x: 0, y: 0 },
                data: { name: 'display-span' },
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
            // display -> display2 (flow)
            {
                id: 'e4',
                source: 'display',
                target: 'display2',
                sourceHandle: 'flow-out',
                targetHandle: 'flow-in',
                data: { kind: 'flow' },
            },
            // literals -> display2 (data)
            {
                id: 'e5',
                source: 'lit2',
                target: 'display2',
                sourceHandle: 'value',
                targetHandle: 'arg-0',
                data: { kind: 'data' },
            },
        ]

        const program = generateProgram(
            nodes,
            edges
        )

        // ---- Assertions ----
        expect(normalizeScheme(program)).toBe(normalizeScheme(`(let ((p-lit2 2) (cx-span-sum (start-span "sum-span" cx-none))) (begin (let ((cx-span-display (start-span "display-span" cx-span-sum))) (begin (begin (display (+ 1 p-lit2)) (display p-lit2)) (end-span cx-span-display))) (end-span cx-span-sum)))`))
    })

    it('computes if condition correctly', () => {
        const nodes: Node[] = [
            {
                id: "0",
                position: { x: 0, y: 0 },
                data: {
                    kind: "literal",
                    value: 1,
                    name: "Literal 1"
                },
                type: "expr",
            },
            {
                id: "2",
                position: { x: 0, y: 0 },
                data: {
                    kind: "literal",
                    value: 3,
                    name: "Literal 3"
                },
            },
            {
                id: "3",
                position: { x: 0, y: 0 },
                data: {
                    kind: "call",
                    name: ">",
                    n_args: 2,
                    output: true
                },
                type: "expr",
            },
            {
                id: "4",
                position: { x: 0, y: 0 },
                data: {
                    kind: "if",
                    name: "if"
                },
                type: "if",
            },
            {
                id: "5",
                position: { x: 0, y: 0 },
                data: {
                    kind: "literal",
                    value: "\"foo\"",
                    name: "Literal \"foo\""
                },
                type: "expr",
            },
            {
                id: "7",
                position: { x: 0, y: 0 },
                data: {
                    kind: "literal",
                    value: "\"bar\"",
                    name: "Literal \"bar\""
                },
                type: "expr",
            },
            {
                id: "9",
                position: { x: 0, y: 0 },
                data: {
                    kind: "call",
                    name: "display",
                    n_args: 1,
                    output: false
                },
                type: "expr",
            },
            {
                id: "10",
                position: { x: 0, y: 0 },
                data: {
                    kind: "call",
                    name: "display",
                    n_args: 1,
                    output: false
                },
                type: "expr",
            }
        ]

        const edges: Edge[] = [
            {
                source: "2",
                sourceHandle: "value",
                target: "3",
                targetHandle: "arg-0",
                data: {
                    kind: "data"
                },
                id: "reactflow__edge-2value-3arg-0",
                selected: false
            },
            {
                source: "0",
                sourceHandle: "value",
                target: "3",
                targetHandle: "arg-1",
                data: {
                    kind: "data"
                },
                id: "reactflow__edge-0value-3arg-1"
            },
            {
                source: "3",
                sourceHandle: "value",
                target: "4",
                targetHandle: "cond",
                data: {
                    kind: "data"
                },
                id: "reactflow__edge-3value-4cond"
            },
            {
                source: "5",
                sourceHandle: "value",
                target: "9",
                targetHandle: "arg-0",
                data: {
                    kind: "data"
                },
                id: "reactflow__edge-5value-9arg-0"
            },
            {
                source: "7",
                sourceHandle: "value",
                target: "10",
                targetHandle: "arg-0",
                data: {
                    kind: "data"
                },
                id: "reactflow__edge-7value-10arg-0"
            },
            {
                source: "9",
                sourceHandle: "flow-out",
                target: "4",
                targetHandle: "then",
                data: {
                    kind: "control",
                    branch: "then"
                },
                id: "reactflow__edge-9flow-out-4then"
            },
            {
                source: "10",
                sourceHandle: "flow-out",
                target: "4",
                targetHandle: "else",
                data: {
                    kind: "control",
                    branch: "else"
                },
                id: "reactflow__edge-10flow-out-4else"
            }
        ]

        const program = generateProgram(
            nodes,
            edges
        )

        // ---- Assertions ----
        expect(normalizeScheme(program)).toBe(normalizeScheme(`
        (if (> 3 1) (display "foo") (display "bar"))
        `))
    })

    it('wraps only the then-branch of an if in a span', () => {
        const nodes: Node[] = [
            {
                id: 'span-11',
                type: 'span',
                position: { x: 0, y: 0 },
                data: { name: 'sda' },
            },
            {
                id: '0',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: '1' },
            },
            {
                id: '2',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: '3' },
            },
            {
                id: '3',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'call', name: '>', n_args: 2, output: true },
            },
            {
                id: '4',
                type: 'if',
                position: { x: 0, y: 0 },
                data: { kind: 'if', name: 'if' },
            },
            {
                id: '5',
                type: 'expr',
                position: { x: 0, y: 0 },
                parentId: 'span-11',
                data: { kind: 'literal', value: '"foo"' },
            },
            {
                id: '7',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: '"bar"' },
            },
            {
                id: '9',
                type: 'expr',
                position: { x: 0, y: 0 },
                parentId: 'span-11',
                data: { kind: 'call', name: 'display', n_args: 1, output: false },
            },
            {
                id: '10',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'call', name: 'display', n_args: 1, output: false },
            },
        ]

        const edges: Edge[] = [
            { id: 'e1', source: '2', target: '3', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e2', source: '0', target: '3', sourceHandle: 'value', targetHandle: 'arg-1', data: { kind: 'data' } },
            { id: 'e3', source: '3', target: '4', sourceHandle: 'value', targetHandle: 'cond', data: { kind: 'data' } },

            { id: 'e4', source: '5', target: '9', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e5', source: '7', target: '10', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' } },

            { id: 'e6', source: '9', target: '4', sourceHandle: 'flow-out', targetHandle: 'then', data: { kind: 'control' } },
            { id: 'e7', source: '10', target: '4', sourceHandle: 'flow-out', targetHandle: 'else', data: { kind: 'control' } },
        ]

        const program = generateProgram(nodes, edges)

        expect(normalizeScheme(program)).toBe(
            normalizeScheme(`
(if
  (> 3 1)
  (let ((cx-span-11 (start-span "sda" cx-none)))
    (begin
      (display "foo")
      (end-span cx-span-11)
    )
  )
  (display "bar")
)
        `)
        )
    })

})
