import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactRequestBody } from '../src/api.js';

test('credential-looking fields are redacted at any depth; content is kept', () => {
    const body = {
        model: 'deepseek-v4-pro',
        proxy_password: 'hunter2',
        custom_include_headers: 'Authorization: Bearer sk-live',
        messages: [{ role: 'user', content: 'my password is in the story' }],
        nested: { api_key: 'sk-abc', secret_id: 'id-1', temperature: 0.7 },
        reverse_proxy: '',
        max_tokens: 8200,
        access_token: 'tok',
    };
    const r = redactRequestBody(body);
    assert.equal(r.model, 'deepseek-v4-pro');
    assert.equal(r.proxy_password, '[redacted]');
    assert.equal(r.custom_include_headers, '[redacted]');
    assert.equal(r.nested.api_key, '[redacted]');
    assert.equal(r.nested.secret_id, '[redacted]');
    assert.equal(r.nested.temperature, 0.7);
    assert.equal(r.messages[0].content, 'my password is in the story');
    assert.equal(r.reverse_proxy, '');
    assert.equal(r.max_tokens, 8200);
    assert.equal(r.access_token, '[redacted]');
    assert.equal(body.proxy_password, 'hunter2', 'original body is not modified');
});

test('inline base64 images are shortened to their type and size', () => {
    const b64 = 'A'.repeat(4096);
    const r = redactRequestBody({ messages: [{ content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }, { type: 'text', text: 'look' }] }] });
    assert.equal(r.messages[0].content[0].image_url.url, 'data:image/png;base64,… (3 KB)');
    assert.equal(r.messages[0].content[1].text, 'look');
});
