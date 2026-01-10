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
                "id": "8",
                "type": "span",
                "position": {
                    "x": 205.2041208669068,
                    "y": 211.67968267435407
                },
                "parentId": "7",
                "data": {
                    "name": "display-span",
                    "kind": "span",
                    "wrappedNodeIds": [
                        "3"
                    ]
                },
                "style": {
                    "width": 300,
                    "height": 200
                },
                "width": 300,
                "height": 200
            },
            {
                "id": "7",
                "type": "span",
                "position": {
                    "x": 185.75567454910777,
                    "y": -152.6007271270101
                },
                "data": {
                    "name": "sum-span",
                    "kind": "span",
                    "wrappedNodeIds": [
                        "3",
                        "4"
                    ]
                },
                "style": {
                    "width": 300,
                    "height": 200
                },
                "width": 300,
                "height": 200
            },
            {
                "id": "2",
                "position": {
                    "x": 13.32009804778879,
                    "y": 184.47221506525497
                },
                "data": {
                    "kind": "call",
                    "name": "display",
                    "n_args": 1,
                    "output": false
                },
                "type": "expr",
                "width": 146,
                "height": 67,
                "selected": false,
                "positionAbsolute": {
                    "x": 13.32009804778879,
                    "y": 184.47221506525497
                },
                "dragging": false
            },
            {
                "id": "3",
                "position": {
                    "x": 40,
                    "y": 40
                },
                "data": {
                    "kind": "call",
                    "name": "display",
                    "n_args": 1,
                    "output": false
                },
                "type": "expr",
                "width": 146,
                "height": 67,
                "selected": false,
                "positionAbsolute": {
                    "x": 430.9597954160146,
                    "y": 99.07895554734398
                },
                "dragging": false,
                "parentId": "8",
                "extent": "parent"
            },
            {
                "id": "4",
                "position": {
                    "x": 40,
                    "y": 39.999999999999986
                },
                "data": {
                    "kind": "call",
                    "name": "+",
                    "n_args": 2,
                    "output": true
                },
                "type": "expr",
                "width": 146,
                "height": 86,
                "selected": false,
                "positionAbsolute": {
                    "x": 225.75567454910777,
                    "y": -112.6007271270101
                },
                "dragging": false,
                "parentId": "7",
                "extent": "parent"
            },
            {
                "id": "5",
                "position": {
                    "x": -143.51643314183104,
                    "y": -40.33829116202533
                },
                "data": {
                    "kind": "literal",
                    "value": "1",
                    "name": "Literal 1"
                },
                "type": "expr",
                "width": 67,
                "height": 70,
                "selected": false,
                "positionAbsolute": {
                    "x": -143.51643314183104,
                    "y": -40.33829116202533
                },
                "dragging": false
            },
            {
                "id": "6",
                "position": {
                    "x": -13.69524367505511,
                    "y": -123.90447391680122
                },
                "data": {
                    "kind": "literal",
                    "value": "2",
                    "name": "Literal 2"
                },
                "type": "expr",
                "width": 67,
                "height": 70,
                "selected": false,
                "positionAbsolute": {
                    "x": -13.69524367505511,
                    "y": -123.90447391680122
                },
                "dragging": false
            }
        ];

        const edges: Edge[] = [
            {
                "source": "4",
                "sourceHandle": "value",
                "target": "3",
                "targetHandle": "arg-0",
                "data": {
                    "kind": "data"
                },
                "id": "reactflow__edge-4value-3arg-0",
                "selected": false
            },
            {
                "source": "6",
                "sourceHandle": "value",
                "target": "4",
                "targetHandle": "arg-0",
                "data": {
                    "kind": "data"
                },
                "id": "reactflow__edge-6value-4arg-0",
                "selected": false
            },
            {
                "source": "5",
                "sourceHandle": "value",
                "target": "4",
                "targetHandle": "arg-1",
                "data": {
                    "kind": "data"
                },
                "id": "reactflow__edge-5value-4arg-1",
                "selected": false
            },
            {
                "source": "5",
                "sourceHandle": "value",
                "target": "2",
                "targetHandle": "arg-0",
                "data": {
                    "kind": "data"
                },
                "id": "reactflow__edge-5value-2arg-0"
            }
        ];

        const program = generateProgram(
            nodes,
            edges
        )

        // ---- Assertions ----
        expect(normalizeScheme(program)).toBe(normalizeScheme(`(let* ((p-5 1) (cx-7 (stdlib-telemetry::tracing::start-span tracer "sum-span" (option::stdlib-telemetry_context::none) (option::list::stdlib-telemetry_attribute::none) 0)) (p-tmp-7 (let ((p-4 (+ 2 p-5))) (begin (let ((cx-8 (stdlib-telemetry::tracing::start-span tracer "display-span" (option::stdlib-telemetry_context::some cx-7) (option::list::stdlib-telemetry_attribute::none) 0)) (p-tmp-8 (display p-4))) (begin (stdlib-telemetry::tracing::end-span cx-8 0) p-tmp-8)))))) (begin (stdlib-telemetry::tracing::end-span cx-7 0) p-tmp-7))`))
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
            normalizeScheme(`(if (> 3 1) (let* ((p-5 "foo") (cx-span-11 (stdlib-telemetry::tracing::start-span tracer "sda" (option::stdlib-telemetry_context::none) (option::list::stdlib-telemetry_attribute::none) 0)) (p-tmp-span-11 (display p-5))) (begin (stdlib-telemetry::tracing::end-span cx-span-11 0) p-tmp-span-11)) (display "bar"))`)
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
            normalizeScheme(`(begin (let ((cx-63 (stdlib-telemetry::tracing::start-span tracer "root" (option::stdlib-telemetry_context::none) (option::list::stdlib-telemetry_attribute::none) 0)) (p-tmp-63 (begin (let ((cx-64 (stdlib-telemetry::tracing::start-span tracer "cl" (option::stdlib-telemetry_context::some cx-63) (option::list::stdlib-telemetry_attribute::none) 0)) (p-tmp-64 (http::proxy-http::response::clear))) (begin (stdlib-telemetry::tracing::end-span cx-64 0) p-tmp-64)) (let ((cx-65 (stdlib-telemetry::tracing::start-span tracer "sha" (option::stdlib-telemetry_context::some cx-63) (option::list::stdlib-telemetry_attribute::none) 0)) (p-tmp-65 (http::proxy-http::response::set-header ":status" "404"))) (begin (stdlib-telemetry::tracing::end-span cx-65 0) p-tmp-65)) (let ((cx-66 (stdlib-telemetry::tracing::start-span tracer "shb" (option::stdlib-telemetry_context::some cx-63) (option::list::stdlib-telemetry_attribute::none) 0)) (p-tmp-66 (http::proxy-http::response::set-header "X-Custom" "SNI Not Matched"))) (begin (stdlib-telemetry::tracing::end-span cx-66 0) p-tmp-66)) (http::proxy-http::send-response)))) (begin (stdlib-telemetry::tracing::end-span cx-63 0) p-tmp-63)))`)
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



    it('simple if-else with spans', () => {
        const nodes: Node[] = [
            {
                id: '8',
                type: 'span',
                position: { x: 290.9361686917557, y: 388.77146104021136 },
                parentId: '6',
                data: {
                    name: 'clespan',
                    kind: 'span',
                    wrappedNodeIds: ['5'],
                },
                style: { width: 300, height: 200 },
                width: 300,
                height: 200,
            },
            {
                id: '7',
                type: 'span',
                position: { x: 0, y: 142.60095883739854 },
                parentId: '6',
                data: {
                    name: 'dispan',
                    kind: 'span',
                    wrappedNodeIds: ['3', '4'],
                },
                style: { width: 300, height: 200 },
                width: 300,
                height: 200,
            },
            {
                id: '6',
                type: 'span',
                position: { x: -295.4661920671781, y: -29.320561031180603 },
                data: {
                    name: 'root',
                    kind: 'span',
                    wrappedNodeIds: ['1', '2', '3', '4', '5'],
                },
                style: { width: 300, height: 200 },
                width: 300,
                height: 200,
            },
            {
                id: '1',
                type: 'if',
                parentId: '6',
                extent: 'parent',
                position: { x: 573.7414002886209, y: 70.10031035226336 },
                positionAbsolute: { x: 278.27520822144277, y: 40.779749321082754 },
                data: { kind: 'if', name: 'if' },
                width: 146,
                height: 132,
                selected: false,
                dragging: false,
            },
            {
                id: '2',
                type: 'expr',
                parentId: '6',
                extent: 'parent',
                position: { x: 354.25307017503764, y: 40 },
                positionAbsolute: { x: 58.78687810785955, y: 10.679438968819397 },
                data: { kind: 'literal', value: '#t', name: 'Literal #t' },
                width: 67,
                height: 70,
                selected: false,
                dragging: false,
            },
            {
                id: '3',
                type: 'expr',
                parentId: '7',
                extent: 'parent',
                position: { x: 185.6682896809261, y: 40 },
                positionAbsolute: { x: -109.79790238625199, y: 153.28039780621793 },
                data: { kind: 'call', name: 'display', n_args: 1, output: false },
                width: 146,
                height: 67,
                selected: false,
                dragging: false,
            },
            {
                id: '4',
                type: 'expr',
                parentId: '7',
                extent: 'parent',
                position: { x: 40, y: 53.14405831890687 },
                positionAbsolute: { x: -255.4661920671781, y: 166.4244561251248 },
                data: { kind: 'literal', value: '1', name: 'Literal 1' },
                width: 67,
                height: 70,
                selected: false,
                dragging: false,
            },
            {
                id: '5',
                type: 'expr',
                parentId: '8',
                extent: 'parent',
                position: { x: 40, y: 40 },
                positionAbsolute: { x: 35.46997662457758, y: 399.45090000903076 },
                data: {
                    kind: 'call',
                    name: 'http::proxy-http::response::clear',
                    n_args: 0,
                    output: true,
                },
                width: 269,
                height: 48,
                selected: false,
                dragging: false,
            },
        ]

        const edges: Edge[] = [
            {
                id: 'reactflow__edge-2value-1cond',
                source: '2',
                sourceHandle: 'value',
                target: '1',
                targetHandle: 'cond',
                data: { kind: 'data' },
                selected: false,
            },
            {
                id: 'reactflow__edge-4value-3arg-0',
                source: '4',
                sourceHandle: 'value',
                target: '3',
                targetHandle: 'arg-0',
                data: { kind: 'data' },
                selected: false,
            },
            {
                id: 'reactflow__edge-3flow-out-1then',
                source: '3',
                sourceHandle: 'flow-out',
                target: '1',
                targetHandle: 'then',
                data: { kind: 'control' },
                selected: false,
            },
            {
                id: 'reactflow__edge-5flow-out-1else',
                source: '5',
                sourceHandle: 'flow-out',
                target: '1',
                targetHandle: 'else',
                data: { kind: 'control' },
                selected: false,
            },
        ]


        const program = generateProgram(nodes, edges)

        expect(normalizeScheme(program)).toBe(
            normalizeScheme(`(let* ((p-2 #t) (cx-6 (stdlib-telemetry::tracing::start-span tracer "root" (option::stdlib-telemetry_context::none) (option::list::stdlib-telemetry_attribute::none) 0)) (p-tmp-6 (if p-2 (let* ((p-4 1) (cx-7 (stdlib-telemetry::tracing::start-span tracer "dispan" (option::stdlib-telemetry_context::some cx-6) (option::list::stdlib-telemetry_attribute::none) 0)) (p-tmp-7 (display p-4))) (begin (stdlib-telemetry::tracing::end-span cx-7 0) p-tmp-7)) (let ((cx-8 (stdlib-telemetry::tracing::start-span tracer "clespan" (option::stdlib-telemetry_context::some cx-6) (option::list::stdlib-telemetry_attribute::none) 0)) (p-tmp-8 (http::proxy-http::response::clear))) (begin (stdlib-telemetry::tracing::end-span cx-8 0) p-tmp-8))))) (begin (stdlib-telemetry::tracing::end-span cx-6 0) p-tmp-6))`)
        )
    })


    it('waterfall of pluses', () => {
        const nodes: Node[] = [
            {
                id: "12",
                type: "span",
                position: { x: 195.61427535145788, y: 108.52261307186106 },
                parentId: "11",
                data: {
                    name: "1+",
                    kind: "span",
                    wrappedNodeIds: ["4"],
                },
                style: { width: 300, height: 200 },
                width: 300,
                height: 200,
            },
            {
                id: "11",
                type: "span",
                position: { x: 151.7514224811889, y: 90.84350733606811 },
                parentId: "10",
                data: {
                    name: "2+",
                    kind: "span",
                    wrappedNodeIds: ["3", "4"],
                },
                style: { width: 300, height: 200 },
                width: 300,
                height: 200,
            },
            {
                id: "10",
                type: "span",
                position: { x: 301.5182021420386, y: 118.55572207195874 },
                parentId: "9",
                data: {
                    name: "3+",
                    kind: "span",
                    wrappedNodeIds: ["2", "3", "4"],
                },
                style: { width: 300, height: 200 },
                width: 300,
                height: 200,
                selected: false,
            },
            {
                id: "9",
                type: "span",
                position: { x: 52.977307771798195, y: -40.86570527658032 },
                data: {
                    name: "root",
                    kind: "span",
                    wrappedNodeIds: ["1", "2", "3", "4", "5", "6", "7", "8"],
                },
                style: { width: 300, height: 200 },
                width: 300,
                height: 200,
            },
            {
                id: "1",
                type: "expr",
                position: { x: 178.3608457809967, y: 67.4177385927901 },
                data: { kind: "call", name: "+", n_args: 2, output: true },
                width: 146,
                height: 86,
                selected: false,
                positionAbsolute: { x: 231.3381535527949, y: 26.552033316209773 },
                dragging: false,
                parentId: "9",
                extent: "parent",
            },
            {
                id: "2",
                type: "expr",
                position: { x: 40, y: 40 },
                data: { kind: "call", name: "+", n_args: 2, output: true },
                width: 146,
                height: 86,
                selected: false,
                positionAbsolute: { x: 394.4955099138368, y: 117.69001679537843 },
                dragging: false,
                parentId: "10",
                extent: "parent",
            },
            {
                id: "3",
                type: "expr",
                position: { x: 40, y: 40 },
                data: { kind: "call", name: "+", n_args: 2, output: true },
                width: 146,
                height: 86,
                selected: false,
                positionAbsolute: { x: 546.2469323950257, y: 208.53352413144654 },
                dragging: false,
                parentId: "11",
                extent: "parent",
            },
            {
                id: "4",
                type: "expr",
                position: { x: 40, y: 40 },
                data: { kind: "call", name: "+", n_args: 2, output: true },
                width: 148,
                height: 88,
                selected: true,
                positionAbsolute: { x: 741.8612077464836, y: 317.05613720330757 },
                dragging: false,
                parentId: "12",
                extent: "parent",
            },
            {
                id: "5",
                type: "expr",
                position: { x: 49.010364070060405, y: 40 },
                data: { kind: "literal", value: "1", name: "Literal 1" },
                width: 67,
                height: 70,
                selected: false,
                positionAbsolute: { x: 101.9876718418586, y: -0.8657052765803215 },
                dragging: false,
                parentId: "9",
                extent: "parent",
            },
            {
                id: "6",
                type: "expr",
                position: { x: 46.03011452431258, y: 118.1314873579285 },
                data: { kind: "literal", value: "2", name: "Literal 2" },
                width: 67,
                height: 70,
                selected: false,
                positionAbsolute: { x: 99.00742229611078, y: 77.26578208134819 },
                dragging: false,
                parentId: "9",
                extent: "parent",
            },
            {
                id: "7",
                type: "expr",
                position: { x: 42.94982365651097, y: 244.69192615097202 },
                data: { kind: "literal", value: "3", name: "Literal 3" },
                width: 67,
                height: 70,
                selected: false,
                positionAbsolute: { x: 95.92713142830917, y: 203.8262208743917 },
                dragging: false,
                parentId: "9",
                extent: "parent",
            },
            {
                id: "8",
                type: "expr",
                position: { x: 40, y: 355.4217243401121 },
                data: { kind: "literal", value: "4", name: "Literal 4" },
                width: 67,
                height: 70,
                selected: false,
                positionAbsolute: { x: 92.9773077717982, y: 314.5560190635318 },
                dragging: false,
                parentId: "9",
                extent: "parent",
            },
        ]

        const edges: Edge[] = [
            {
                source: "5",
                sourceHandle: "value",
                target: "1",
                targetHandle: "arg-0",
                data: { kind: "data" },
                id: "reactflow__edge-5value-1arg-0",
                selected: false,
            },
            {
                source: "6",
                sourceHandle: "value",
                target: "1",
                targetHandle: "arg-1",
                data: { kind: "data" },
                id: "reactflow__edge-6value-1arg-1",
                selected: false,
            },
            {
                source: "1",
                sourceHandle: "value",
                target: "2",
                targetHandle: "arg-0",
                data: { kind: "data" },
                id: "reactflow__edge-1value-2arg-0",
                selected: false,
            },
            {
                source: "7",
                sourceHandle: "value",
                target: "2",
                targetHandle: "arg-1",
                data: { kind: "data" },
                id: "reactflow__edge-7value-2arg-1",
                selected: false,
            },
            {
                source: "2",
                sourceHandle: "value",
                target: "3",
                targetHandle: "arg-0",
                data: { kind: "data" },
                id: "reactflow__edge-2value-3arg-0",
                selected: false,
            },
            {
                source: "8",
                sourceHandle: "value",
                target: "3",
                targetHandle: "arg-1",
                data: { kind: "data" },
                id: "reactflow__edge-8value-3arg-1",
                selected: false,
            },
            {
                source: "3",
                sourceHandle: "value",
                target: "4",
                targetHandle: "arg-0",
                data: { kind: "data" },
                id: "reactflow__edge-3value-4arg-0",
                selected: true,
            },
            {
                source: "2",
                sourceHandle: "value",
                target: "4",
                targetHandle: "arg-1",
                data: { kind: "data" },
                id: "reactflow__edge-2value-4arg-1",
                selected: true,
            },
        ]


        const program = generateProgram(nodes, edges)

        expect(normalizeScheme(program)).toBe(
            normalizeScheme(`(let ((p-8 4)
      (p-7 3)
      (p-6 2)
      (p-5 1)
      (cx-9 (stdlib-telemetry::tracing::start-span tracer "root" (option::stdlib-telemetry_context::none) (option::list::stdlib-telemetry_attribute::none) 0))
      (p-tmp-9 (let* ((p-1 (+ p-5 p-6))
            (cx-10 (stdlib-telemetry::tracing::start-span tracer "3+" (option::stdlib-telemetry_context::some cx-9) (option::list::stdlib-telemetry_attribute::none) 0))
            (p-tmp-10 (let* ((p-2 (+ p-1 p-7))
                  (cx-11 (stdlib-telemetry::tracing::start-span tracer "2+" (option::stdlib-telemetry_context::some cx-10) (option::list::stdlib-telemetry_attribute::none) 0))
                  (p-tmp-11 (let* ((p-3 (+ p-2 p-8))
                        (cx-12 (stdlib-telemetry::tracing::start-span tracer "1+" (option::stdlib-telemetry_context::some cx-11) (option::list::stdlib-telemetry_attribute::none) 0))
                        (p-tmp-12 (+ p-3 p-2))) (begin (stdlib-telemetry::tracing::end-span cx-12 0)
                        p-tmp-12)))) (begin (stdlib-telemetry::tracing::end-span cx-11 0)
                  p-tmp-11)))) (begin (stdlib-telemetry::tracing::end-span cx-10 0)
            p-tmp-10))))
    (begin (stdlib-telemetry::tracing::end-span cx-9 0)
      p-tmp-9))`)
        )
    })

    it('if with only span on the if', () => {
        const nodes: Node[] = [
            {
                "id": "122",
                "type": "span",
                "position": {
                    "x": 1029.4650006306185,
                    "y": 455.27296698589043
                },
                "data": {
                    "name": "fiffo",
                    "kind": "span",
                    "wrappedNodeIds": [
                        "104"
                    ]
                },
                "style": {
                    "width": 300,
                    "height": 200
                },
                "width": 300,
                "height": 200
            },
            {
                "id": "104",
                "position": {
                    "x": 40,
                    "y": 40
                },
                "data": {
                    "kind": "if",
                    "name": "if"
                },
                "type": "if",
                "width": 146,
                "height": 132,
                "selected": false,
                "positionAbsolute": {
                    "x": 1069.4650006306185,
                    "y": 495.27296698589043
                },
                "dragging": false,
                "parentId": "122",
                "extent": "parent"
            },
            {
                "id": "105",
                "position": {
                    "x": 448.2885709016151,
                    "y": 698.0339097275071
                },
                "data": {
                    "kind": "call",
                    "name": "http::proxy-http::response::clear",
                    "n_args": 0,
                    "output": true
                },
                "type": "expr",
                "width": 269,
                "height": 48,
                "selected": false,
                "positionAbsolute": {
                    "x": 448.2885709016151,
                    "y": 698.0339097275071
                },
                "dragging": false
            },
            {
                "id": "123",
                "position": {
                    "x": 651.6971908049763,
                    "y": 433.9495617259498
                },
                "data": {
                    "kind": "literal",
                    "value": "21",
                    "name": "Literal 21"
                },
                "type": "expr",
                "width": 67,
                "height": 70,
                "selected": false,
                "positionAbsolute": {
                    "x": 651.6971908049763,
                    "y": 433.9495617259498
                },
                "dragging": false
            },
            {
                "id": "125",
                "position": {
                    "x": 428.3945506189957,
                    "y": 878.0187180376086
                },
                "data": {
                    "kind": "call",
                    "name": "http::proxy-http::send-response",
                    "n_args": 0,
                    "output": true
                },
                "type": "expr",
                "width": 267,
                "height": 48,
                "selected": false,
                "positionAbsolute": {
                    "x": 428.3945506189957,
                    "y": 878.0187180376086
                },
                "dragging": false
            },
            {
                "id": "126",
                "position": {
                    "x": 770.0269548303278,
                    "y": 721.5439469320793
                },
                "data": {
                    "kind": "call",
                    "name": "core::server::stream::get-metadata",
                    "n_args": 0,
                    "output": true
                },
                "type": "expr",
                "width": 287,
                "height": 48,
                "selected": false,
                "positionAbsolute": {
                    "x": 770.0269548303278,
                    "y": 721.5439469320793
                },
                "dragging": false
            },
            {
                "id": "127",
                "position": {
                    "x": 769.2876201782235,
                    "y": 854.9499863362112
                },
                "data": {
                    "kind": "call",
                    "name": "option::stdlib-telemetry_context::none",
                    "n_args": 0,
                    "output": true
                },
                "type": "expr",
                "width": 313,
                "height": 50,
                "selected": true,
                "positionAbsolute": {
                    "x": 769.2876201782235,
                    "y": 854.9499863362112
                },
                "dragging": false
            }
        ];

        const edges: Edge[] = [
            {
                "source": "105",
                "sourceHandle": "flow-out",
                "target": "104",
                "targetHandle": "then",
                "data": {
                    "kind": "control"
                },
                "id": "reactflow__edge-105flow-out-104then",
                "selected": false
            },
            {
                "source": "123",
                "sourceHandle": "value",
                "target": "104",
                "targetHandle": "cond",
                "data": {
                    "kind": "data"
                },
                "id": "reactflow__edge-123value-104cond",
                "selected": false
            },
            {
                "source": "105",
                "sourceHandle": "flow-out",
                "target": "125",
                "targetHandle": "flow-in",
                "data": {
                    "kind": "flow"
                },
                "id": "reactflow__edge-105flow-out-125flow-in"
            },
            {
                "source": "126",
                "sourceHandle": "flow-out",
                "target": "104",
                "targetHandle": "else",
                "data": {
                    "kind": "control",
                    "branch": "else"
                },
                "id": "reactflow__edge-126flow-out-104else"
            },
            {
                "source": "126",
                "sourceHandle": "flow-out",
                "target": "127",
                "targetHandle": "flow-in",
                "data": {
                    "kind": "flow"
                },
                "id": "reactflow__edge-126flow-out-127flow-in"
            }
        ];




        const program = generateProgram(nodes, edges)

        expect(normalizeScheme(program)).toBe(
            normalizeScheme(`(let ((cx-122 (stdlib-telemetry::tracing::start-span tracer "fiffo" (option::stdlib-telemetry_context::none) (option::list::stdlib-telemetry_attribute::none) 0)) (p-tmp-122 (if 21 (begin (http::proxy-http::response::clear) (http::proxy-http::send-response)) (begin (core::server::stream::get-metadata) (option::stdlib-telemetry_context::none))))) (begin (stdlib-telemetry::tracing::end-span cx-122 0) p-tmp-122))`)
        )
    })


    it('if with spans on the if and on the then', () => {
        const nodes: Node[] = [
            {
                "id": "123",
                "type": "span",
                "position": {
                    "x": 0,
                    "y": 430.98855687191156
                },
                "parentId": "122",
                "data": {
                    "name": "left",
                    "kind": "span",
                    "wrappedNodeIds": [
                        "105",
                        "108",
                        "110",
                        "111",
                        "114",
                        "115",
                        "117",
                        "119"
                    ]
                },
                "style": {
                    "width": 300,
                    "height": 200
                },
                "width": 300,
                "height": 200
            },
            {
                "id": "122",
                "type": "span",
                "position": {
                    "x": 947.5802312277806,
                    "y": 569.2729669858904
                },
                "data": {
                    "name": "root",
                    "kind": "span",
                    "wrappedNodeIds": [
                        "104",
                        "105",
                        "106",
                        "107",
                        "108",
                        "109",
                        "110",
                        "111",
                        "112",
                        "113",
                        "114",
                        "115",
                        "116",
                        "117",
                        "118",
                        "119",
                        "120"
                    ]
                },
                "style": {
                    "width": 300,
                    "height": 200
                },
                "width": 300,
                "height": 200,
                "selected": false,
                "positionAbsolute": {
                    "x": 947.5802312277806,
                    "y": 569.2729669858904
                },
                "dragging": false
            },
            {
                "id": "104",
                "position": {
                    "x": 655.884769402838,
                    "y": 40
                },
                "data": {
                    "kind": "if",
                    "name": "if"
                },
                "type": "if",
                "width": 146,
                "height": 132,
                "selected": false,
                "positionAbsolute": {
                    "x": 1635.4650006306185,
                    "y": 567.2729669858904
                },
                "dragging": false,
                "parentId": "122",
                "extent": "parent"
            },
            {
                "id": "105",
                "position": {
                    "x": 395.78032119554064,
                    "y": 40
                },
                "data": {
                    "kind": "call",
                    "name": "http::proxy-http::response::clear",
                    "n_args": 0,
                    "output": true
                },
                "type": "expr",
                "width": 269,
                "height": 48,
                "selected": false,
                "positionAbsolute": {
                    "x": 1375.3605524233212,
                    "y": 998.261523857802
                },
                "dragging": false,
                "parentId": "123",
                "extent": "parent"
            },
            {
                "id": "108",
                "position": {
                    "x": 350.4789881237034,
                    "y": 134.32933600504714
                },
                "data": {
                    "kind": "call",
                    "name": "http::proxy-http::response::set-header",
                    "n_args": 2,
                    "output": true
                },
                "type": "expr",
                "width": 314,
                "height": 86,
                "selected": false,
                "positionAbsolute": {
                    "x": 1330.059219351484,
                    "y": 1092.5908598628491
                },
                "dragging": false,
                "parentId": "123",
                "extent": "parent"
            },
            {
                "id": "110",
                "position": {
                    "x": 348.1680908463113,
                    "y": 244.7881113663144
                },
                "data": {
                    "kind": "call",
                    "name": "http::proxy-http::response::set-header",
                    "n_args": 2,
                    "output": true
                },
                "type": "expr",
                "width": 314,
                "height": 86,
                "selected": false,
                "positionAbsolute": {
                    "x": 1327.748322074092,
                    "y": 1203.0496352241164
                },
                "dragging": false,
                "parentId": "123",
                "extent": "parent"
            },
            {
                "id": "111",
                "position": {
                    "x": 369.16681733510586,
                    "y": 369.61997064593345
                },
                "data": {
                    "kind": "call",
                    "name": "http::proxy-http::send-response",
                    "n_args": 0,
                    "output": true
                },
                "type": "expr",
                "width": 267,
                "height": 48,
                "selected": false,
                "positionAbsolute": {
                    "x": 1348.7470485628864,
                    "y": 1327.8814945037354
                },
                "dragging": false,
                "parentId": "123",
                "extent": "parent"
            },
            {
                "id": "114",
                "position": {
                    "x": 139.0480775079552,
                    "y": 120.14065549463305
                },
                "data": {
                    "kind": "literal",
                    "value": "\":status\"",
                    "name": "Literal \":status\""
                },
                "type": "expr",
                "width": 86,
                "height": 70,
                "selected": false,
                "positionAbsolute": {
                    "x": 1118.6283087357358,
                    "y": 1078.402179352435
                },
                "dragging": false,
                "parentId": "123",
                "extent": "parent"
            },
            {
                "id": "115",
                "position": {
                    "x": 52.61589156257696,
                    "y": 161.78131529147447
                },
                "data": {
                    "kind": "literal",
                    "value": "\"200\"",
                    "name": "Literal \"200\""
                },
                "type": "expr",
                "width": 67,
                "height": 70,
                "selected": false,
                "positionAbsolute": {
                    "x": 1032.1961227903575,
                    "y": 1120.0428391492765
                },
                "dragging": false,
                "parentId": "123",
                "extent": "parent"
            },
            {
                "id": "117",
                "position": {
                    "x": 40,
                    "y": 250.61798073282114
                },
                "data": {
                    "kind": "literal",
                    "value": "\"X-Custom\"",
                    "name": "Literal \"X-Custom\""
                },
                "type": "expr",
                "width": 110,
                "height": 70,
                "selected": false,
                "positionAbsolute": {
                    "x": 1019.5802312277806,
                    "y": 1208.8795045906231
                },
                "dragging": false,
                "parentId": "123",
                "extent": "parent"
            },
            {
                "id": "119",
                "position": {
                    "x": 100.33154171427395,
                    "y": 323.94000921749137
                },
                "data": {
                    "kind": "literal",
                    "value": "\"SNI Matched\"",
                    "name": "Literal \"SNI Matched\""
                },
                "type": "expr",
                "width": 130,
                "height": 70,
                "selected": false,
                "positionAbsolute": {
                    "x": 1079.9117729420545,
                    "y": 1282.2015330752934
                },
                "dragging": false,
                "parentId": "123",
                "extent": "parent"
            },
            {
                "id": "125",
                "position": {
                    "x": 1371.8788635545159,
                    "y": 464.2510397582905
                },
                "data": {
                    "kind": "literal",
                    "value": "1",
                    "name": "Literal 1"
                },
                "type": "expr",
                "width": 67,
                "height": 70,
                "selected": false,
                "positionAbsolute": {
                    "x": 1371.8788635545159,
                    "y": 464.2510397582905
                },
                "dragging": false
            },
            {
                "id": "126",
                "position": {
                    "x": 1669.1060805551483,
                    "y": 929.3446596815037
                },
                "data": {
                    "kind": "call",
                    "name": "http::proxy-http::response::clear",
                    "n_args": 0,
                    "output": true
                },
                "type": "expr",
                "width": 269,
                "height": 48,
                "selected": false,
                "positionAbsolute": {
                    "x": 1669.1060805551483,
                    "y": 929.3446596815037
                },
                "dragging": false
            }
        ];

        const edges: Edge[] = [
            {
                "source": "105",
                "sourceHandle": "flow-out",
                "target": "108",
                "targetHandle": "flow-in",
                "data": {
                    "kind": "flow"
                },
                "id": "reactflow__edge-105flow-out-108flow-in",
                "selected": false
            },
            {
                "source": "108",
                "sourceHandle": "flow-out",
                "target": "110",
                "targetHandle": "flow-in",
                "data": {
                    "kind": "flow"
                },
                "id": "reactflow__edge-108flow-out-110flow-in",
                "selected": false
            },
            {
                "source": "110",
                "sourceHandle": "flow-out",
                "target": "111",
                "targetHandle": "flow-in",
                "data": {
                    "kind": "flow"
                },
                "id": "reactflow__edge-110flow-out-111flow-in",
                "selected": false
            },
            {
                "source": "105",
                "sourceHandle": "flow-out",
                "target": "104",
                "targetHandle": "then",
                "data": {
                    "kind": "control"
                },
                "id": "reactflow__edge-105flow-out-104then",
                "selected": false
            },
            {
                "source": "114",
                "sourceHandle": "value",
                "target": "108",
                "targetHandle": "arg-0",
                "data": {
                    "kind": "data"
                },
                "id": "reactflow__edge-114value-108arg-0",
                "selected": false
            },
            {
                "source": "115",
                "sourceHandle": "value",
                "target": "108",
                "targetHandle": "arg-1",
                "data": {
                    "kind": "data"
                },
                "id": "reactflow__edge-115value-108arg-1",
                "selected": false
            },
            {
                "source": "117",
                "sourceHandle": "value",
                "target": "110",
                "targetHandle": "arg-0",
                "data": {
                    "kind": "data"
                },
                "id": "reactflow__edge-117value-110arg-0",
                "selected": false
            },
            {
                "source": "119",
                "sourceHandle": "value",
                "target": "110",
                "targetHandle": "arg-1",
                "data": {
                    "kind": "data"
                },
                "id": "reactflow__edge-119value-110arg-1",
                "selected": false
            },
            {
                "source": "125",
                "sourceHandle": "value",
                "target": "104",
                "targetHandle": "cond",
                "data": {
                    "kind": "data"
                },
                "id": "reactflow__edge-125value-104cond"
            },
            {
                "source": "126",
                "sourceHandle": "flow-out",
                "target": "104",
                "targetHandle": "else",
                "data": {
                    "kind": "control",
                    "branch": "else"
                },
                "id": "reactflow__edge-126flow-out-104else"
            }
        ];


        const program = generateProgram(nodes, edges)

        expect(normalizeScheme(program)).toBe(
            normalizeScheme(`(let ((cx-122 (stdlib-telemetry::tracing::start-span tracer "root" (option::stdlib-telemetry_context::none) (option::list::stdlib-telemetry_attribute::none) 0)) (p-tmp-122 (if 1 (begin (let ((cx-123 (stdlib-telemetry::tracing::start-span tracer "left" (option::stdlib-telemetry_context::some cx-122) (option::list::stdlib-telemetry_attribute::none) 0)) (p-tmp-123 (begin (http::proxy-http::response::clear) (let ((p-115 "200") (p-114 ":status")) (http::proxy-http::response::set-header p-114 p-115)) (let ((p-119 "SNI Matched") (p-117 "X-Custom")) (http::proxy-http::response::set-header p-117 p-119)) (http::proxy-http::send-response)))) (begin (stdlib-telemetry::tracing::end-span cx-123 0) p-tmp-123))) (http::proxy-http::response::clear)))) (begin (stdlib-telemetry::tracing::end-span cx-122 0) p-tmp-122))`)
        )
    })

})
