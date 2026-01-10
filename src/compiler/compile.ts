import { generateScheme, wrapSchemeWithTracing } from "./IrToScheme";
import type { Node, Edge } from 'reactflow'
import { compressTir, generateIrMultiFlow, generateTir } from './graphToIr'

function hasTracing(nodes: Node[]): boolean {
    return nodes.some(n => n.data?.kind === 'span');
}

export function generateProgram(nodes: Node[], edges: Edge[]): string {
    const result = generateIrMultiFlow(nodes, edges, null, null);
    const spannedResult = generateTir(result, result, nodes.filter(n => n.data?.kind === 'span'), nodes.filter(n => n.data?.kind === 'span'), new Set<string>(), new Set<string>(), null);
    const compressedResult = compressTir(spannedResult);
    return generateScheme(compressedResult || '');
}

export function generateTracedProgram(nodes: Node[], edges: Edge[]): string {
    let program = generateProgram(nodes, edges);
    if (!hasTracing(nodes)) {
        return program;
    }
    return wrapSchemeWithTracing(program);
}
