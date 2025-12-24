// Generate intermediate representation
// this depends on other nodes and edges as well because depending on the node's
// inputs/outputs it may have to be generated differently (with/without lets, etc)
//

import type { Node, Edge } from 'reactflow'
import { type Expression, type Let, type Literal, type Call, type LetStar, type ExprObj, isExprObj } from './types'

function usesVar(expr: Expression, name: string): boolean {
    if (typeof expr === 'number' || typeof expr === 'boolean') {
        return false
    }

    // String literals vs variable references
    if (typeof expr === 'string') {
        return expr === name
    }

    // Helper: check if expression creates a new scope
    // in which case we don't look inside it as we are only interested
    // in top-level variable usages for let-squashing
    const createsScope = (e: Expression): boolean => {
        return typeof e === 'object' && 'type' in e &&
            (e.type === 'let' || e.type === 'let*')
    }

    // Structured expressions
    const exprNode = expr as ExprObj

    switch (exprNode.type) {
        case 'call': {
            const call = exprNode as Call
            return call.args.some(arg => !createsScope(arg) && usesVar(arg, name))
        }

        case 'let':
        case 'let*': {
            const letExpr = exprNode as Let | LetStar
            return letExpr.bindings.some(b => !createsScope(b.expr) && usesVar(b.expr, name))
        }

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

// This is also where we wrap calls in spans
export function generateIR(nodeId: string, nodes: Node[], edges: Edge[], previous: Expression | null, nodeSpan: Node | null, visited: Set<string>): Expression {
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

            if (!expr) {
                // if there's a previous, we need to create a let, else just return the binding expr
                expr = previous ? {
                    type: 'let',
                    bindings: [binding],
                    body: previous
                } as Expression : binding.expr as Expression;
            }

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

                // a Span is just a Let that starts a span, runs some code, then ends the span
                // TODO: load from template etc...
                expr = {
                    type: 'let',
                    bindings: [
                        {
                            varName: cxId,
                            expr: {
                                type: 'call',
                                name: 'start-span',
                                args: [
                                    `"${nodeSpan.data.name}"`,
                                    cx
                                ]
                            } as Call
                        }
                    ],
                    body: {
                        type: 'call',
                        name: 'begin',
                        args: [
                            expr,
                            {
                                type: 'call',
                                name: 'end-span',
                                args: [cxId]
                            } as Call
                        ]
                    } as Call
                } as Let;
            }

            return expr;
        }
        default: {
            throw new Error(`Unknown node kind: ${node.data.kind}`)
        }
    }
}