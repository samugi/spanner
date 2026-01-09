import { describe, it, expect } from 'vitest'
import type { Node, Edge } from 'reactflow'
import { generateProgram } from './compile'
import { wrap } from 'lodash'


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
            { id: 'span-1', type: 'span', data: { name: 'my-span', kind: 'span', wrappedNodeIds: ['2'] }, position: { x: 0, y: 0 } },
        ]

        const edges: Edge[] = [
            { id: 'e1', source: '1', target: '2', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' } },
        ]

        const program = generateProgram(nodes, edges)

        expect(normalizeScheme(program)).toContain('start-span tracer "my-span"')
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
                data: { name: 'sum-span', kind: 'span', wrappedNodeIds: ['sum'] },
            },
            {
                id: 'span-display',
                type: 'span',
                position: { x: 0, y: 0 },
                data: { name: 'display-span', kind: 'span', wrappedNodeIds: ['display'] },
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
        expect(normalizeScheme(program)).toBe(normalizeScheme(`(let ((p-lit2 2)) (begin (display p-lit2) (let ((p-sum (let ((cx-span-sum (stdlib-telemetry::tracing::start-span tracer "sum-span" (option::stdlib-telemetry_context::none) (option::list::stdlib-telemetry_attribute::none) 0))) (let ((p-tmp-span-sum (+ 1 p-lit2))) (begin (stdlib-telemetry::tracing::end-span cx-span-sum 0) p-tmp-span-sum))))) (let ((cx-span-display (stdlib-telemetry::tracing::start-span tracer "display-span" (option::stdlib-telemetry_context::some cx-span-sum) (option::list::stdlib-telemetry_attribute::none) 0))) (let ((p-tmp-span-display (display p-sum))) (begin (stdlib-telemetry::tracing::end-span cx-span-display 0) p-tmp-span-display))))))`))
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
                data: { name: 'sda', kind: 'span', wrappedNodeIds: ['5', '9'] },
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
            normalizeScheme(`(if (> 3 1) (let ((p-5 "foo")) (let ((cx-span-11 (stdlib-telemetry::tracing::start-span tracer "sda" (option::stdlib-telemetry_context::none) (option::list::stdlib-telemetry_attribute::none) 0))) (let ((p-tmp-span-11 (display p-5))) (begin (stdlib-telemetry::tracing::end-span cx-span-11 0) p-tmp-span-11)))) (display "bar"))`)
        )
    })

    it('generates cond with multiple test/action clauses', () => {
        const nodes: Node[] = [
            {
                id: '1',
                type: 'cond',
                position: { x: 0, y: 0 },
                data: { kind: 'cond', name: 'cond' },
            },

            // --- clause 0 test: (= (* 1 2) 2)
            {
                id: '10',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'call', name: '*', n_args: 2, output: true },
            },
            {
                id: '12',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: '1' },
            },
            {
                id: '13',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: '2' },
            },
            {
                id: '11',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'call', name: '=', n_args: 2, output: true },
            },

            // --- clause 0 action: (display 6565)
            {
                id: '4',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: '6565' },
            },
            {
                id: '3',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'call', name: 'display', n_args: 1, output: false },
            },

            // --- clause 1 test: false
            {
                id: '5',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: 'false' },
            },

            // --- clause 1 action: (display (* 1 2))
            {
                id: '7',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'call', name: '*', n_args: 2, output: true },
            },
            {
                id: '8',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: '1' },
            },
            {
                id: '9',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: '2' },
            },
            {
                id: '6',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'call', name: 'display', n_args: 1, output: false },
            },
        ]

        const edges: Edge[] = [
            // clause 0 test: (* 1 2)
            { id: 'e1', source: '12', sourceHandle: 'value', target: '10', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e2', source: '13', sourceHandle: 'value', target: '10', targetHandle: 'arg-1', data: { kind: 'data' } },

            // (= (* 1 2) 2)
            { id: 'e3', source: '10', sourceHandle: 'value', target: '11', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e4', source: '13', sourceHandle: 'value', target: '11', targetHandle: 'arg-1', data: { kind: 'data' } },

            // test-0 → cond
            { id: 'e5', source: '11', sourceHandle: 'value', target: '1', targetHandle: 'test-0', data: { kind: 'data' } },

            // clause 0 action: display 6565
            { id: 'e6', source: '4', sourceHandle: 'value', target: '3', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e7', source: '3', sourceHandle: 'flow-out', target: '1', targetHandle: 'action-0', data: { kind: 'control' } },

            // clause 1 test: false
            { id: 'e8', source: '5', sourceHandle: 'value', target: '1', targetHandle: 'test-1', data: { kind: 'data' } },

            // clause 1 action: (* 1 2)
            { id: 'e9', source: '8', sourceHandle: 'value', target: '7', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e10', source: '9', sourceHandle: 'value', target: '7', targetHandle: 'arg-1', data: { kind: 'data' } },
            { id: 'e11', source: '7', sourceHandle: 'value', target: '6', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e12', source: '6', sourceHandle: 'flow-out', target: '1', targetHandle: 'action-1', data: { kind: 'control' } },
        ]

        const program = generateProgram(nodes, edges)

        expect(normalizeScheme(program)).toBe(
            normalizeScheme(`(let ((p-13 2)) (cond ((= (* 1 p-13) p-13) (display 6565)) (false (display (* 1 2)))))`)
        )
    })

    it('chains ifs correctly', () => {
        const nodes: Node[] = [
            {
                id: '7',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: '9999' },
            },
            {
                id: '65',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'call', name: 'display', n_args: 1, output: false },
            },
            {
                id: '67',
                type: 'if',
                position: { x: 0, y: 0 },
                data: { kind: 'if', name: 'if' },
            },
            {
                id: '69',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: '1' },
            },
            {
                id: '70',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: '2' },
            },
            {
                id: '71',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: '3' },
            },
            {
                id: '72',
                type: 'if',
                position: { x: 0, y: 0 },
                data: { kind: 'if', name: 'if' },
            },
        ]

        const edges: Edge[] = [
            { id: 'e1', source: '7', target: '67', sourceHandle: 'value', targetHandle: 'cond', data: { kind: 'data' } },
            { id: 'e2', source: '65', target: '67', sourceHandle: 'flow-out', targetHandle: 'then', data: { kind: 'control', branch: 'then' } },
            { id: 'e3', source: '72', target: '67', sourceHandle: 'flow-out', targetHandle: 'else', data: { kind: 'control', branch: 'else' } },

            { id: 'e4', source: '69', target: '72', sourceHandle: 'value', targetHandle: 'cond', data: { kind: 'data' } },
            { id: 'e5', source: '71', target: '72', sourceHandle: 'value', targetHandle: 'then', data: { kind: 'control', branch: 'then' } },
            { id: 'e6', source: '70', target: '72', sourceHandle: 'value', targetHandle: 'else', data: { kind: 'control', branch: 'else' } },
        ]

        const program = generateProgram(nodes, edges)

        expect(normalizeScheme(program)).toBe(
            normalizeScheme(`
            (if 9999
                (display )
                (if 1
                    3
                    2))
        `)
        )
    })

    it('generates nested root span with sequential child spans and flow', () => {
        const nodes: Node[] = [
            {
                id: '63',
                type: 'span',
                position: { x: 0, y: 0 },
                data: {
                    name: 'root',
                    kind: 'span',
                    wrappedNodeIds: ['46', '47', '48', '49'],
                },
            },
            {
                id: '64',
                type: 'span',
                position: { x: 0, y: 0 },
                parentId: '63',
                data: { name: 'cl', kind: 'span', wrappedNodeIds: ['46'] },
            },
            {
                id: '65',
                type: 'span',
                position: { x: 0, y: 0 },
                parentId: '63',
                data: { name: 'sha', kind: 'span', wrappedNodeIds: ['47'] },
            },
            {
                id: '66',
                type: 'span',
                position: { x: 0, y: 0 },
                parentId: '63',
                data: { name: 'shb', kind: 'span', wrappedNodeIds: ['48'] },
            },

            { id: '46', type: 'expr', parentId: '64', position: { x: 0, y: 0 }, data: { kind: 'call', name: 'http::proxy-http::response::clear', n_args: 0, output: true } },
            { id: '47', type: 'expr', parentId: '65', position: { x: 0, y: 0 }, data: { kind: 'call', name: 'http::proxy-http::response::set-header', n_args: 2, output: true } },
            { id: '48', type: 'expr', parentId: '66', position: { x: 0, y: 0 }, data: { kind: 'call', name: 'http::proxy-http::response::set-header', n_args: 2, output: true } },
            { id: '49', type: 'expr', parentId: '63', position: { x: 0, y: 0 }, data: { kind: 'call', name: 'http::proxy-http::send-response', n_args: 0, output: true } },

            { id: '50', type: 'expr', position: { x: 0, y: 0 }, data: { kind: 'literal', value: '":status"' } },
            { id: '55', type: 'expr', position: { x: 0, y: 0 }, data: { kind: 'literal', value: '"404"' } },
            { id: '52', type: 'expr', position: { x: 0, y: 0 }, data: { kind: 'literal', value: '"X-Custom"' } },
            { id: '62', type: 'expr', position: { x: 0, y: 0 }, data: { kind: 'literal', value: '"SNI Not Matched"' } },
        ]

        const edges: Edge[] = [
            { id: 'e1', source: '46', sourceHandle: 'flow-out', target: '47', targetHandle: 'flow-in', data: { kind: 'flow' } },
            { id: 'e2', source: '47', sourceHandle: 'flow-out', target: '48', targetHandle: 'flow-in', data: { kind: 'flow' } },
            { id: 'e3', source: '48', sourceHandle: 'flow-out', target: '49', targetHandle: 'flow-in', data: { kind: 'flow' } },

            { id: 'e4', source: '50', sourceHandle: 'value', target: '47', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e5', source: '55', sourceHandle: 'value', target: '47', targetHandle: 'arg-1', data: { kind: 'data' } },
            { id: 'e6', source: '52', sourceHandle: 'value', target: '48', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e7', source: '62', sourceHandle: 'value', target: '48', targetHandle: 'arg-1', data: { kind: 'data' } },
        ]

        const program = generateProgram(nodes, edges)

        expect(normalizeScheme(program)).toBe(
            normalizeScheme(`(begin (let ((cx-63 (stdlib-telemetry::tracing::start-span tracer "root" (option::stdlib-telemetry_context::some cx-63) (option::list::stdlib-telemetry_attribute::none) 0)) (cx-64 (stdlib-telemetry::tracing::start-span tracer "cl" (option::stdlib-telemetry_context::some cx-63) (option::list::stdlib-telemetry_attribute::none) 0))) (let ((p-tmp-64 (http::proxy-http::response::clear))) (begin (stdlib-telemetry::tracing::end-span cx-64 0) p-tmp-64))) (let ((cx-65 (stdlib-telemetry::tracing::start-span tracer "sha" (option::stdlib-telemetry_context::some cx-63) (option::list::stdlib-telemetry_attribute::none) 0))) (let ((p-tmp-65 (http::proxy-http::response::set-header ":status" "404"))) (begin (stdlib-telemetry::tracing::end-span cx-65 0) p-tmp-65))) (let ((cx-66 (stdlib-telemetry::tracing::start-span tracer "shb" (option::stdlib-telemetry_context::some cx-63) (option::list::stdlib-telemetry_attribute::none) 0))) (let ((p-tmp-66 (http::proxy-http::response::set-header "X-Custom" "SNI Not Matched"))) (begin (stdlib-telemetry::tracing::end-span cx-66 0) p-tmp-66))) (let ((p-tmp-63 (http::proxy-http::send-response))) (begin (stdlib-telemetry::tracing::end-span cx-63 0) p-tmp-63)))`)
        )
    })

    it('simple if-else', () => {
        const nodes: Node[] = [
            {
                id: '6',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'call', name: 'not', n_args: 1, output: true },
            },
            {
                id: '59',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'call', name: 'http::proxy-http::response::clear', n_args: 0, output: true },
            },
            {
                id: '10',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'call', name: 'http::proxy-http::response::set-header', n_args: 2, output: true },
            },
            {
                id: '11',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: '":status"' },
            },
            {
                id: '12',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: '"200"' },
            },
            {
                id: '63',
                type: 'if',
                position: { x: 0, y: 0 },
                data: { kind: 'if', name: 'if' },
            },
            {
                id: '64',
                type: 'expr',
                position: { x: 0, y: 0 },
                data: { kind: 'literal', value: '9' },
            },
        ]

        const edges: Edge[] = [
            { id: 'e1', source: '11', sourceHandle: 'value', target: '10', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e2', source: '12', sourceHandle: 'value', target: '10', targetHandle: 'arg-1', data: { kind: 'data' } },

            { id: 'e3', source: '59', sourceHandle: 'flow-out', target: '10', targetHandle: 'flow-in', data: { kind: 'flow' } },

            { id: 'e4', source: '6', sourceHandle: 'value', target: '63', targetHandle: 'cond', data: { kind: 'data' } },

            { id: 'e5', source: '59', sourceHandle: 'flow-out', target: '63', targetHandle: 'then', data: { kind: 'control' } },
            { id: 'e6', source: '64', sourceHandle: 'value', target: '63', targetHandle: 'else', data: { kind: 'control' } },
        ]

        const program = generateProgram(nodes, edges)

        expect(normalizeScheme(program)).toBe(
            normalizeScheme(`
(if (not)
  (begin
    (http::proxy-http::response::clear)
    (http::proxy-http::response::set-header ":status" "200"))
  9)
        `)
        )
    })



    // TODO: FIXME: THIS IS BROKEN - see the scope of cx-7
    it('simple if-else', () => {
        const nodes: Node[] = [
            { id: '6', type: 'span', data: { name: 'root', kind: 'span', wrappedNodeIds: ['1', '2', '3', '4', '5'] }, position: { x: 0, y: 0 } },
            { id: '7', type: 'span', parentId: '6', data: { name: 'dissend', kind: 'span', wrappedNodeIds: ['3', '4', '5'] }, position: { x: 0, y: 0 } },
            { id: '8', type: 'span', parentId: '7', data: { name: 'send', kind: 'span', wrappedNodeIds: ['5'] }, position: { x: 0, y: 0 } },

            { id: '1', type: 'if', parentId: '6', data: { kind: 'if', name: 'if' }, position: { x: 0, y: 0 } },
            { id: '2', type: 'expr', parentId: '6', data: { kind: 'literal', value: '#t' }, position: { x: 0, y: 0 } },
            { id: '3', type: 'expr', parentId: '7', data: { kind: 'call', name: 'display', n_args: 1 }, position: { x: 0, y: 0 } },
            { id: '4', type: 'expr', parentId: '7', data: { kind: 'literal', value: '1' }, position: { x: 0, y: 0 } },
            { id: '5', type: 'expr', parentId: '8', data: { kind: 'call', name: 'http::proxy-http::send-response', n_args: 0 }, position: { x: 0, y: 0 } },
        ]

        const edges: Edge[] = [
            { id: 'e1', source: '2', target: '1', sourceHandle: 'value', targetHandle: 'cond', data: { kind: 'data' } },
            { id: 'e2', source: '3', target: '1', sourceHandle: 'flow-out', targetHandle: 'then', data: { kind: 'control', branch: 'then' } },
            { id: 'e3', source: '4', target: '3', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' } },
            { id: 'e4', source: '5', target: '1', sourceHandle: 'value', targetHandle: 'else', data: { kind: 'control', branch: 'else' } },
        ]

        const program = generateProgram(nodes, edges)

        expect(normalizeScheme(program)).toBe(
            normalizeScheme(`
(let ((p-2 #t))
  (let ((cx-6 (stdlib-telemetry::tracing::start-span tracer "root" (option::stdlib-telemetry_context::none) (option::list::stdlib-telemetry_attribute::none) 0)))
    (let ((p-tmp-6 (if p-2
            (let ((p-4 1))
              (let ((cx-7 (stdlib-telemetry::tracing::start-span tracer "dissend" (option::stdlib-telemetry_context::some cx-6) (option::list::stdlib-telemetry_attribute::none) 0)))
                (display p-4)))
            (let ((cx-8 (stdlib-telemetry::tracing::start-span tracer "send" (option::stdlib-telemetry_context::some cx-7) (option::list::stdlib-telemetry_attribute::none) 0)))
              (let ((p-tmp-8-7 (http::proxy-http::send-response)))
                (begin (stdlib-telemetry::tracing::end-span cx-8 0)
                  (stdlib-telemetry::tracing::end-span cx-7 0)
                  p-tmp-8-7))))))
      (begin (stdlib-telemetry::tracing::end-span cx-6 0)
        p-tmp-6))))
        `)
        )
    })



})
