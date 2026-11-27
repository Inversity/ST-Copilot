// Attachments: how images and files are merged into a message, and what the URL-attachment
// feature does with each setting. Runs against the real feature-attachments.js (no DOM needed
// for these functions); fetch, FileReader and the SillyTavern context are doubles.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.__stContext = { extensionSettings: {}, getRequestHeaders: () => ({}) };

// A data URL as FileReader would produce it, without a DOM.
globalThis.FileReader = class {
    readAsDataURL(blob) {
        (async () => {
            try {
                const b64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
                this.result = `data:${blob.type};base64,${b64}`;
                this.onload?.();
            } catch (e) { this.onerror?.(new Error('Read failed')); }
        })();
    }
};

const PNG_BYTES = Buffer.from(
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
);

// _addUrlAttachment re-renders the preview bar and the message count; DOM double, not asserted.
globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {}, addEventListener() {} }),
};

beforeEach(() => {
    globalThis.fetch = async (url) => {
        if (String(url).startsWith('https://')) return { ok: true, blob: async () => new Blob([PNG_BYTES], { type: 'image/png' }) };
        if (String(url) === '/api/extra/caption') return { ok: true, json: async () => ({ caption: 'a red house' }) };
        return { ok: false };
    };
});

const { getSettings } = await import('../src/session.js');
const {
    _mergeContent, _processAttachmentsBeforeSend, _addUrlAttachment, _fetchUrlAsFile,
} = await import('../src/features/feature-attachments.js');
const { state } = await import('../src/state.js');

const localImg = { id: 'a1', name: 'pic.png', isImage: true, dataUrl: 'data:image/png;base64,AAA', file: {}, textContent: null };
const urlImg = { id: 'a2', name: 'house.png', isImage: true, isRemote: true, dataUrl: 'https://example.com/house.png', file: null, textContent: null, inlineDataUrl: null };
const urlAtt = { id: 'a3', name: 'notes.txt', isImage: false, dataUrl: null, file: null, textContent: 'hello notes' };
// ── _mergeContent ────────────────────────────────────────────────────────────

test('local images keep their data URL; text files are labeled', () => {
    const r = _mergeContent('look at this', [localImg, urlAtt]);
    assert.deepEqual(r, [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
        { type: 'text', text: '[Attached file "notes.txt"]\nhello notes\n[End of "notes.txt"]\n\nlook at this' },
    ]);
});

test('a URL attachment passes its URL through, not base64', () => {
    const r = _mergeContent('what is this?', [urlImg]);
    assert.equal(r[0].image_url.url, 'https://example.com/house.png');
    assert.equal(r[1].text, 'what is this?');
});

test('an inlineDataUrl downloaded from a URL beats the URL itself', () => {
    const r = _mergeContent('and this?', [{ ...urlImg, inlineDataUrl: 'data:image/png;base64,BBB' }]);
    assert.equal(r[0].image_url.url, 'data:image/png;base64,BBB');
});

test('text-only attachments never become an array', () => {
    const r = _mergeContent('plain', [urlAtt]);
    assert.equal(typeof r, 'string');
    assert.ok(r.startsWith('[Attached file "notes.txt"]'));
});
// ── _processAttachmentsBeforeSend ───────────────────────────────────────────

test('url mode (default): the URL goes out untouched', async () => {
    getSettings().imageAnalysisMode = 'direct';
    getSettings().remoteImageMode = 'url';
    const r = await _processAttachmentsBeforeSend([urlImg]);
    assert.equal(r[0].isRemote, true);
    assert.equal(r[0].dataUrl, 'https://example.com/house.png');
    assert.equal(r[0].inlineDataUrl, null);
    assert.equal(r[0].sendAsText, undefined);
});

