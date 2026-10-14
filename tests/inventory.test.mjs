// Keeps docs/ui-inventory.json (the UI map and the README's source) in step with the code.
// A failure means a setting, screen, tool, card or source line changed without the
// inventory: update the node it names (and re-run tools/build-ui-map.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const inv = JSON.parse(fs.readFileSync('docs/ui-inventory.json', 'utf8'));
const nodeText = n => JSON.stringify(n);

// Setting keys the inventory names: controls' "setting" fields (a trailing * is a prefix)
// plus internalSettings (kept state with no control of its own).
function namedSettings() {
    const names = new Set();
    for (const n of inv.nodes) for (const c of n.controls || []) for (const s of String(c.setting || '').split(/,\s*/)) if (s.trim()) names.add(s.trim());
    for (const s of inv.internalSettings || []) names.add(s.key);
    return names;
}

test('every default setting is in the inventory, as a control or as internal state', async () => {
    globalThis.__stContext = { extensionSettings: {}, characters: [], name1: 'User', saveSettingsDebounced() {} };
    const { getSettings } = await import('../src/session.js');
    const keys = Object.keys(getSettings());
    delete globalThis.__stContext;
    const names = namedSettings();
    const prefixes = [...names].filter(n => n.endsWith('*')).map(n => n.slice(0, -1));
    const missing = keys.filter(k => !names.has(k) && !prefixes.some(p => k.startsWith(p)));
    assert.deepEqual(missing, [], 'add these to a control\'s "setting" or to internalSettings');
});

test('every setting the inventory names still exists in the code', () => {
    const src = fs.readdirSync('src', { recursive: true }).filter(f => f.endsWith('.js'))
        .map(f => fs.readFileSync(`src/${f}`, 'utf8')).join('\n');
    const stale = [...namedSettings()].filter(n => !n.endsWith('*') && !new RegExp(`\\b${n}\\b`).test(src));
    assert.deepEqual(stale, []);
});

test('source references point at files and lines that exist', () => {
    const bad = [];
    for (const n of inv.nodes) {
        // A fixed finding's ref records where the problem was, which may no longer exist.
        const refs = [...(n.source || []), ...(n.findings || []).filter(f => !f.fixedIn).map(f => f.ref).filter(Boolean)];
        for (const ref of refs) {
            // "file.js#fn" names a function (survives code moving); "file:line" a line.
            const m = ref.match(/^([\w./-]+\.(?:json|js|html|css))(?=[:#\s(]|$)(?::(\d+)|#([\w$]+))?/);
            if (!m) continue;
            if (!fs.existsSync(m[1])) { bad.push(`${n.id}: ${ref} (no file)`); continue; }
            const text = fs.readFileSync(m[1], 'utf8');
            const lines = text.split('\n').length;
            if (m[2] && Number(m[2]) > lines) bad.push(`${n.id}: ${ref} (file has ${lines} lines)`);
            if (m[3] && !new RegExp(`function\\s+${m[3].replace(/\$/g, '\\$')}\\s*\\(`).test(text)) bad.push(`${n.id}: ${ref} (no such function)`);
        }
    }
    assert.deepEqual(bad, []);
});

test('every HTML template is described by some node', () => {
    const templates = fs.readdirSync('.').filter(f => f.endsWith('.html'));
    const sources = inv.nodes.flatMap(n => n.source || []).join(' ');
    assert.deepEqual(templates.filter(t => !sources.includes(t)), []);
});

test('every Settings tab has a node', () => {
    const tabs = [...fs.readFileSync('settings_overlay.html', 'utf8').matchAll(/data-sptab="(\w+)"/g)].map(m => m[1]);
    const ids = new Set(inv.nodes.map(n => n.id));
    assert.deepEqual(tabs.filter(t => !ids.has(`settings-${t}`)), []);
});

test('every tool is listed on the Tools tab node', async () => {
    const { TOOL_DEFINITIONS } = await import('../src/constants.js');
    const text = nodeText(inv.nodes.find(n => n.id === 'settings-tools'));
    assert.deepEqual(TOOL_DEFINITIONS.map(t => t.label).filter(l => !text.includes(l)), []);
});

test('every proposal block has a card node', () => {
    const blocks = { 'lorebook-changes': 'card-lorebook', 'character-changes': 'card-character', 'character-create': 'card-character-create', 'chat-changes': 'card-chat', 'prompt-changes': 'card-prompt' };
    const src = fs.readdirSync('src', { recursive: true }).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(`src/${f}`, 'utf8')).join('\n');
    const ids = new Set(inv.nodes.map(n => n.id));
    for (const [block, id] of Object.entries(blocks)) {
        assert.ok(src.includes(block), `${block} no longer in the code: update this test`);
        assert.ok(ids.has(id), `no inventory node ${id} for ${block}`);
    }
});
