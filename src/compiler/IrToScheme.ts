import type { Node, Edge } from 'reactflow'
import { type Expression, type Symbol } from './types'
import { generateIR } from './graphToIr'
import { renderSpan } from './spec'

function renderSymbol(sym: Symbol): string {
    return `${sym.prefix}-${sym.id}`
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
                .join(' ')

            return `(let (${letBindings}) ${generateScheme(expr.body)})`;

        case 'let*':
            let letStarBindings = expr.bindings
                .map(b => `(${renderSymbol(b.sym)} ${generateScheme(b.expr)})`)
                .join(' ')
            return `(let* (${letStarBindings}) ${generateScheme(expr.body)})`

        case 'call':
            return `(${expr.name} ${expr.args.map(arg => generateScheme(arg)).join(' ')})`;

        case 'var':
            return renderSymbol(expr.sym);

        case 'start-span':
            return renderSpan({ kind: 'start-span', spanName: expr.spanName, context: renderSymbol(expr.context.sym) });

        case 'end-span':
            return renderSpan({ kind: 'end-span', context: renderSymbol(expr.context.sym) });

        default: {
            const _exhaustive: never = expr
            return _exhaustive
        }
    }
}
