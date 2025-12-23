import type { Node } from 'reactflow'

// edge kinds
export type EdgeKind = 'flow' | 'data'

export type LiteralNodeData = {
    kind: 'literal'
    name: string
    value: number | string | boolean
}

export type CallNodeData = {
    kind: 'call'
    name: string
    n_args: number
}

export type SpanNodeData = {
    name: string
}

export type ExprNodeData = LiteralNodeData | CallNodeData

export type ExprNode = Node<ExprNodeData, 'expr'>
export type SpanNode = Node<SpanNodeData, 'span'>
