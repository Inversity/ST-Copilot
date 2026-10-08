// Test-only module hooks. Browser-bound modules (UI, debug, diff) are replaced with
// generated stubs exposing the same export names, so the logic modules in src/ can be
// imported under Node without a DOM or a running SillyTavern.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STUBBED = [
    /\/src\/ui\/[^/]+\.js$/,
    /\/src\/index\.js$/,
    /\/src\/utils\/util-(debug|diff|colorpicker)\.js$/,
    /\/src\/features\/feature-(lorebook-ui|chatedit-ui|tools-ui|character-manager-ui|stats|attachments)\.js$/,
];

function stubSource(url) {
    const src = readFileSync(fileURLToPath(url), 'utf8');
    const names = new Set();
    for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s*\*?\s*([\w$]+)/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+([\w$]+)/gm)) names.add(m[1]);
    return [...names].map(n => `export function ${n}() {}`).join('\n');
}

export async function load(url, context, nextLoad) {
    if (STUBBED.some(re => re.test(url))) return { format: 'module', source: stubSource(url), shortCircuit: true };
    return nextLoad(url, context);
}
