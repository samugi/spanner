import type { Node, Edge } from 'reactflow'
import { renderSpan } from './spec'
import { type Expression, type Let, type Call, type Span, type LetStar, type ExprObj } from './types'
import { generateIR } from './graphToIr'

export function generateProgram(
    nodes: Node[],
    edges: Edge[],
): string {
    return _generateProgram(nodes, edges, new Set(), null)
}

// Generate Scheme from the intermediate representation
function generateScheme(intermediate: Expression): string {
    if ((intermediate as Let).type === 'let') {
        const letNode = intermediate as Let

        const bindings = letNode.bindings
            .map(b => `(${b.varName} ${generateScheme(b.expr)})`)
            .join(' ')

        return `(let (${bindings}) ${generateScheme(letNode.body)})`

    } else if ((intermediate as LetStar).type === 'let*') {
        const letStarNode = intermediate as LetStar

        const bindings = letStarNode.bindings
            .map(b => `(${b.varName} ${generateScheme(b.expr)})`)
            .join(' ')
        return `(let* (${bindings}) ${generateScheme(letStarNode.body)})`

    } else if ((intermediate as Span).type === 'span') {
        const startSpan = renderSpan({ kind: "start-span", spanName: (intermediate as Span).name, context: (intermediate as Span).parentContext || 'none' });
        const endSpan = renderSpan({ kind: "end-span", context: (intermediate as Span).spanContext });
        return `(let (( ${(intermediate as Span).spanContext} ${startSpan} ))
  (begin
    ${generateScheme((intermediate as Span).wrapping)}
    ${endSpan}
  )
)`

    } else if ((intermediate as Call).type == 'call') {
        return `(${(intermediate as Call).name} ${(intermediate as Call).args.join(' ')})`;

    } else { // literal
        return intermediate.toString();
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

