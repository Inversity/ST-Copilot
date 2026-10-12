// Writes synthetic benchmark data into a SillyTavern user folder: one character card,
// one long chat and one lorebook linked to the card. All text is generated filler from a
// fixed seed, so every run produces the same data. Sized to match real chats without
// reading any of them.
//
// Usage (SillyTavern should not have that user's page open while this runs):
//   node tools/bench-fixtures.mjs --st C:\path\to\SillyTavern --user fresh-user-test [--kb 720] [--entries 60]
//        [--cp-sessions 4] [--cp-msgs 300]      (Copilot sessions; --cp-sessions 0 for none)
//
// Card writing goes through SillyTavern's own src/character-card-parser.js, so the PNG is
// exactly what ST itself would produce.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
    return acc;
}, []));
if (!args.st || !args.user) {
    console.error('usage: node bench-fixtures.mjs --st <SillyTavern root> --user <handle> [--kb 720] [--entries 60]');
    process.exit(1);
}
const ST = path.resolve(args.st);
const USER_DIR = path.join(ST, 'data', args.user);
const TARGET_BYTES = Number(args.kb || 720) * 1024;
const ENTRY_COUNT = Number(args.entries || 60);
const CHAR = 'Bench Ranger';
const WORLD = 'Bench Lore';

if (!fs.existsSync(USER_DIR)) { console.error(`no such user folder: ${USER_DIR}`); process.exit(1); }

// ── deterministic text ───────────────────────────────────────────────────────

