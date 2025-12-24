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

export type ExprObj = Call | Let | LetStar
export type Expression = Literal | ExprObj

// Type guards - like Rust's pattern matching
export function isExprObj(expr: Expression): expr is ExprObj {
    return typeof expr === 'object' && expr !== null && 'type' in expr
}

export function isLet(expr: Expression): expr is Let {
    return isExprObj(expr) && expr.type === 'let'
}

export function isLetStar(expr: Expression): expr is LetStar {
    return isExprObj(expr) && expr.type === 'let*'
}

export function isCall(expr: Expression): expr is Call {
    return isExprObj(expr) && expr.type === 'call'
}

export function isLetLike(expr: Expression): expr is Let | LetStar {
    return isLet(expr) || isLetStar(expr)
}
