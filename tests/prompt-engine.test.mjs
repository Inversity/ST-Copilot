import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPromptManagerState, applyPromptChanges } from '../src/features/feature-prompt-engine.js';

function ccContext() {
    let saves = 0;
    const ctx = {
        mainApi: 'openai',
        saveSettingsDebounced: () => { saves++; },
        chatCompletionSettings: {
            preset_settings_openai: 'My RP',
            prompts: [
                { identifier: 'main', name: 'Main Prompt', role: 'system', content: 'Write as {{char}}.' },
                { identifier: 'chatHistory', name: 'Chat History', marker: true },
                { identifier: 'style', name: 'Style', role: 'user', content: 'Short.' },
                { identifier: 'orphan', name: 'Not in order', content: 'x' },
            ],
            prompt_order: [
                { character_id: 100000, order: [{ identifier: 'orphan', enabled: true }] },
                { character_id: 100001, order: [
                    { identifier: 'style', enabled: false },
                    { identifier: 'main', enabled: true },
                    { identifier: 'chatHistory', enabled: true },
                ] },
            ],
        },
    };
    globalThis.__stContext = ctx;
    return { ctx, saves: () => saves };
}

test('state lists the global order, disabled prompts and markers included', () => {
    ccContext();
    const s = getPromptManagerState();
    assert.equal(s.mode, 'cc');
    assert.equal(s.presetName, 'My RP');
    assert.deepEqual(s.entries.map(e => [e.id, e.enabled, e.marker]), [
        ['style', false, false], ['main', true, false], ['chatHistory', true, true],
    ]);
});

test('applying changes edits the live prompt objects and saves once', () => {
    const { ctx, saves } = ccContext();
    const applied = applyPromptChanges({
        main: { content: 'New main.', role: 'user', name: 'Main v2' },
        style: { enabled: true },
    });
    assert.deepEqual(applied.sort(), ['main', 'style']);
    const main = ctx.chatCompletionSettings.prompts.find(p => p.identifier === 'main');
    assert.deepEqual([main.content, main.role, main.name], ['New main.', 'user', 'Main v2']);
    assert.equal(ctx.chatCompletionSettings.prompt_order[1].order[0].enabled, true);
    assert.equal(saves(), 1);
});

test('markers only toggle; their content and unknown ids are left alone', () => {
    const { ctx, saves } = ccContext();
    const applied = applyPromptChanges({ chatHistory: { content: 'nope', enabled: false }, ghost: { content: 'x' } });
    assert.deepEqual(applied, ['chatHistory']);
    const marker = ctx.chatCompletionSettings.prompts.find(p => p.identifier === 'chatHistory');
    assert.equal(marker.content, undefined);
    assert.equal(ctx.chatCompletionSettings.prompt_order[1].order[2].enabled, false);
    assert.equal(saves(), 1);
});

test('text completion edits the system prompt', () => {
    const sp = { name: 'RP', content: 'old', enabled: true };
    globalThis.__stContext = { mainApi: 'textgenerationwebui', powerUserSettings: { sysprompt: sp }, saveSettingsDebounced() {} };
    assert.equal(getPromptManagerState().entries[0].content, 'old');
    applyPromptChanges({ sysprompt: { content: 'new' } });
    assert.equal(sp.content, 'new');
});
