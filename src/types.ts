import type { Node } from 'reactflow'

// edge kinds
export type EdgeKind = 'flow' | 'data'

// Call nodes data spec
export type CallSpec = {
    kind: string | 'call'
    name: string
    n_args: number
}

export type LiteralNodeData = {
    kind: 'literal'
    name: string
    value: number // TODO: support other literal types
}

export type CallNodeData = {
    kind: 'call'
    name: string
    n_args: number
}

export type SpanNodeData = {
    name: string
    wrapsNodeIds: string[]
}

export type ExprNodeData = LiteralNodeData | CallNodeData

export type ExprNode = Node<ExprNodeData, 'expr'>
export type SpanNode = Node<SpanNodeData, 'span'>