let seed = 0x5eed1234;
const rand = () => {  // mulberry32
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = arr => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const PLACES = ['Brackenmoor', 'the Saltreach', 'Vellum Pass', 'Orrin Ford', 'the Glasswood', 'Tallow Keep',
    'Harrowgate', 'the Sunken Mill', 'Cindervale', 'Marrow Bridge', 'the Lantern Road', 'Quillhollow'];
const PEOPLE = ['Captain Idris', 'old Wren', 'the ferryman Baro', 'Sister Maelis', 'the cartographer Ostrem',
    'Lady Penhallow', 'the smith Garrick', 'young Tamsin'];
const THINGS = ['the brass compass', 'a sealed letter', 'the ledger', 'a torn map', 'the signal lantern',
    'a coil of rope', 'the river charts', 'a wax seal', 'the toll token', 'a bundle of herbs'];
const VERBS = ['studies', 'folds', 'weighs', 'turns over', 'sets down', 'traces', 'pockets', 'examines', 'unrolls', 'checks'];
const ADVERBS = ['carefully', 'slowly', 'without a word', 'with a frown', 'thoughtfully', 'briskly', 'absently', 'quietly'];
const WEATHER = ['Rain drums on the shutters.', 'Fog curls along the riverbank.', 'The fire pops and settles.',
    'Wind rattles the loose boards.', 'Somewhere outside, a cart rolls past.', 'The lamp gutters, then steadies.'];
const LINES = ['We should reach the crossing before dusk.', 'That road has been closed since the flood.',
    'Someone has been here recently.', 'The numbers in this ledger do not add up.', 'Keep your voice down.',
    'If the bridge is out, we take the long way.', 'I have seen this mark before.', 'Trust the map, not the signposts.',
    'They will expect us at the north gate.', 'We rest for an hour, no longer.'];

const sentence = () => {
    switch (between(0, 4)) {
        case 0: return `*${CHAR.split(' ')[1]} ${pick(VERBS)} ${pick(THINGS)} ${pick(ADVERBS)}.*`;
        case 1: return `"${pick(LINES)}"`;
        case 2: return pick(WEATHER);
        case 3: return `The trail toward ${pick(PLACES)} bends past ${pick(PLACES)}, where ${pick(PEOPLE)} once kept watch.`;
        default: return `${pick(PEOPLE)} mentioned ${pick(THINGS)} near ${pick(PLACES)}, though the details were thin.`;
    }
};
const paragraph = (lo, hi) => Array.from({ length: between(lo, hi) }, sentence).join(' ');
const body = (targetChars, paraLo, paraHi) => {
    const parts = [];
    let len = 0;
    while (len < targetChars) {
        const p = rand() < 0.08
            ? Array.from({ length: between(2, 4) }, () => `- ${pick(THINGS)} from ${pick(PLACES)}`).join('\n')
            : paragraph(paraLo, paraHi);
        parts.push(p); len += p.length + 2;
    }
    return parts.join('\n\n');
};

// ── lorebook ─────────────────────────────────────────────────────────────────

const entryTemplate = (uid, key, comment, content) => ({
    uid, key, keysecondary: [], comment, content,
    constant: false, selective: true, order: 100, position: 0, disable: false, displayIndex: uid,
    addMemo: true, group: '', groupOverride: false, groupWeight: 100, sticky: 0, cooldown: 0, delay: 0,
    probability: 100, depth: 4, useProbability: true, role: null, vectorized: false,
    excludeRecursion: false, preventRecursion: false, delayUntilRecursion: false, scanDepth: null,
    caseSensitive: null, matchWholeWords: null, useGroupScoring: null, automationId: '',
});
const subjects = [...PLACES, ...PEOPLE, ...THINGS];
const entries = {};
for (let i = 0; i < ENTRY_COUNT; i++) {
    const subject = subjects[i % subjects.length];
    const name = i < subjects.length ? subject : `${subject} (${Math.floor(i / subjects.length) + 1})`;
    entries[i] = entryTemplate(i, [subject.replace(/^(the|a) /, '')], name, body(between(400, 900), 3, 5));
}
// A couple of always-on entries, as real books usually have.
entries[ENTRY_COUNT] = { ...entryTemplate(ENTRY_COUNT, [], 'World overview', body(1200, 4, 6)), constant: true };
entries[ENTRY_COUNT + 1] = { ...entryTemplate(ENTRY_COUNT + 1, [], 'Travel rules', body(800, 3, 5)), constant: true };

// ── card ─────────────────────────────────────────────────────────────────────

const created = Date.UTC(2026, 9, 1);
const cardData = {
    name: CHAR,
    description: body(2400, 3, 6),
    personality: 'Patient, observant, dry humor. Keeps careful notes and distrusts shortcuts.',
    scenario: body(700, 2, 4),
    first_mes: body(1200, 3, 5),
    mes_example: `<START>\n{{user}}: Where to next?\n{{char}}: ${body(500, 2, 3)}`,
    creator_notes: 'Synthetic benchmark card generated by ST-Copilot tools/bench-fixtures.mjs. Filler text only.',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: [body(900, 3, 4), body(900, 3, 4)],
    tags: ['benchmark'],
    creator: 'bench-fixtures',
    character_version: '1.0',
    extensions: { talkativeness: '0.5', fav: false, world: WORLD, depth_prompt: { prompt: '', depth: 4, role: 'system' } },
};
const card = {
    // V1 fields at the top level, as ST writes them
    name: cardData.name, description: cardData.description, personality: cardData.personality,
    scenario: cardData.scenario, first_mes: cardData.first_mes, mes_example: cardData.mes_example,
    creatorcomment: cardData.creator_notes, avatar: 'none', chat: 'bench-chat', talkativeness: '0.5',
    fav: false, tags: cardData.tags, create_date: new Date(created).toISOString(),
    spec: 'chara_card_v2', spec_version: '2.0', data: cardData,
};

// ── chat ─────────────────────────────────────────────────────────────────────

const sendDate = n => new Date(created + n * 90_000).toISOString();
const lines = [JSON.stringify({ user_name: 'unused', character_name: 'unused', chat_metadata: {} })];
let bytes = lines[0].length + 1;
let n = 0;
const push = obj => { const s = JSON.stringify(obj); lines.push(s); bytes += s.length + 1; };
push({ name: CHAR, is_user: false, is_system: false, send_date: sendDate(n++), mes: cardData.first_mes,
    extra: {}, swipe_id: 0, swipes: [cardData.first_mes, ...cardData.alternate_greetings], swipe_info: [] });
while (bytes < TARGET_BYTES) {
    push({ name: 'User', is_user: true, is_system: false, send_date: sendDate(n++), mes: body(between(120, 900), 1, 3), extra: {} });
    const mes = body(between(1200, 4500), 3, 6);
    const swipes = rand() < 0.2 ? [mes, ...Array.from({ length: between(1, 3) }, () => body(between(1200, 4000), 3, 6))] : [mes];
    push({ name: CHAR, is_user: false, is_system: false, send_date: sendDate(n++), mes,
        extra: { api: 'openai', model: 'mock-model' }, swipe_id: 0, swipes, swipe_info: swipes.map(() => ({ send_date: sendDate(n), extra: {} })) });
}

// ── Copilot sessions ─────────────────────────────────────────────────────────
// Same storage ST-Copilot uses: a JSON file in the user's files, linked from the chat's
// metadata. The active session is long and markdown-heavy (lists, tables, code, reasoning)
// so rendering it exercises the markdown renderer the way real analysis replies do.

const CP_MSGS = Number(args['cp-msgs'] ?? 300);
const CP_SESSIONS = Number(args['cp-sessions'] ?? 4);
const CP_FILE = 'copilot_sess_bench.json';
const cpReply = () => {
    const parts = [`## ${pick(['Continuity check', 'Character notes', 'Scene analysis', 'Worldbuilding'])}`, paragraph(3, 5)];
    if (rand() < 0.5) parts.push(Array.from({ length: between(3, 6) }, () => `- **${pick(PEOPLE)}**: ${sentence().replace(/[*"]/g, '')}`).join('\n'));
    if (rand() < 0.25) parts.push(['| Place | Last seen | Notes |', '|---|---|---|',
        ...Array.from({ length: between(3, 6) }, () => `| ${pick(PLACES)} | msg ${between(1, 180)} | ${pick(THINGS)} |`)].join('\n'));
    if (rand() < 0.15) parts.push('```js\n' + Array.from({ length: between(4, 10) }, (_, i) => `const step${i} = '${pick(THINGS)}';`).join('\n') + '\n```');
    parts.push(paragraph(2, 5));
    return parts.join('\n\n');
};
const cpSession = (idx, count) => {
    const messages = [];
    for (let i = 0; i < count; i++) {
        const isUser = i % 2 === 0;
        const msg = { id: `msg_bench_${idx}_${i}`, role: isUser ? 'user' : 'assistant',
            content: isUser ? paragraph(1, 3).replace(/\*/g, '') : cpReply(), timestamp: created + i * 60_000 };
        if (!isUser) {
            msg.reasoning = rand() < 0.3 ? paragraph(3, 8) : null;
            msg.swipes = [{ content: msg.content, reasoning: msg.reasoning }];
            msg.swipeIndex = 0;
        }
        messages.push(msg);
    }
    return { id: `sess_bench_${idx}`, name: `Bench session ${idx + 1}`, created: created + idx, messages, isTemporary: false };
};
const cpSessions = Array.from({ length: CP_SESSIONS }, (_, i) => cpSession(i, i === CP_SESSIONS - 1 ? CP_MSGS : Math.round(CP_MSGS / 2)));
const cpPayload = { _version: 4, chat_id_reference: 'bench-chat', updated_at: created,
    bucket: { activeSessionId: cpSessions.at(-1)?.id ?? null, sessions: cpSessions } };
if (CP_SESSIONS > 0) {
    const header = JSON.parse(lines[0]);
    header.chat_metadata.st_copilot = { format: 'v4', file_id: CP_FILE, chat_id: 'bench-chat' };
    lines[0] = JSON.stringify(header);
}

// ── write ────────────────────────────────────────────────────────────────────

const { write } = await import(pathToFileURL(path.join(ST, 'src', 'character-card-parser.js')).href);
const basePng = fs.readFileSync(path.join(ST, 'default', 'content', 'user-default.png'));
const out = {
    card: path.join(USER_DIR, 'characters', `${CHAR}.png`),
    chat: path.join(USER_DIR, 'chats', CHAR, 'bench-chat.jsonl'),
    world: path.join(USER_DIR, 'worlds', `${WORLD}.json`),
};
fs.mkdirSync(path.dirname(out.chat), { recursive: true });
fs.writeFileSync(out.card, write(basePng, JSON.stringify(card)));
fs.writeFileSync(out.chat, lines.join('\n') + '\n');
fs.writeFileSync(out.world, JSON.stringify({ entries }, null, 4));
let cpKB = 0;
if (CP_SESSIONS > 0) {
    const cpPath = path.join(USER_DIR, 'user', 'files', CP_FILE);
    fs.mkdirSync(path.dirname(cpPath), { recursive: true });
    const json = JSON.stringify(cpPayload);
    fs.writeFileSync(cpPath, json);
    cpKB = Math.round(json.length / 1024);
}

console.log(JSON.stringify({
    card: out.card, chat: out.chat, world: out.world,
    chatKB: Math.round(bytes / 1024), messages: lines.length - 1, loreEntries: Object.keys(entries).length,
    copilotSessions: CP_SESSIONS, copilotActiveMsgs: CP_MSGS, copilotKB: cpKB,
}, null, 2));
