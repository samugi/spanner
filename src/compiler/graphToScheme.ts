import type { Node, Edge } from 'reactflow'

export function generateProgram(
    nodes: Node[],
    edges: Edge[],
): string {
    return _generateProgram(nodes, edges, new Set(), null)
}

// Generate expression from a node
// this depends on other nodes and edges as well because
// depending on the node's inputs/outputs it may have to be generated differently (with/without lets, etc)
//
// This is also where we wrap calls in spans
function generateExpr(nodeId: string, nodes: Node[], edges: Edge[], previous: string | null = null, nodeSpan: Node | null, visited: Set<string>): string {
    const node = nodes.find(n => n.id === nodeId)!
    // TODO: useful for squashing lets together? i.e. in case of flow and no data this is the only connection
    const incoming_flow = edges.filter(e => e.target === nodeId && e.data && e.data.kind === 'flow')
    const incoming_data = edges.filter(e => e.target === nodeId && e.data && e.data.kind === 'data')

    switch (node.data.kind) {
        case 'literal': {
            // literal has no inputs
            // can be a simple let that wraps previous
            if (previous) {
                let param_id = `p-${node.id}`
                return `(let (( ${param_id} ${node.data.value} )) ${previous} )`
            }
            return node.data.value.toString()
        }
        case 'call': {
            let call_expr = `(let (( ${'p-' + node.id} (${node.data.name} `;

            // if the node has no input, we can close the let body without passing
            // any arguments, otherwise we have to pass them
            if (incoming_data.length === 0) {
                call_expr = call_expr + ` )))`;

            } else {
                call_expr = call_expr + `${incoming_data
                    // sort works because arg-0, arg-1, ... are lexicographically ordered
                    .sort((a, b) => a.targetHandle!.localeCompare(b.targetHandle!))
                    // we name the args as p-<node id> to match let bindings
                    .map(e => nodes.find(n => n.id === e.source)?.id!)
                    .map(id => `p-${id}`)
                    .join(' ')} )))`;
            }

            if (previous) {
                call_expr = call_expr + ` ${previous} )`
            } else {
                call_expr = call_expr + ` p-${node.id} )` // TODO: noop
            }


            // Span wrapping:
            // if all nodes in the span have been visited it means we are at the root of the span
            if (nodeSpan && nodeSpan.data.wrapsNodeIds.every((id: string) => visited.has(id))) {
                // if the span has a parent, we need to pass the parent context
                let spanNode = nodes.find(n => n.id === nodeSpan.id)!;
                if (spanNode == undefined) {
                    throw new Error(`Span node with id ${nodeSpan.id} not found`);
                }
                let parentSpan = spanNode.parentId ? nodes.find(n => n.id === spanNode.parentId) : null;
                let cx = parentSpan ? `cx-${parentSpan.id}` : 'none'

                // wrap the call_expr in the span
                let cxId = `cx-${nodeSpan.id}`
                call_expr = `(let ((${cxId} (start-span "${nodeSpan.data.name}" ${cx})))
  (begin
    ${call_expr}
    (end-span ${cxId})
  )
)`
            }

            return call_expr;
        }
        default: {
            throw new Error(`Unknown node kind: ${node.data.kind}`)
        }
    }
}

function _generateProgram(nodes: Node[], edges: Edge[], visited: Set<string>, result: string | null): string {
    if (visited.size === nodes.length) {
        return result || '';
    }

    for (const n of nodes) {
        // visit all the children of the current node n
        const outgoing = edges.filter(e => e.source === n.id)
        if (outgoing.every(e => visited.has(e.target)) && !visited.has(n.id) && n.type === 'expr') {
            visited.add(n.id);
            let spanNode = n.parentId ? nodes.find(s => s.type === 'span' && s.id === n.parentId) : null;
            result = generateExpr(n.id, nodes, edges, result, spanNode || null, visited);
            break;
        } else if (n.type !== 'expr' && !visited.has(n.id)) {
            // span nodes are just containers, we can skip them
            visited.add(n.id);
            break;
        }
    }

    return _generateProgram(nodes, edges, visited, result);
}
