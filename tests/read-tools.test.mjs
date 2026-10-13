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

test('get_generation_settings reports live chat completion settings without secrets', async () => {
    globalThis.__stContext = {
        mainApi: 'openai',
        getChatCompletionModel: () => 'anthropic/claude-opus-4.6',
        chatCompletionSettings: { chat_completion_source: 'openrouter', preset_settings_openai: 'Default', temp_openai: 0.8, top_p_openai: 0.95,
            openai_max_context: 64000, openai_max_tokens: 2048, reasoning_effort: 'medium', stream_openai: true, reverse_proxy: 'http://x', proxy_password: 'secret' },
        powerUserSettings: {},
    };
    const r = await executeTool('get_generation_settings', {});
    assert.equal(r.model, 'anthropic/claude-opus-4.6');
    assert.equal(r.sampling.temperature, 0.8);
    assert.equal(r.context_size, 64000);
    assert.doesNotMatch(JSON.stringify(r), /secret|reverse_proxy|proxy_password/);
});

test('get_quick_replies lists sets, and a named set in full', async () => {
    globalThis.__stContext = {};
    globalThis.quickReplyApi = {
        listGlobalSets: () => ['Tools'], listChatSets: () => [], listSets: () => ['Tools', 'Other'],
        getSetByName: name => name === 'Tools' ? { name: 'Tools', qrList: [{ label: 'Recap', message: '/gen Summarize', executeOnUser: true, isHidden: false }] } : undefined,
    };
    const list = await executeTool('get_quick_replies', {});
    assert.deepEqual(list.active_sets, { global: ['Tools'], chat: [] });
    const set = await executeTool('get_quick_replies', { set_name: 'Tools' });
    assert.deepEqual(set.replies[0], { label: 'Recap', title: undefined, message: '/gen Summarize', hidden: false, runs_on: ['user'], automation_id: undefined });
    const missing = await executeTool('get_quick_replies', { set_name: 'Nope' });
    assert.match(missing.error, /No quick reply set/);
    delete globalThis.quickReplyApi;
});

test('get_regex_scripts fails gracefully without the Regex extension', async () => {
    globalThis.__stContext = {};
    const r = await executeTool('get_regex_scripts', {});
    assert.match(r.error, /Regex extension/);
});

test('get_char_info can return selected greetings and always the total', async () => {
    withChat([], { greetings: ['a', 'b', 'c', 'd'] });
    const r = await executeTool('get_char_info', { fields: ['alternate_greetings'], greeting_ids: [2, 4] });
    assert.deepEqual(r.alternate_greetings, [{ id: 2, text: 'b' }, { id: 4, text: 'd' }]);
    assert.equal(r.alternate_greetings_total, 4);
});
