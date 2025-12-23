// expression nodes data

import type { CallSpec } from "../types";

// TODO: load from config file
export const exprNodeData: Record<string, CallSpec> = {
    "+": { kind: 'call', name: '+', n_args: 2 },
    "display": { kind: 'call', name: 'display', n_args: 1 },
}