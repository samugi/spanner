


// initial edges


import {
    type Edge,
} from 'reactflow'
import { type EdgeKind, type ExprNode } from '../types'
import { procedureDataMapping } from '../compiler/spec';

// initial nodes and edges
// TODO: load from config file
export const initialNodes: ExprNode[] = [
    {
        id: '1',
        position: { x: 50, y: 100 },
        data: { kind: 'literal', value: 1, name: 'Literal 1' },
        type: 'expr',
    },
    {
        id: '2',
        position: { x: 50, y: 200 },
        data: { kind: 'literal', value: 2, name: 'Literal 2' },
        type: 'expr',
    },
    {
        id: '3',
        position: { x: 170, y: 150 },
        data: procedureDataMapping['+'],
        type: 'expr',
    },
    {
        id: '4',
        position: { x: 370, y: 150 },
        data: procedureDataMapping['display'],
        type: 'expr',
    },
    {
        id: '5',
        position: { x: 570, y: 150 },
        data: procedureDataMapping['display'],
        type: 'expr',
    },
];

// TODO: load from config file
export const initialEdges: Edge[] = [
    { id: 'e1', source: '1', target: '3', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' as EdgeKind } },
    { id: 'e2', source: '2', target: '3', sourceHandle: 'value', targetHandle: 'arg-1', data: { kind: 'data' as EdgeKind } },
    { id: 'e3', source: '3', target: '4', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' as EdgeKind } },
    { id: 'e4', source: '4', target: '5', sourceHandle: 'flow-out', targetHandle: 'flow-in', data: { kind: 'flow' as EdgeKind } },
];
