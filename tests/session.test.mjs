import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// In-memory stand-in for SillyTavern's user file storage, with per-read delays so tests
// can control the order in which overlapping loads finish.
const files = new Map();
let readDelays = [];
globalThis.btoa = s => Buffer.from(s, 'binary').toString('base64');
globalThis.atob = s => Buffer.from(s, 'base64').toString('binary');
globalThis.fetch = async (url, opts = {}) => {
    if (url === '/api/files/upload') {
        const { name, data } = JSON.parse(opts.body);
        files.set(name, Buffer.from(data, 'base64').toString('utf8'));
        return { ok: true, status: 200 };
    }
    const m = String(url).match(/^\/user\/files\/(.+)$/);
    if (m) {
        const delay = readDelays.shift() ?? 0;
        if (delay) await new Promise(r => setTimeout(r, delay));
        if (!files.has(m[1])) return { ok: false, status: 404, text: async () => '' };
        const body = files.get(m[1]);
        return { ok: true, status: 200, text: async () => body };
    }
    throw new Error('unexpected fetch ' + url);
};

const S = await import('../src/session.js');

// A chat as SillyTavern holds it: its metadata object persists with the chat file.
const chats = {};
function chat(id) {
    if (!chats[id]) chats[id] = { id, metadata: {} };
    return chats[id];
}
function openChat(id) {
    const c = id ? chat(id) : null;
    globalThis.__stContext = {
        characters: [], name1: 'User', extensionSettings: globalThis.__ext || (globalThis.__ext = {}),
        chatMetadata: c ? c.metadata : {},
        getCurrentChatId: () => c?.id,
        saveMetadata: async () => {},
        saveSettingsDebounced: () => {},
        getRequestHeaders: () => ({}),
    };
}
const flush = () => new Promise(r => setTimeout(r, 1100));

beforeEach(() => { readDelays = []; });

test('sessions survive switching A -> B -> A', async () => {
    openChat('A.jsonl');
    await S.initChatBucket();
    const sess = S.createSession('A session');
    S.addMessage(sess, 'user', 'hello from A');

    openChat('B.jsonl');
    await S.initChatBucket();
    assert.equal(S.getChatBucket().sessions.length, 0);

    openChat('A.jsonl');
    await S.initChatBucket();
    const back = S.getChatBucket();
    assert.equal(back.sessions.length, 1);
    assert.equal(back.sessions[0].messages[0].content, 'hello from A');
});

test('a slower, older load cannot overwrite the current chat', async () => {
    openChat('C.jsonl');
    await S.initChatBucket();
    S.addMessage(S.createSession('C session'), 'user', 'in C');
    openChat('D.jsonl');
    await S.initChatBucket();
    S.addMessage(S.createSession('D session'), 'user', 'in D');
    await flush();

    // Switch to C (slow read), then to D before C's read returns.
    readDelays = [200, 0];
    openChat('C.jsonl');
    const slow = S.initChatBucket();
    openChat('D.jsonl');
    const fast = S.initChatBucket();
    await Promise.all([slow, fast]);

    assert.equal(S.getChatBucket().sessions[0].messages[0].content, 'in D');
    S.addMessage(S.getCurrentSession(), 'user', 'second D message');
    await flush();
    const dFile = JSON.parse(files.get(chat('D.jsonl').metadata.st_copilot.file_id));
    assert.equal(dFile.bucket.sessions[0].messages.length, 2);
    const cFile = JSON.parse(files.get(chat('C.jsonl').metadata.st_copilot.file_id));
    assert.equal(cFile.bucket.sessions[0].messages.length, 1);
});

test('a load that started before any chat was open does not win', async () => {
    openChat(null);
    readDelays = [150];
    const early = S.initChatBucket();
    openChat('E.jsonl');
    await S.initChatBucket();
    await early;
    S.addMessage(S.createSession('E session'), 'user', 'in E');
    await flush();
    const eFile = JSON.parse(files.get(chat('E.jsonl').metadata.st_copilot.file_id));
    assert.equal(eFile.bucket.sessions[0].messages[0].content, 'in E');
});

test('CHAT_CHANGED for the same chat keeps unsaved in-memory messages', async () => {
    openChat('F.jsonl');
    await S.initChatBucket();
    const sess = S.createSession('F');
    S.addMessage(sess, 'user', 'not yet flushed');
    await S.initChatBucket();
    assert.equal(S.getCurrentSession().messages[0].content, 'not yet flushed');
});

test('saved prompts equal to an old default are reset to use the current default', async () => {
    const { promptHash } = await import('../src/utils/util-text.js');
    const C = await import('../src/constants.js');
    for (const k of ['DEFAULT_SYSTEM_PROMPT', 'DEFAULT_LB_MANAGE_PROMPT', 'DEFAULT_MEMORY_PROMPT', 'DEFAULT_TOOLS_PROMPT', 'DEFAULT_CHAR_EDIT_DIRECTIVE', 'DEFAULT_CHAT_EDIT_DIRECTIVE']) {
        assert.ok(C.KNOWN_DEFAULT_PROMPT_HASHES.includes(promptHash(C[k])), `${k} hash missing from KNOWN_DEFAULT_PROMPT_HASHES`);
    }
});
