import type { Node, Edge } from 'reactflow'
import { type Expression, type Symbol } from './types'
import { generateIR } from './graphToIr'
import { renderSpan } from './spec'

export function generateProgram(
    nodes: Node[],
    edges: Edge[],
): string {
    return _generateProgram(nodes, edges, new Set(), null)
}

function renderSymbol(sym: Symbol): string {
    return `${sym.prefix}-${sym.id}`
}

// Generate Scheme from the intermediate representation
function generateScheme(expr: Expression): string {
    if (typeof expr !== 'object') {
        return expr.toString()
    }

    switch (expr.type) {
        case 'let':
            let letBindings = expr.bindings
                .map(b => `(${renderSymbol(b.sym)} ${generateScheme(b.expr)})`)
                .join(' ')

            return `(let (${letBindings}) ${generateScheme(expr.body)})`;

        case 'let*':
            let letStarBindings = expr.bindings
                .map(b => `(${renderSymbol(b.sym)} ${generateScheme(b.expr)})`)
                .join(' ')
            return `(let* (${letStarBindings}) ${generateScheme(expr.body)})`

        case 'call':
            return `(${expr.name} ${expr.args.map(arg => generateScheme(arg)).join(' ')})`;

        case 'var':
            return renderSymbol(expr.sym);

        case 'start-span':
            return renderSpan({ kind: 'start-span', spanName: expr.spanName, context: renderSymbol(expr.context.sym) });

        case 'end-span':
            return renderSpan({ kind: 'end-span', context: renderSymbol(expr.context.sym) });

        default: {
            const _exhaustive: never = expr
            return _exhaustive
        }
    }
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

