import { generateScheme } from "./IrToScheme";
import type { Node, Edge } from 'reactflow'
import { generateIrSubProgram } from './graphToIr'
import { belongsToControlFlow } from "../utils";

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
