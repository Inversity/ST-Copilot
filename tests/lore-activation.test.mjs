import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLorebookContextBlock, loreInclusionReason, setupExternalWIChangeListener } from '../src/features/feature-lorebook-engine.js';
import * as engine from '../src/features/feature-lorebook-engine.js';

const ET = {
    GENERATION_STARTED: 'generation_started', WORLD_INFO_ACTIVATED: 'world_info_activated',
    GENERATE_AFTER_DATA: 'generate_after_data', WORLDINFO_FORCE_ACTIVATE: 'worldinfo_force_activate',
    WORLDINFO_UPDATED: 'worldinfo_updated', WORLDINFO_SETTINGS_UPDATED: 'worldinfo_settings_updated',
};
const listeners = {};
const eventSource = {
    on(name, fn) { (listeners[name] ||= []).push(fn); },
    emit(name, ...args) { for (const fn of listeners[name] || []) fn(...args); },
};

const BOOK = 'Probe Book';
const entry = (uid, extra = {}) => ({ uid, comment: `E${uid}`, content: `content ${uid}`, key: [`k${uid}`], ...extra });
const book = { entries: {
    1: entry(1),
    2: entry(2),
    3: entry(3, { constant: true }),
    4: entry(4, { constant: true, disable: true }),
} };

let chatId = 'chat-a';
globalThis.__stContext = {
    characters: [{ name: 'Lexi', avatar: 'lexi.png', data: { extensions: { world: BOOK } } }],
    characterId: 0,
    name1: 'Joe', name2: 'Lexi',
    chat: [{ name: 'Joe', is_user: true, mes: 'k1' }],
    chatMetadata: {},
    eventSource, event_types: ET, eventTypes: ET,
    getCurrentChatId: () => chatId,
    loadWorldInfo: async name => (name === BOOK ? structuredClone(book) : null),
};
setupExternalWIChangeListener();

const settings = { lorebookAutoKeyword: true, lorebookSelectedBooks: [], lorebookExcludedBooks: [], lorebookEntryOverrides: {} };
const tagOf = (block, uid) => block.match(new RegExp(`\\(uid: ${uid}\\)[^\\n]*\\[([^\\]]+)\\]\\n`))?.[1] ?? null;

function generation(uids, { dryRun = false, skipWIAN = false } = {}) {
    eventSource.emit(ET.GENERATION_STARTED, 'normal', { skipWIAN }, dryRun);
    if (!dryRun && uids.length) eventSource.emit(ET.WORLD_INFO_ACTIVATED, uids.map(uid => ({ world: BOOK, uid })));
    eventSource.emit(ET.GENERATE_AFTER_DATA, {}, dryRun);
}

test('inclusion reason: override first, then ST, constant, conversation, whole book', () => {
    const e = { constant: false };
    assert.equal(loreInclusionReason(e, { override: false, inST: true }), '');
    assert.equal(loreInclusionReason(e, { override: true }), 'forced');
    assert.equal(loreInclusionReason({ constant: true }, { inST: true }), 'st');
    assert.equal(loreInclusionReason({ constant: true }, {}), 'constant');
    assert.equal(loreInclusionReason({ constant: true, disable: true }, {}), '');
    assert.equal(loreInclusionReason(e, { inConversation: true, bookSelected: true }), 'conversation');
    assert.equal(loreInclusionReason(e, { bookSelected: true }), 'book');
    assert.equal(loreInclusionReason(e, {}), '');
});

test('entries ST activated in its last generation are tagged; others are not included', async () => {
    generation([1, 3]);
    const block = await buildLorebookContextBlock(settings);
    assert.equal(tagOf(block, 1), 'active in SillyTavern');
    assert.equal(tagOf(block, 3), 'active in SillyTavern');
    assert.equal(tagOf(block, 2), null);
    assert.equal(tagOf(block, 4), null);
    assert.match(block, /last reply/);
    assert.deepEqual(engine.lastActiveEntries.map(e => [e.uid, e.reason]), [[1, 'st'], [3, 'st']]);
});

test('a constant ST left out (e.g. over budget) is still included, tagged constant', async () => {
    generation([1]);
    const block = await buildLorebookContextBlock(settings);
    assert.equal(tagOf(block, 3), 'constant');
});

test('dry runs and generations without World Info keep the previous result', async () => {
    generation([2]);
    generation([1], { dryRun: true });
    generation([1], { skipWIAN: true });
    const block = await buildLorebookContextBlock(settings);
    assert.equal(tagOf(block, 2), 'active in SillyTavern');
    assert.equal(tagOf(block, 1), null);
});

test('a generation that activates nothing clears the result', async () => {
    generation([2]);
    generation([]);
    const block = await buildLorebookContextBlock(settings);
    assert.equal(tagOf(block, 2), null);
    assert.equal(tagOf(block, 3), 'constant');
});

test('another chat does not reuse this chat\'s result', async () => {
    generation([1]);
    chatId = 'chat-b';
    try {
        const block = await buildLorebookContextBlock(settings);
        assert.equal(tagOf(block, 1), null);
        assert.doesNotMatch(block, /last reply/);
    } finally { chatId = 'chat-a'; }
});

test('overrides and whole books still apply; Auto-Keywords off leaves ST out', async () => {
    generation([1]);
    const s = { ...settings, lorebookAutoKeyword: false, lorebookSelectedBooks: [BOOK], lorebookEntryOverrides: { [`${BOOK}_E2`]: true, [`${BOOK}_E3`]: false } };
    const block = await buildLorebookContextBlock(s);
    assert.equal(tagOf(block, 1), 'whole book included in Copilot');
    assert.equal(tagOf(block, 2), 'forced on in Copilot');
    assert.equal(tagOf(block, 3), null);
});
