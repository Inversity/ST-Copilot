import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendViaLiveConnection } from '../src/api.js';

// A TextCompletionService double that records what Copilot asks of it.
function textCompletionCtx({ instructEnabled }) {
    const calls = [];
    const instruct = { enabled: instructEnabled, preset: 'Saved Name', input_sequence: '<|user|>' };
    const service = {
        constructPrompt: (msgs, preset) => { calls.push(['constructPrompt', msgs, preset]); return 'FORMATTED'; },
        presetToGeneratePayload: (preset, overridePreset, payload) => { calls.push(['presetToGeneratePayload', preset, overridePreset, payload]); return { built: true, ...payload }; },
        sendRequest: (data, extract, signal) => { calls.push(['sendRequest', data, extract, signal]); return 'GEN'; },
        processRequest: () => { calls.push(['processRequest']); return 'GEN'; },
    };
    const ctx = {
        mainApi: 'textgenerationwebui',
        TextCompletionService: service,
        powerUserSettings: { instruct },
        textCompletionSettings: { preset_settings_textgenerationwebui: 'Saved Preset' },
    };
    return { ctx, calls, instruct };
}

const messages = [
    { role: 'system', content: 'You are Copilot.' },
    { role: 'user', content: [{ type: 'text', text: 'Look at this' }, { type: 'image_url', image_url: { url: 'data:x' } }] },
];

test('text completion: live settings, live instruct template, no preset by name', async () => {
    const { ctx, calls, instruct } = textCompletionCtx({ instructEnabled: true });
    const signal = new AbortController().signal;
    assert.equal(await sendViaLiveConnection(ctx, messages, 500, true, signal), 'GEN');
    assert.deepEqual(calls.map(c => c[0]), ['constructPrompt', 'presetToGeneratePayload', 'sendRequest']);
    const [, msgs, preset] = calls[0];
    assert.equal(preset, instruct, 'formats with the live instruct object, not a preset looked up by name');
    assert.deepEqual(msgs.map(m => m.content), ['You are Copilot.', 'Look at this']);
    const [, genPreset, overridePreset, payload] = calls[1];
    assert.deepEqual(genPreset, {}, 'empty preset = live sampler settings');
    assert.deepEqual(overridePreset, {});
    assert.deepEqual(payload, { prompt: 'FORMATTED', max_tokens: 500, stream: true });
    assert.equal(calls[2][2], false);
    assert.equal(calls[2][3], signal);
});

test('text completion without instruct mode joins the message text', async () => {
    const { ctx, calls } = textCompletionCtx({ instructEnabled: false });
    await sendViaLiveConnection(ctx, messages, 200, false, null);
    assert.deepEqual(calls.map(c => c[0]), ['presetToGeneratePayload', 'sendRequest']);
    assert.equal(calls[0][3].prompt, 'You are Copilot.\n\nLook at this');
});
