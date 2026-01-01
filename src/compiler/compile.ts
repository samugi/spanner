import { generateScheme } from "./IrToScheme";
import type { Node, Edge } from 'reactflow'
import { generateIrSubProgram } from './graphToIr'

export function generateProgram(nodes: Node[], edges: Edge[]): string {
    const nodeIds = new Set(nodes.map(n => n.id));
    const result = generateIrSubProgram(nodes, edges, nodeIds);
    return generateScheme(result || '');
}
