import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getStRoleplayPrompts } from '../src/utils/util-st.js';

test('chat completion: enabled prompts in global order, markers kept as slots, empties skipped', () => {
    globalThis.__stContext = {
        mainApi: 'openai',
        chatCompletionSettings: {
            preset_settings_openai: 'My RP',
            prompts: [
                { identifier: 'main', name: 'Main Prompt', role: 'system', content: 'Write as {{char}}.' },
                { identifier: 'nsfw', name: 'Aux', role: 'system', content: 'Disabled one' },
                { identifier: 'chatHistory', name: 'Chat History', marker: true },
                { identifier: 'custom1', name: 'Style', role: 'user', content: 'Short replies.' },
                { identifier: 'blank', name: 'Blank', content: '   ' },
            ],
            prompt_order: [
                { character_id: 100000, order: [{ identifier: 'nsfw', enabled: true }] },
                { character_id: 100001, order: [
                    { identifier: 'custom1', enabled: true },
                    { identifier: 'chatHistory', enabled: true },
                    { identifier: 'nsfw', enabled: false },
                    { identifier: 'blank', enabled: true },
                    { identifier: 'main', enabled: true },
                ] },
            ],
        },
    };
    const r = getStRoleplayPrompts();
    assert.equal(r.source, 'Chat Completion preset "My RP"');
    assert.deepEqual(r.prompts.map(p => p.id), ['custom1', 'chatHistory', 'main']);
    assert.equal(r.prompts[1].marker, true);
    assert.equal(r.prompts[2].content, 'Write as {{char}}.');
});

test('text completion: the enabled system prompt', () => {
    globalThis.__stContext = {
        mainApi: 'textgenerationwebui',
        powerUserSettings: { sysprompt: { enabled: true, name: 'Roleplay', content: 'You are {{char}}.' } },
    };
    assert.deepEqual(getStRoleplayPrompts().prompts, [{ id: 'sysprompt', name: 'Roleplay', role: 'system', content: 'You are {{char}}.' }]);
});

test('text completion: nothing when the system prompt is disabled', () => {
    globalThis.__stContext = {
        mainApi: 'textgenerationwebui',
        powerUserSettings: { sysprompt: { enabled: false, name: 'Roleplay', content: 'x' } },
    };
    assert.deepEqual(getStRoleplayPrompts().prompts, []);
});
