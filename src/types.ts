// edge kinds
export type EdgeKind = 'flow' | 'data'

// Call nodes data spec
export type CallSpec = {
    kind: string | 'call'
    name: string
    n_args: number
    wrapsNodeIds?: string[]
}
