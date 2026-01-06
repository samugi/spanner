export type Literal = number | string | boolean

export type Let = {
    type: 'let',
    bindings: Binding[]
    body: Expression
    spanIds: string[]
    activeSpanId: string
}

export type LetStar = {
    type: 'let*',
    bindings: Binding[]
    body: Expression
    spanIds: string[]
    activeSpanId: string
}

export type Call = {
    type: 'call',
    name: string
    args: Expression[]
    output: boolean
    spanIds: string[]
    activeSpanId: string
}

export type Binding = {
    sym: Symbol
    expr: Expression
}

export type VarRef = {
    type: 'var'
    sym: Symbol
}

export type StartSpan = {
    type: 'start-span'
    spanName: string
    context: VarRef | null
}

export type EndSpan = {
    type: 'end-span'
    context: VarRef
}

export type Symbol = {
    id: string
    prefix: string
}

export type ExprObj = Call | Let | LetStar | VarRef | StartSpan | EndSpan
export type Expression = Literal | ExprObj | VarRef | StartSpan | EndSpan

export function isExprObj(expr: Expression): expr is ExprObj {
    return typeof expr === 'object' && expr !== null && 'type' in expr
}

export function isTraceableExpr(expr: Expression): expr is Call | Let | LetStar {
    return isExprObj(expr) && (expr.type === 'call' || expr.type === 'let' || expr.type === 'let*')
}

export function isLet(expr: Expression): expr is Let {
    return isExprObj(expr) && expr.type === 'let'
}

export function isLetStar(expr: Expression): expr is LetStar {
    return isExprObj(expr) && expr.type === 'let*'
}

export function isLetLike(expr: Expression): expr is Let | LetStar {
    return isLet(expr) || isLetStar(expr)
}