test('inline mode: a URL is downloaded once, cached, and sent as base64', async () => {
    getSettings().imageAnalysisMode = 'direct';
    getSettings().remoteImageMode = 'inline';
    let fetches = 0;
    globalThis.fetch = async () => { fetches++; return { ok: true, blob: async () => new Blob([PNG_BYTES], { type: 'image/png' }) }; };

    const first = await _processAttachmentsBeforeSend([{ ...urlImg }]);
    assert.equal(first[0].inlineDataUrl, `data:image/png;base64,${PNG_BYTES.toString('base64')}`);
    assert.equal(fetches, 1, 'the image is downloaded once');

    // Second send: the cached data URL is reused, no new download.
    const second = await _processAttachmentsBeforeSend([first[0]]);
    assert.equal(second[0].inlineDataUrl, first[0].inlineDataUrl);
    assert.equal(fetches, 1, 'the cached inline data URL is not re-downloaded');
});

test('inline mode: a failed download falls back to the URL', async () => {
    getSettings().imageAnalysisMode = 'direct';
    getSettings().remoteImageMode = 'inline';
    globalThis.fetch = async () => ({ ok: false });
    const r = await _processAttachmentsBeforeSend([{ ...urlImg }]);
    assert.equal(r[0].inlineDataUrl, null);
    assert.equal(r[0].dataUrl, 'https://example.com/house.png');
});

test('caption mode: a URL is downloaded and captioned; the caption travels as text', async () => {
    getSettings().imageAnalysisMode = 'caption';
    const r = await _processAttachmentsBeforeSend([{ ...urlImg }]);
    assert.equal(r[0].sendAsText, true);
    assert.equal(r[0].textContent, '[Image "house.png" caption: a red house]');
});

test('caption preview mode labels the image without downloading it', async () => {
    getSettings().imageAnalysisMode = 'caption';
    let fetches = 0;
    globalThis.fetch = async () => { fetches++; return { ok: false }; };
    const r = await _processAttachmentsBeforeSend([{ ...urlImg }], true);
    assert.equal(fetches, 0, 'the preview does not download anything');
    assert.equal(r[0].textContent, '[Image "house.png" (caption will be generated on send)]');
});

test('a non-image file is read and labeled', async () => {
    getSettings().imageAnalysisMode = 'direct';
    const file = { name: 'readme.md', type: 'text/markdown', text: async () => '# hi' };
    const r = await _processAttachmentsBeforeSend([{ ...urlAtt, textContent: null, file }]);
    assert.equal(r[0].sendAsText, true);
    assert.equal(r[0].textContent, '# hi');
});

// ── _fetchUrlAsFile / _addUrlAttachment ─────────────────────────────────────

test('a URL is fetched into an image File; failures and non-images return null', async () => {
    const f = await _fetchUrlAsFile('https://example.com/house.png');
    assert.equal(f.name, 'house.png');
    assert.equal(f.type, 'image/png');

    globalThis.fetch = async () => ({ ok: false });
    assert.equal(await _fetchUrlAsFile('https://example.com/nope.png'), null);

    globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob([Buffer.from('x')], { type: 'text/plain' }) });
    assert.equal(await _fetchUrlAsFile('https://example.com/page'), null, 'a text file is not an image');
});

test('_addUrlAttachment only takes http(s) URLs', async () => {
    state.pendingAttachments = [];
    await _addUrlAttachment('javascript:alert(1)');
    assert.equal(state.pendingAttachments.length, 0);
    await _addUrlAttachment('ftp://example.com/x.png');
    assert.equal(state.pendingAttachments.length, 0);
    await _addUrlAttachment('https://example.com/house.png?v=2');
    assert.equal(state.pendingAttachments.length, 1);
    const att = state.pendingAttachments[0];
    assert.equal(att.isImage, true);
    assert.equal(att.isRemote, true);
    assert.equal(att.name, 'house.png');
    assert.equal(att.dataUrl, 'https://example.com/house.png?v=2');
    assert.equal(att.inlineDataUrl, null);
    state.pendingAttachments = [];
});
