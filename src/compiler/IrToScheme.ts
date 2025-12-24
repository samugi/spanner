import type { Node, Edge } from 'reactflow'
import { type Expression, isLet, isLetStar, isCall } from './types'
import { generateIR } from './graphToIr'

export function generateProgram(
    nodes: Node[],
    edges: Edge[],
): string {
    return _generateProgram(nodes, edges, new Set(), null)
}

// Generate Scheme from the intermediate representation
function generateScheme(expr: Expression): string {
    // Handle primitives
    if (typeof expr !== 'object') {
        return expr.toString()
    }

    if (isLet(expr)) {
        const bindings = expr.bindings
            .map(b => `(${b.varName} ${generateScheme(b.expr)})`)
            .join(' ')

        return `(let (${bindings}) ${generateScheme(expr.body)})`

    } else if (isLetStar(expr)) {
        const bindings = expr.bindings
            .map(b => `(${b.varName} ${generateScheme(b.expr)})`)
            .join(' ')
        return `(let* (${bindings}) ${generateScheme(expr.body)})`

    } else if (isCall(expr)) {
        return `(${expr.name} ${expr.args.map(arg => generateScheme(arg)).join(' ')})`;

    }

    const _exhaustive: never = expr
    return _exhaustive
}

function _generateProgram(nodes: Node[], edges: Edge[], visited: Set<string>, result: Expression | null): string {
    if (visited.size === nodes.length) {
        return generateScheme(result || '');
    }

    for (const n of nodes) {
        // visit all the children of the current node n
        const outgoing = edges.filter(e => e.source === n.id)
        if (outgoing.every(e => visited.has(e.target)) && !visited.has(n.id) && n.type === 'expr') {
            visited.add(n.id);
            let spanNode = n.parentId ? nodes.find(s => s.type === 'span' && s.id === n.parentId) : null;
            result = generateIR(n.id, nodes, edges, result, spanNode || null, visited);
            break;
        } else if (n.type !== 'expr' && !visited.has(n.id)) {
            // span nodes are just containers, we can skip them
            visited.add(n.id);
            break;
        }
    }

    return generateScheme(_generateProgram(nodes, edges, visited, result));
}

