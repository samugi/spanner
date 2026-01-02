import type { Edge } from "reactflow";

function makeid(length: number): string {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

export function makeNodeId(): string {
    return makeid(8);
}

export function belongsToControlFlow(nodeId: string, edges: Edge[]): boolean {
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
            // if (e.source === current && !visited.has(e.target) && e.data?.kind !== 'control') {
            //     stack.push(e.target);
            // }
            if (e.target === current && !visited.has(e.source) && e.data?.kind !== 'control') {
                stack.push(e.source);
            }
        }
    }

    return false;
}
