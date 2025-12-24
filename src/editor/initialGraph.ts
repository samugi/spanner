


// initial edges


import {
    type Edge,
} from 'reactflow'
import { type EdgeKind, type ExprNode } from '../types'
import { procedureDataMapping } from '../compiler/spec';

import graphConfig from '../../graph-bootstrap.json' assert { type: 'json' };

export const initialNodes: ExprNode[] = graphConfig.nodes.map((n: any) => {
    if (n.data.kind === 'call' && procedureDataMapping[n.data.name]) {
        return {
            ...n,
            data: procedureDataMapping[n.data.name]
        };
    }
    return n;
});

export const initialEdges: Edge[] = graphConfig.edges.map((e: any) => ({
    ...e,
    data: { kind: e.data.kind as EdgeKind }
}));