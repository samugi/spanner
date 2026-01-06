import { generateScheme, wrapSchemeWithTracing } from "./IrToScheme";
import type { Node, Edge } from 'reactflow'
import { generateIrMultiFlow } from './graphToIr'

function hasTracing(nodes: Node[]): boolean {
    return nodes.some(n => n.data?.kind === 'span');
}

export function generateProgram(nodes: Node[], edges: Edge[]): string {
    const result = generateIrMultiFlow(nodes, edges);
    return generateScheme(result || '');
}

export function generateTracedProgram(nodes: Node[], edges: Edge[]): string {
    let program = generateProgram(nodes, edges);
    if (!hasTracing(nodes)) {
        return program;
    }
    return wrapSchemeWithTracing(program);
}
