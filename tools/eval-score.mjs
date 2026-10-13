// Scores the Copilot tool eval from the session file: for each `eval:<id>:<phase>` session, takes
// the assistant reply, parses its proposal blocks with Copilot's own parsers, and checks them
// against the planted targets by applying every change to an in-memory copy of the target text
// with Copilot's own anchor matcher. Nothing is written back.
//
//   node --import ./tests/setup.mjs tools/eval-score.mjs --st C:\path\to\SillyTavern --user <test-user>

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EVAL } from './eval-targets.mjs';
import { SCENARIOS } from './eval-scenarios.mjs';
import { parseCharChangesFromText } from '../src/features/feature-character-engine.js';
import { parseLBChangesFromText } from '../src/features/feature-lorebook-engine.js';
import { parseChatChangesFromText } from '../src/features/feature-chatedit-engine.js';
import { parseMemoryBlockFromText } from '../src/features/feature-memory.js';
import { applySearchReplaceToField } from '../src/utils/util-text.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') && acc.push([a.slice(2), all[i + 1]]), acc), []));
const USER_DIR = path.join(path.resolve(args.st), 'data', args.user);

const meta = JSON.parse(fs.readFileSync(path.join(USER_DIR, 'user', 'files', 'bench-eval.json'), 'utf8'));
const chatLines = fs.readFileSync(path.join(USER_DIR, 'chats', meta.char, 'bench-chat.jsonl'), 'utf8').trim().split('\n');
const chat = chatLines.slice(1).map(l => JSON.parse(l));
const header = JSON.parse(chatLines[0]);
const { read } = await import(pathToFileURL(path.join(path.resolve(args.st), 'src', 'character-card-parser.js')).href);
const card = JSON.parse(read(fs.readFileSync(path.join(USER_DIR, 'characters', `${meta.char}.png`)))).data;
const lore = JSON.parse(fs.readFileSync(path.join(USER_DIR, 'worlds', `${meta.world}.json`), 'utf8')).entries;
const sessFile = header.chat_metadata?.st_copilot?.file_id;
if (!sessFile) throw new Error('No Copilot session file linked to the bench chat yet.');
const bucket = JSON.parse(fs.readFileSync(path.join(USER_DIR, 'user', 'files', sessFile), 'utf8')).bucket;

// Applies anchor patches in order; returns { text, failures: [{ anchor, reason }] }.
function applyPatches(text, patches) {
    const failures = [];
    for (const p of patches || []) {
        const anchor = p.search ?? p.anchor ?? '';
        const r = applySearchReplaceToField(text, anchor, p.replace ?? '');
        if (r.matched) text = r.result; else failures.push({ anchor: anchor.slice(0, 80), reason: r.reason });
    }
    return { text, failures };
}

// Applies one card change to a copy of the field text (greetings by 1-based index).
function applyCardChange(c) {
    const isGreeting = c.field === 'alternate_greetings';
    const before = isGreeting ? (card.alternate_greetings[(c.index ?? 0) - 1] ?? null) : (card[c.field] ?? '');
    if (before === null) return { before, after: null, failures: [{ anchor: `index ${c.index}`, reason: 'no such greeting' }] };
    if (c.action === 'replace') { const r = applyPatches(before, c.patches); return { before, after: r.text, failures: r.failures }; }
    if (c.action === 'overwrite') return { before, after: c.value, failures: [] };
    if (c.action === 'append_text') return { before, after: `${before}\n${c.value}`, failures: [] };
    if (c.action === 'prepend') return { before, after: `${c.value}\n${before}`, failures: [] };
    return { before, after: before, failures: [] };
}

const greetingIndices = changes => changes.filter(c => c.field === 'alternate_greetings' && c.action !== 'append').map(c => c.index);

