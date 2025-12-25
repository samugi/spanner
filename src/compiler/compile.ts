import { generateScheme } from "./IrToScheme";
import type { Node, Edge } from 'reactflow'
import { type Expression } from './types'
import { generateIR, generateIrSubProgram } from './graphToIr'


export function generateProgram(nodes: Node[], edges: Edge[]): string {
    const allNodeIds = new Set(nodes.map(n => n.id));
    const visited = new Set<string>();
    const result = generateIrSubProgram(nodes, edges, allNodeIds, visited);
    return generateScheme(result || '');
}