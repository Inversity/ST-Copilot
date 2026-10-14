// Compares the translation keys the UI uses with a locale file: keys with no translation,
// and translations whose key nothing uses any more (usually text that was reworded, so the
// translation should move to the new key).
//
//   node tools/i18n-keys.mjs [--locale i18n/ko-kr.json] [--json] [--keys]
//
// Keys are the English source text, as SillyTavern's i18n uses them: data-i18n values in
// the HTML templates and in strings built by the code, translate('...'), and t`...` with
// each ${expr} turned into ${0}, ${1}, ... (SillyTavern's t() does the same).

import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
}, []));
const LOCALE = args.locale || 'i18n/ko-kr.json';

const decodeHtml = s => s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#123;/g, '{').replace(/&#125;/g, '}').replace(/&#10;/g, '\n').replace(/&amp;/g, '&');
const unescapeJs = s => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const keys = new Map(); // key -> first place it is used
const add = (key, where) => { key = key.trim(); if (key && !keys.has(key)) keys.set(key, where); };
const addI18nAttr = (value, where) => {
    for (const part of value.split(';')) add(part.replace(/^\[[\w-]+\]/, ''), where);
};

const files = [
    ...fs.readdirSync('.').filter(f => f.endsWith('.html')),
    ...fs.readdirSync('src', { recursive: true }).filter(f => f.endsWith('.js')).map(f => path.join('src', f)),
];
for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const lineOf = i => text.slice(0, i).split('\n').length;
    const isHtml = file.endsWith('.html');
    for (const m of text.matchAll(/data-i18n=(?:"([^"]*)"|\\"((?:[^\\]|\\[^"])*)\\"|'([^']*)')/g)) {
        const raw = m[1] ?? m[2] ?? m[3];
        addI18nAttr(isHtml ? decodeHtml(raw) : decodeHtml(unescapeJs(raw)), `${file}:${lineOf(m.index)}`);
    }
    if (isHtml) continue;
    for (const m of text.matchAll(/\btranslate\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*\)/g)) {
        if (m[1] === '`' && m[2].includes('${')) continue;
        add(unescapeJs(m[2]), `${file}:${lineOf(m.index)}`);
    }
    for (const m of text.matchAll(/(?<![\w.$}])t`((?:\\.|[^`\\])*)`/g)) {
        let n = 0;
        let key = '';
        let depth = 0;
        const body = m[1];
        for (let i = 0; i < body.length; i++) {
            if (depth === 0 && body[i] === '$' && body[i + 1] === '{') { key += `\${${n++}}`; depth = 1; i++; continue; }
            if (depth > 0) { if (body[i] === '{') depth++; else if (body[i] === '}') depth--; continue; }
            key += body[i];
        }
        add(unescapeJs(key), `${file}:${lineOf(m.index)}`);
    }
}

// Keys the code translates through a variable, which the patterns above cannot see.
// showCustomDialog() translates its title and message itself.
for (const file of files.filter(f => f.endsWith('.js'))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
        if (!line.includes('showCustomDialog(')) continue;
        for (const m of line.matchAll(/\b(?:title|message):\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g)) add(unescapeJs(m[2]), `${file} (dialog)`);
    }
}
// Label tables rendered with translate(x.label) and similar: file -> pattern for the literals.
const LABEL_TABLES = {
    'src/features/feature-stats.js': /\blabel:\s*'([^']+)'/g,
    'src/features/feature-character-manager-ui.js': /\b(?:label|title):\s*'([^']+)'/g,
    'src/features/feature-lorebook-ui.js': /\btitle:\s*'([^']+)'/g,
    'src/features/feature-tools-ui.js': /'(Running|Error|Unavailable|Done)'/g,
    'src/features/feature-character-ui.js': /\b(?:name|tags|description|personality|scenario|first_mes|mes_example|authors_note|user_persona|alternate_greetings|system_prompt|post_history_instructions):\s*'([^']+)'/g,
};
for (const [file, re] of Object.entries(LABEL_TABLES)) {
    if (!fs.existsSync(file)) continue;
    for (const m of fs.readFileSync(file, 'utf8').matchAll(re)) add(m[1], `${file} (label table)`);
}
try {
    const C = await import(new URL('../src/constants.js', import.meta.url));
    for (const d of C.TOOL_DEFINITIONS || []) { add(d.label, 'TOOL_DEFINITIONS'); add(d.description, 'TOOL_DEFINITIONS'); }
    for (const p of Object.values(C.THEME_PRESETS || {})) add(p.label, 'THEME_PRESETS');
    for (const v of C.THEME_VAR_DEFS || []) add(v.label, 'THEME_VAR_DEFS');
} catch (e) {
    console.error(`(constants not loaded: ${e.message})`);
}

const locale = JSON.parse(fs.readFileSync(LOCALE, 'utf8'));
const missing = [...keys].filter(([k]) => !Object.hasOwn(locale, k));
const unused = Object.keys(locale).filter(k => !keys.has(k));

if (args.keys) {
    console.log(JSON.stringify([...keys.keys()]));
} else if (args.json) {
    console.log(JSON.stringify({ missing: Object.fromEntries(missing), unused }, null, 2));
} else {
    console.log(`${keys.size} keys in the UI, ${Object.keys(locale).length} in ${LOCALE}`);
    console.log(`\nNo translation (${missing.length}):`);
    for (const [k, where] of missing) console.log(`  ${where}\t${JSON.stringify(k)}`);
    console.log(`\nUnused translations (${unused.length}):`);
    for (const k of unused) console.log(`  ${JSON.stringify(k)}`);
}