const CHECKS = {
    g_in_ctx: ({ cc }) => {
        const g = (cc || []).filter(c => c.field === 'alternate_greetings');
        const r = g.map(applyCardChange);
        return { pass: g.length > 0 && greetingIndices(g).every(i => i === 3) && r.every(x => !x.failures.length), detail: { indices: greetingIndices(g), failures: r.flatMap(x => x.failures) } };
    },
    g_unsent: ({ cc }) => {
        const g = (cc || []).filter(c => c.field === 'alternate_greetings');
        const r = g.map(applyCardChange);
        return { pass: g.length > 0 && greetingIndices(g).every(i => i === 9) && r.every(x => !x.failures.length) && r.some(x => /Glasswood/.test(x.after || '')),
            detail: { indices: greetingIndices(g), failures: r.flatMap(x => x.failures) } };
    },
    g_swipe: ({ cc }) => {
        const g = (cc || []).filter(c => c.field === 'alternate_greetings');
        const r = g.map(applyCardChange);
        return { pass: g.length > 0 && greetingIndices(g).every(i => i === 2) && r.every(x => !x.failures.length), detail: { indices: greetingIndices(g), failures: r.flatMap(x => x.failures) } };
    },
    g_add7: ({ cc }) => {
        const n = (cc || []).filter(c => c.field === 'alternate_greetings' && c.action === 'append').length;
        return { pass: n === 7, detail: { appends: n } };
    },
    desc_mid: ({ cc }) => {
        const d = (cc || []).filter(c => c.field === 'description');
        let text = card.description; const failures = [];
        for (const c of d) { const r = applyCardChange({ ...c }); failures.push(...r.failures); if (c.action === 'replace') text = applyPatches(text, c.patches).text; else if (c.action === 'overwrite') text = c.value; }
        const lostShare = 1 - text.length / card.description.length;
        return { pass: d.length > 0 && !failures.length && !text.includes(EVAL.descriptionNeedle) && /two hard seasons/i.test(text) && lostShare < 0.05,
            detail: { actions: d.map(c => c.action), failures, lengthChange: `${Math.round(-lostShare * 100)}%` } };
    },
    two_fields: ({ cc }) => {
        const fields = new Set((cc || []).map(c => c.field));
        const failures = (cc || []).flatMap(c => applyCardChange(c).failures);
        return { pass: fields.has('personality') && fields.has('scenario') && !failures.length, detail: { fields: [...fields], failures } };
    },
    dup_phrase: ({ cc, reply }) => {
        const d = (cc || []).filter(c => c.field === 'description');
        const failures = d.flatMap(c => applyCardChange(c).failures);
        const asked = !d.length && /\?/.test(reply);
        return { pass: !failures.length && (d.length > 0 || asked), detail: { proposed: d.length, asked, failures } };
    },
    chat_needle: ({ ch }) => {
        const target = meta.chatNeedleIndex;
        const edits = (ch || []).filter(c => ['replace', 'bulk_replace', 'overwrite'].includes(c.action));
        const onTarget = edits.filter(c => c.msg_index === target || c.msg_indices?.includes(target) || (c.msg_range && c.msg_range[0] <= target && target <= c.msg_range[1]));
        let text = chat[target].mes; const failures = [];
        for (const c of onTarget) {
            if (c.action === 'overwrite') { text = c.content; continue; }
            const r = applyPatches(text, c.patches || c.replacements);
            failures.push(...r.failures); text = r.text;
        }
        const lostShare = 1 - text.length / chat[target].mes.length;
        return { pass: onTarget.length > 0 && onTarget.length === edits.length && !failures.length && /deep crimson/i.test(text) && !/cobalt blue/i.test(text) && lostShare < 0.05,
            detail: { targetIndex: target, proposedIndices: edits.map(c => c.msg_index ?? c.msg_indices ?? c.msg_range), actions: edits.map(c => c.action), failures, lengthChange: `${Math.round(-lostShare * 100)}%` } };
    },
    chat_hide: ({ ch }) => {
        const hidden = new Set();
        for (const c of (ch || []).filter(c => c.action === 'hide')) {
            if (c.msg_range) for (let i = c.msg_range[0]; i <= c.msg_range[1]; i++) hidden.add(i);
            (c.msg_indices || []).forEach(i => hidden.add(i));
            if (c.msg_index !== undefined) hidden.add(c.msg_index);
        }
        const got = [...hidden].sort((a, b) => a - b).join(',');
        return { pass: got === '10,11,12,13,14', detail: { hidden: got } };
    },
    lore_needle: ({ lc }) => {
        const uid = meta.loreNeedleUid;
        const original = lore[uid].content;
        const onTarget = (lc || []).filter(c => Number(c.uid) === uid);
        let text = original; const failures = [];
        for (const c of onTarget) {
            if (c.action === 'patch') { const r = applyPatches(text, c.patches); failures.push(...r.failures); text = r.text; }
            else if (c.action === 'edit' && typeof c.content === 'string') text = c.content;
        }
        const lostShare = 1 - text.length / original.length;
        return { pass: onTarget.length > 0 && !failures.length && /fifth winter/i.test(text) && !text.includes(EVAL.loreNeedle) && lostShare < 0.05,
            detail: { uidsProposed: (lc || []).map(c => c.uid), actions: onTarget.map(c => c.action), failures, lengthChange: `${Math.round(-lostShare * 100)}%` } };
    },
    lore_add: ({ lc }) => {
        const add = (lc || []).find(c => c.action === 'add');
        const triggers = add?.triggers || add?.key || [];
        return { pass: !!add && add.worldName === meta.world && triggers.some(t => /mardo/i.test(t)), detail: { worldName: add?.worldName, triggers } };
    },
    lore_outlets: ({ reply, lc }) => {
        const names = reply.match(/Gate Rules|Example Tone/g) || [];
        return { pass: names.includes(EVAL.outletEntry) && !names.includes(EVAL.examplesTopEntry) && !lc, detail: { named: [...new Set(names)], proposedChanges: !!lc } };
    },
    // Memory blocks are applied and stripped before the reply is stored, so the runner checks
    // this one in the page (whether a memory was added) and the block is only seen if left over.
    memory: ({ mem }) => (Array.isArray(mem) ? { pass: mem.some(m => m.action === 'add'), detail: { memory: mem } } : { pass: null, detail: 'auto-applied; see the runner result' }),
};

const rows = [];
for (const s of bucket.sessions) {
    const m = /^eval:([\w-]+):(\w+)$/.exec(s.name || '');
    if (!m) continue;
    const [, id, phase] = m;
    const replies = s.messages.filter(x => x.role === 'assistant' && !x.isLBHistory && !x.isCharEditHistory && !x.isChatEditHistory);
    const reply = replies.map(x => x.content || '').join('\n\n');
    const tools = replies.flatMap(x => (x.toolCalls || []).map(t => t.name));
    const parsed = { reply, cc: parseCharChangesFromText(reply), lc: parseLBChangesFromText(reply), ch: parseChatChangesFromText(reply), mem: parseMemoryBlockFromText(reply) };
    const check = CHECKS[id] ? CHECKS[id](parsed) : { pass: false, detail: 'no check' };
    rows.push({ id, phase, pass: check.pass, tools, replyChars: reply.length, detail: check.detail });
}

const order = SCENARIOS.map(s => s.id);
rows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id) || a.phase.localeCompare(b.phase));
console.log(JSON.stringify(rows, null, 2));
for (const phase of [...new Set(rows.map(r => r.phase))]) {
    const p = rows.filter(r => r.phase === phase);
    console.error(`${phase}: ${p.filter(r => r.pass).length}/${p.length} passed`);
}
