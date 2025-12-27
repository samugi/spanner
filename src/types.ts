import type { Node } from 'reactflow'

// edge kinds
export type EdgeKind = 'flow' | 'data' | 'control'

export type LiteralNodeData = {
    kind: 'literal'
    name: string
    value: number | string | boolean
}

export type CallNodeData = {
    kind: 'call'
    name: string
}

export type IfNodeData = {
    kind: 'if',
    name: string
}

export type CondNodeData = {
    kind: 'cond',
    name: string
}

export type SpanNodeData = {
    name: string
}

export type ExprNodeData = LiteralNodeData | CallNodeData | IfNodeData | CondNodeData
export type ExprNode = Node<ExprNodeData, 'expr'>
export type SpanNode = Node<SpanNodeData, 'span'>
export type IfNode = Node<IfNodeData, 'if'>
export type CondNode = Node<CondNodeData, 'cond'>
