import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeTool } from '../src/features/feature-tools-engine.js';
import { getEntryOutletName } from '../src/features/feature-lorebook-engine.js';

const LONG = 'The ferry runs at dawn. '.repeat(60);  // ~1,400 chars, past every preview limit

function withChat(chat, { world = null, book = null, greetings = [] } = {}) {
    globalThis.__stContext = {
        characters: [{ name: 'Lexi', avatar: 'lexi.png', data: { alternate_greetings: greetings, extensions: { world } } }],
        characterId: 0,
        name1: 'Joe',
        name2: 'Lexi',
        chat,
        chatMetadata: {},
        loadWorldInfo: async name => (name === world ? book : null),
    };
}

const msg = (mes, is_user = false, extra = {}) => ({ mes, is_user, name: is_user ? 'Joe' : 'Lexi', ...extra });

test('read_messages returns full text, uncut, by indices or range', async () => {
    withChat([msg('hi', true), msg(LONG), msg('short'), msg('hidden one', false, { is_system: true })]);
    const byIdx = await executeTool('read_messages', { indices: [1, 3, 99] });
    assert.deepEqual(byIdx.messages.map(m => m.index), [1, 3]);
    assert.equal(byIdx.messages[0].content, LONG);
    assert.equal(byIdx.messages[1].hidden, true);
    const byRange = await executeTool('read_messages', { from_index: 0, to_index: 2 });
    assert.deepEqual(byRange.messages.map(m => m.index), [0, 1, 2]);
});

test('read_messages caps at 20 messages and says so', async () => {
    withChat(Array.from({ length: 30 }, (_, i) => msg(`m${i}`)));
    const r = await executeTool('read_messages', { from_index: 0, to_index: 29 });
    assert.equal(r.messages.length, 20);
    assert.match(r.note, /first 20/);
});

test('previews are marked truncated and point to the full-text tool', async () => {
    withChat([msg(LONG), msg('short')]);
    const recent = await executeTool('get_recent_messages', { count: 2 });
    assert.equal(recent.messages[0].truncated, true);
    assert.equal(recent.messages[1].truncated, undefined);
    assert.match(recent.note, /read_messages/);
    const found = await executeTool('search_chat', { queries: ['ferry'] });
    assert.equal(found.results[0].truncated, true);
    assert.match(found.note, /read_messages/);
});

test('get_lorebook_entry returns full content and named settings', async () => {
    const book = { entries: {
        0: { uid: 0, comment: 'Ferry', content: LONG, key: ['ferry'], keysecondary: [], constant: false, position: 4, depth: 3, order: 100, probability: 80, useProbability: true },
        1: { uid: 1, comment: 'Gate', content: 'x', key: ['gate'], position: 7, group: 'gate_outlet' },
    } };
    withChat([], { world: 'Bench Lore A', book });
    const r = await executeTool('get_lorebook_entry', { book_name: 'Bench Lore A', uids: [0, 1, 5] });
    assert.equal(r.entries[0].content, LONG);
    assert.equal(r.entries[0].position, 'at_depth');
    assert.equal(r.entries[0].probability, 80);
    assert.equal(r.entries[1].outlet_name, 'gate_outlet');
    assert.deepEqual(r.not_found_uids, [5]);
    const search = await executeTool('search_lorebook_entry', { queries: ['ferry'] });
    assert.match(search.note, /get_lorebook_entry/);
});

test('get_lorebook_entry names the active books when the name is wrong', async () => {
    withChat([], { world: 'Bench Lore B', book: { entries: {} } });
    const r = await executeTool('get_lorebook_entry', { book_name: 'Nope', uids: [0] });
    assert.match(r.error, /No active lorebook/);
    assert.deepEqual(r.active_lorebooks, ['Bench Lore B']);
});

test('outlet detection uses position 7, not 5 (examples top)', () => {
    assert.equal(getEntryOutletName({ position: 5 }), '');
    assert.equal(getEntryOutletName({ position: 7, group: 'g' }), 'g');
    assert.equal(getEntryOutletName({ position: 7 }), '(unnamed)');
    assert.equal(getEntryOutletName({ position: 0, outlet_name: 'named' }), 'named');
});

test('context lists greetings left out of it by id, with their opening words', async () => {
    const { buildCharacterContextBlock } = await import('../src/features/feature-character-engine.js');
    globalThis.__stContext = {
        characters: [{ name: 'Lexi', avatar: 'lexi.png', data: { alternate_greetings: ['First greeting text', 'Second, sent in full', 'x'.repeat(200)] } }],
        characterId: 0, name1: 'Joe', chatMetadata: {}, extensionSettings: {}, saveSettingsDebounced() {},
    };
    const block = buildCharacterContextBlock({ charEditFields: { alternate_greetings: true }, altGreetingIndices: { 'lexi.png': [1] } });
    assert.match(block, /<alternate_greetings count="3">/);
    assert.match(block, /<greeting id="2">\nSecond, sent in full\n/);
    assert.match(block, /id 1: First greeting text/);
    assert.match(block, /id 3: x{80}\.\.\./);
    assert.doesNotMatch(block, /x{81}/);
    // With every greeting selected there is nothing to list.
    const all = buildCharacterContextBlock({ charEditFields: { alternate_greetings: true } });
    assert.doesNotMatch(all, /not_included/);
});

test('get_char_info can return selected greetings and always the total', async () => {
    withChat([], { greetings: ['a', 'b', 'c', 'd'] });
    const r = await executeTool('get_char_info', { fields: ['alternate_greetings'], greeting_ids: [2, 4] });
    assert.deepEqual(r.alternate_greetings, [{ id: 2, text: 'b' }, { id: 4, text: 'd' }]);
    assert.equal(r.alternate_greetings_total, 4);
});
