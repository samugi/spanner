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

export type Expression = Literal | Call | Let | LetStar | Span