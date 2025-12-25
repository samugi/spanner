import { generateScheme } from "./IrToScheme";
import type { Node, Edge } from 'reactflow'
import { generateIrSubProgram } from './graphToIr'

export function generateProgram(nodes: Node[], edges: Edge[]): string {
    const nonSpanNodeIds = new Set(nodes.filter(n => n.type !== 'span').map(n => n.id));
    const result = generateIrSubProgram(nodes, edges, nonSpanNodeIds, null);
    return generateScheme(result || '');
}
