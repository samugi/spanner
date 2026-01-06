// expression nodes data

import type { ExprNodeData } from "../types";
import type { Symbol } from "./types";

// load from the config file at the root at config.json
import configFile from '../../compiler-spec.json' assert { type: 'json' };



export const coreProcedures = configFile.core_procedures as Record<string, ExprNodeData>;
export const extraProcedures = configFile.extra_procedures as Record<string, ExprNodeData>;

export const procedureDataMapping: Record<string, ExprNodeData> = {
    ...coreProcedures,
    ...extraProcedures,
};

export type TemplateData = {
    template: string;
}
let span_templates = configFile.templates as Record<string, TemplateData>;

export type SpanOp =
    | { kind: "start-span"; spanName: string; context: string | null }
    | { kind: "end-span"; context: string };

// TODO: load from config file
export function renderSpan(op: SpanOp): string {
    // if op kind is start-span wrap context in option
    if (op.kind === "start-span") {
        op.context = op.context ? `(option::stdlib-telemetry_context::some ${op.context})` : '(option::stdlib-telemetry_context::none)';
    }
    const template = span_templates[op.kind].template;
    return template.replace(/\$\{(\w+)\}/g, (_, key) => op[key as keyof SpanOp] as string);
}

export function newParamSymbol(id: string): Symbol {
    return { id, prefix: 'p' } as Symbol
}

export function newCxSymbol(id: string): Symbol {
    return { id, prefix: 'cx' } as Symbol
}

export function newRetSymbol(): Symbol {
    const id = (Math.random().toString(36).substring(2, 15));
    const prefix = 'ret';
    return { id, prefix } as Symbol
}