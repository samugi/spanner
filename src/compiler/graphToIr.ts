// Generate intermediate representation
// this depends on other nodes and edges as well because depending on the node's
// inputs/outputs it may have to be generated differently (with/without lets, etc)
//

import type { Node, Edge } from 'reactflow'
import { type Expression, type Let, type Call, type Symbol, isExprObj, isLetLike, type LetStar, type VarRef } from './types'
import _ from 'lodash';

function newParamSymbol(id: string): Symbol {
    return { id, prefix: 'p' } as Symbol
}

function newCxSymbol(id: string): Symbol {
    return { id, prefix: 'cx' } as Symbol
}

function usesVar(expr: Expression, sym: Symbol): boolean {
    if (typeof expr === 'number' || typeof expr === 'boolean' || typeof expr === 'string') {
        return false
    }

    // Helper: check if expression creates a new scope
    // in which case we don't look inside it as we are only interested
    // in top-level variable usages for let-squashing
    const createsScope = (e: Expression): boolean => {
        return isExprObj(e) && (isLetLike(e));
    }

    switch (expr.type) {
        case 'var':
            return _.isEqual((expr as VarRef).sym, sym);
        case 'call':
            return expr.args.some(arg =>
                !createsScope(arg) && usesVar(arg, sym)
            )

        case 'let':
        case 'let*':
            return expr.bindings.some(b =>
                !createsScope(b.expr) && usesVar(b.expr, sym)
            )

        default: {
            const _exhaustive: never = expr
            return _exhaustive
        }
    }
}

function squashLets(
    expr: Expression,
    outParam: Symbol,
    outExpr: Expression
): Let | LetStar | null {
    if (!isLetLike(expr)) {
        return null
    }

    const needsLetStar = expr.bindings.some(b => usesVar(b.expr, outParam))

    return {
        type: needsLetStar ? 'let*' : expr.type,
        bindings: [
            { sym: outParam, expr: outExpr },
            ...expr.bindings,
        ],
        body: expr.body,
    } as Let | LetStar
}

// This is also where we wrap calls in spans
export function generateIR(nodeId: string, nodes: Node[], edges: Edge[], previous: Expression | null, nodeSpan: Node | null, visited: Set<string>): Expression {
    const node = nodes.find(n => n.id === nodeId)!
    const incoming_data = edges.filter(e => e.target === nodeId && e.data && e.data.kind === 'data')

    const symbol = newParamSymbol(node.id);

    switch (node.data.kind) {
        case 'literal': {
            if (previous) {
                return squashLets(previous, symbol, node.data.value) ||
                    {
                        type: 'let',
                        bindings: [{ sym: symbol, expr: node.data.value }],
                        body: previous
                    } as Let;
            }
            return node.data.value;
        }
        case 'call': {

            let binding = {
                sym: symbol, expr: {
                    type: 'call',
                    name: node.data.name,
                    args: incoming_data
                        .sort((a, b) => a.targetHandle!
                            .localeCompare(b.targetHandle!))
                        .map(e => ({ type: 'var', sym: newParamSymbol(`${nodes.find(n => n.id === e.source)?.id!}`) }))
                }
            };

            let expr: Expression | null = null;
            if (previous) {
                expr = squashLets(previous, binding.sym, binding.expr as Expression);
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
                let incomingCx = parentSpan ? parentSpan.id : 'none'

                // wrap the call_expr in the span
                let outgoingCx = nodeSpan.id

                // a Span is just a Let that starts a span, runs some code, then ends the span
                // TODO: load from template etc...
                expr = {
                    type: 'let',
                    bindings: [
                        {
                            sym: newCxSymbol(outgoingCx),
                            expr: {
                                type: 'call',
                                name: 'start-span',
                                args: [
                                    `"${nodeSpan.data.name}"`,
                                    { type: 'var', sym: newCxSymbol(incomingCx) }
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
                                args: [{ type: 'var', sym: newCxSymbol(outgoingCx) }]
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
