export type Literal = number | string | boolean

export type Let = {
    type: 'let',
    bindings: Binding[]
    body: Expression
}

export type LetStar = {
    type: 'let*',
    bindings: Binding[]
    body: Expression
}

export type Call = {
    type: 'call',
    name: string
    args: Expression[]
}

export type Binding = {
    sym: Symbol
    expr: Expression
}

export type VarRef = {
    type: 'var'
    sym: Symbol
}

export type Symbol = {
    id: string
    prefix: string
}

export type ExprObj = Call | Let | LetStar
export type Expression = Literal | ExprObj | VarRef

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

export function isVar(expr: Expression): expr is VarRef {
    return (expr as VarRef).type === 'var'
}