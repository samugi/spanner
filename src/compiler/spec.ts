// expression nodes data

import type { ExprNodeData } from "../types";

// TODO: load from config file
export const procedureDataMapping: Record<string, ExprNodeData> = {
    "+": { kind: 'call', name: '+', n_args: 2 },
    "-": { kind: 'call', name: '-', n_args: 2 },
    "*": { kind: 'call', name: '*', n_args: 2 },
    "/": { kind: 'call', name: '/', n_args: 2 },

    "=": { kind: 'call', name: '=', n_args: 2 },
    "<": { kind: 'call', name: '<', n_args: 2 },
    "<=": { kind: 'call', name: '<=', n_args: 2 },
    ">": { kind: 'call', name: '>', n_args: 2 },
    ">=": { kind: 'call', name: '>=', n_args: 2 },

    "and": { kind: 'call', name: 'and', n_args: 2 },
    "or": { kind: 'call', name: 'or', n_args: 2 },
    "not": { kind: 'call', name: 'not', n_args: 1 },

    "display": { kind: 'call', name: 'display', n_args: 1 },
}

let config = {
    "start-span": "(start-span \"${spanName}\" ${context})",
    "end-span": "(end-span ${context})"
}

export type SpanOp =
    | { kind: "start-span"; spanName: string; context: string }
    | { kind: "end-span"; context: string };

// TODO: load from config file
export function renderSpan(op: SpanOp): string {
    const template = config[op.kind];
    return template.replace(/\$\{(\w+)\}/g, (_, key) => op[key as keyof SpanOp] as string);
}
