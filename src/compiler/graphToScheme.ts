import type { Node, Edge } from 'reactflow'
import { renderSpan } from './spec'
import { type Expression, type Let, type Literal, type Call, type Span, type LetStar, type ExprObj, isExprObj } from './types'

export function generateProgram(
    nodes: Node[],
    edges: Edge[],
): string {
    return _generateProgram(nodes, edges, new Set(), null)
}

function usesVar(expr: Expression, name: string): boolean {
    // primitives
    if (typeof expr === 'number' || typeof expr === 'boolean') {
        return false
    }

    if (typeof expr === 'string') { // TODO: is this correct?
        return expr === name
    }

    const exprNode = expr as ExprObj

    // structured expressions
    switch (exprNode.type) {
        case 'call':
            return (exprNode as Call).args.some(arg => arg.toString() === name)

        case 'let':
        case 'let*':
            return (
                (exprNode as Let | LetStar).bindings.some(b => {
                    if (typeof b.expr === 'string' || typeof b.expr === 'number' || typeof b.expr === 'boolean') {
                        return usesVar(b.expr, name)
                    }

                    switch (b.expr.type) {
                        case 'call':
                            return usesVar(b.expr, name)
                        // nested lets/spans don't require let* because the inner bindings
                        // are not visible outside
                        case 'let':
                        case 'let*':
                        case 'span':
                            return false
                        default:
                            return false
                    }
                })
            )

        case 'span':
            return false

        default: {
            const _exhaustive: never = exprNode
            return _exhaustive
        }
    }
}


function squashLets(
    expr: Expression,
    outParam: string,
    outExpr: Expression
): ExprObj | null {
    // Only proceed if expr is an ExprObj
    if (!isExprObj(expr)) {
        return null
    }

    // Only proceed if expr is a let or let*
    if (expr.type !== 'let' && expr.type !== 'let*') {
        return null
    }

    const letExpr = expr as Let | LetStar
    const needsLetStar = letExpr.bindings.some(b => usesVar(b.expr, outParam))

    return {
        ...letExpr,
        type: needsLetStar ? 'let*' : letExpr.type,
        bindings: [
            { varName: outParam, expr: outExpr },
            ...letExpr.bindings,
        ],
    } as ExprObj
}


// Generate intermediate representation
// this depends on other nodes and edges as well because depending on the node's
// inputs/outputs it may have to be generated differently (with/without lets, etc)
//
// This is also where we wrap calls in spans
function generateIntermediate(nodeId: string, nodes: Node[], edges: Edge[], previous: Expression | null, nodeSpan: Node | null, visited: Set<string>): Expression {
    const node = nodes.find(n => n.id === nodeId)!
    const incoming_data = edges.filter(e => e.target === nodeId && e.data && e.data.kind === 'data')

    switch (node.data.kind) {
        case 'literal': {
            if (previous) {
                return squashLets(previous, `p-${node.id}`, node.data.value) ||
                    {
                        type: 'let',
                        bindings: [{ varName: `p-${node.id}`, expr: node.data.value }],
                        body: previous
                    } as Let;
            }
            return node.data.value as Literal
        }
        case 'call': {

            let binding = {
                varName: `p-${node.id}`, expr: {
                    type: 'call',
                    name: node.data.name,
                    args: incoming_data
                        .sort((a, b) => a.targetHandle!
                            .localeCompare(b.targetHandle!))
                        .map(e => `p-${nodes.find(n => n.id === e.source)?.id!}`)
                }
            };

            let expr: Expression | null = null;
            if (previous) {
                expr = squashLets(previous, binding.varName, binding.expr as Expression);
            }
            expr = expr || { type: 'let', bindings: [binding], body: previous ? previous : `p-${node.id}` } as Expression

            // Span wrapping:
            const nodesWrappedBySpan = nodes.filter(n => n.type === 'expr' && n.parentId === nodeSpan?.id);
            // if all nodes in the span have been visited it means we are at the root of the span
            if (nodeSpan && nodesWrappedBySpan.every((n: Node) => visited.has(n.id))) {
                // if the span has a parent, we need to pass the parent context
                let spanNode = nodes.find(n => n.id === nodeSpan.id)!;
                if (spanNode == undefined) {
                    throw new Error(`Span node with id ${nodeSpan.id} not found`);
                }
                let parentSpan = spanNode.parentId ? nodes.find(n => n.id === spanNode.parentId) : null;
                let cx = parentSpan ? `cx-${parentSpan.id}` : 'none'

                // wrap the call_expr in the span
                let cxId = `cx-${nodeSpan.id}`
                expr = {
                    type: 'span',
                    name: nodeSpan.data.name,
                    parentContext: cx,
                    spanContext: cxId,
                    wrapping: expr
                } as Span
            }

            return expr;
        }
        default: {
            throw new Error(`Unknown node kind: ${node.data.kind}`)
        }
    }
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
            result = generateIntermediate(n.id, nodes, edges, result, spanNode || null, visited);
            break;
        } else if (n.type !== 'expr' && !visited.has(n.id)) {
            // span nodes are just containers, we can skip them
            visited.add(n.id);
            break;
        }
    }

    return generateScheme(_generateProgram(nodes, edges, visited, result));
}
function isLetLike(expr: Expression) {
    throw new Error('Function not implemented.')
}

