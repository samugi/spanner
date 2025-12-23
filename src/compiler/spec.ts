// expression nodes data

import type { ExprNodeData } from "../types";

// TODO: load from config file
export const procedureDataMapping: Record<string, ExprNodeData> = {
    "+": { kind: 'call', name: '+', n_args: 2 },
    "display": { kind: 'call', name: 'display', n_args: 1 },
}