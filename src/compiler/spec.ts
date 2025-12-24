// expression nodes data

import type { ExprNodeData } from "../types";


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
    | { kind: "start-span"; spanName: string; context: string }
    | { kind: "end-span"; context: string };

// TODO: load from config file
export function renderSpan(op: SpanOp): string {
    const template = span_templates[op.kind].template;
    return template.replace(/\$\{(\w+)\}/g, (_, key) => op[key as keyof SpanOp] as string);
}
