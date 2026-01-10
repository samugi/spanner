#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';

// --- CLI ARGUMENTS ---
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node jsonify.mjs <input-file> <output-file>');
    process.exit(1);
}

const inputFile = args[0];
const outputFile = args[1];
const ext = path.extname(inputFile).toLowerCase();

// --- HELPER: safely evaluate literals ---
function evalNode(node) {
    switch (node.getKind()) {
        case SyntaxKind.StringLiteral:
            return node.getLiteralText();
        case SyntaxKind.NumericLiteral:
            return Number(node.getText());
        case SyntaxKind.TrueKeyword:
            return true;
        case SyntaxKind.FalseKeyword:
            return false;
        case SyntaxKind.ArrayLiteralExpression:
            return node.getElements().map(evalNode);
        case SyntaxKind.ObjectLiteralExpression: {
            const obj = {};
            node.getProperties().forEach(prop => {
                if (prop.getKind() === SyntaxKind.PropertyAssignment) {
                    const key = prop.getName();
                    obj[key] = evalNode(prop.getInitializer());
                }
            });
            return obj;
        }
        default:
            return undefined;
    }
}

// --- HELPER: convert JSON object to TypeScript ---
function jsonToTs(jsonObj, types = {}) {
    let code = '';
    for (const key of Object.keys(jsonObj)) {
        const type = types[key] || 'any';
        const valueStr = JSON.stringify(jsonObj[key], null, 2)
            .replace(/\n/g, '\n  '); // indent nicely
        code += `const ${key}: ${type} = ${valueStr};\n\n`;
    }
    return code;
}

// --- MAIN LOGIC ---
if (ext === '.ts') {
    // TS -> JSON
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(inputFile);

    const output = {};
    sourceFile.getVariableDeclarations().forEach(v => {
        const name = v.getName();
        if (name === 'nodes' || name === 'edges') {
            const init = v.getInitializer();
            if (init) output[name] = evalNode(init);
        }
    });

    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`✅ JSON written to ${outputFile}`);

} else if (ext === '.json') {
    // JSON -> TS
    const jsonContent = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    const tsCode = jsonToTs(jsonContent, { nodes: 'Node[]', edges: 'Edge[]' });
    fs.writeFileSync(outputFile, tsCode);
    console.log(`✅ TypeScript written to ${outputFile}`);

} else {
    console.error('Unsupported file extension. Use .ts or .json');
    process.exit(1);
}
