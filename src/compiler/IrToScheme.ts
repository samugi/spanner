import { type Expression, type Symbol } from './types'
import { renderSpan } from './spec'

function renderSymbol(sym: Symbol): string {
    return sym ? `${sym.prefix}-${sym.id}` : 'none';
}

// Generate Scheme from the intermediate representation
export function generateScheme(expr: Expression): string {
    if (typeof expr !== 'object') {
        return expr.toString()
    }

    switch (expr.type) {
        case 'let':
            let letBindings = expr.bindings
                .map(b => `(${renderSymbol(b.sym)} ${generateScheme(b.expr)})`)
                .join('\n')

            return `(let (${letBindings})\n  ${generateScheme(expr.body)})\n  `;

        case 'let*':
            let letStarBindings = expr.bindings
                .map(b => `(${renderSymbol(b.sym)} ${generateScheme(b.expr)})`)
                .join('\n')
            return `(let* (${letStarBindings}) ${generateScheme(expr.body)})\n  `

        case 'call': {
            const separator = expr.name === 'begin' || expr.name === 'if' || expr.name === 'cond' ? '\n' : ' '
            return `(${expr.name} ${expr.args.map(arg => generateScheme(arg)).join(separator)})`;
        }
        case 'var':
            return renderSymbol(expr.sym);
        case 'start-span':
            return renderSpan({ kind: 'start-span', spanName: expr.spanName, context: renderSymbol(expr.context?.sym) });

        case 'end-span':
            return renderSpan({ kind: 'end-span', context: renderSymbol(expr.context?.sym) });

        default: {
            const _exhaustive: never = expr
            return _exhaustive
        }
    }
}

export function wrapSchemeWithTracing(program: string): string {
    return `
(let* (
    (exporter-config
        (stdlib-telemetry::tracing::exporter-config::with-protocol
            (stdlib-telemetry::tracing::exporter-config::with-endpoint
                (stdlib-telemetry::tracing::exporter-config::new-default)
                "http://jaeger:4317")
            (stdlib-telemetry::common::new-grpc-protocol)))
    (provider
        (stdlib-telemetry::tracing::new-provider
            exporter-config
            1000
            (option::stdlib-telemetry_resource::none)))
    (tracer
        (stdlib-telemetry::tracing::new-tracer
            provider
            (option::stdlib-telemetry_scope::none))))
  ${program}
)
`.trim();
}
