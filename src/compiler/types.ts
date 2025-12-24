export type Literal = number | string | boolean

export type Let = {
    type: 'let',
    bindings: { varName: string, expr: Expression }[]
    body: Expression
}

export type LetStar = {
    type: 'let*',
    bindings: { varName: string, expr: Expression }[]
    body: Expression
}

export type Call = {
    type: 'call',
    name: string
    args: Expression[]
}

export type Span = {
    type: 'span',
    name: string,
    parentContext: string | null,
    spanContext: string,
    wrapping: Expression
}

export type ExprObj = Call | Let | LetStar | Span
export type Expression = Literal | ExprObj

export function isExprObj(expr: Expression): expr is ExprObj {
    return typeof expr === 'object' && expr !== null && 'type' in expr
}