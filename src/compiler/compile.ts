import { generateScheme } from "./IrToScheme";
import type { Node, Edge } from 'reactflow'
import { generateIrSubProgram } from './graphToIr'

function belongsToControlFlow(nodeId: string, edges: Edge[]): boolean {
    const visited = new Set<string>();
    const stack = [nodeId];

    while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);

        for (const e of edges) {
            if (e.source === current && e.data?.kind === 'control') {
                return true;
            }
            if (e.source === current && !visited.has(e.target)) {
                stack.push(e.target);
            }
        }
    }

    return false;
}

export function generateProgram(nodes: Node[], edges: Edge[]): string {
    // do not traverse (directly):
    // * nodes that are part of conditional branches (control flow)
    //   like then, else and conds - they are traversed as subprograms

    const filteredNodes = nodes.filter(n => {
        if (belongsToControlFlow(n.id, edges)) return false;
        return true;
    });
    const filteredNodesIds = new Set(filteredNodes.map(n => n.id));

    const result = generateIrSubProgram(nodes, edges, filteredNodesIds, null);
    return generateScheme(result || '');
}
