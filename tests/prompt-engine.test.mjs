import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    getPromptManagerState, applyPromptChanges, parsePromptChangesFromText, stripPromptChangesBlock,
    reconstructPromptChangesBlock, previewPromptChange, applyPromptChange, getPromptsForTool,
} from '../src/features/feature-prompt-engine.js';

const fenced = body => 'Here are the edits.\n```prompt-changes\n' + body + '\n```';

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

test('parses every action, and a replace without a patch is dropped (never an overwrite)', () => {
    const changes = parsePromptChangesFromText(fenced([
        '<replace id="main">',
        '<<<<<<< ANCHOR',
        'Write as {{char}}.',
        '=======',
        'Write as {{char}}, tersely.',
        '>>>>>>> REPLACE',
        '</replace>',
        '<replace id="style">no markers here</replace>',
        '<append id="style">Tail.</append>',
        '<prepend id="style">Head.</prepend>',
        '<overwrite id="main">All new.</overwrite>',
        '<toggle id="style" enabled="true"/>',
    ].join('\n')));
    assert.deepEqual(changes.map(c => `${c.action}:${c.id}`), ['replace:main', 'append:style', 'prepend:style', 'overwrite:main', 'toggle:style']);
    assert.deepEqual(changes[0].patches, [{ search: 'Write as {{char}}.', replace: 'Write as {{char}}, tersely.' }]);
    assert.equal(changes[4].enabled, true);
});

test('an unterminated block (still streaming) parses to nothing and strips cleanly', () => {
    const text = 'Working on it.\n```prompt-changes\n<append id="main">half';
    assert.equal(parsePromptChangesFromText(text), null);
    assert.equal(stripPromptChangesBlock(text), 'Working on it.');
    assert.equal(stripPromptChangesBlock(fenced('<append id="main">x</append>')), 'Here are the edits.');
});

test('reconstructed blocks parse back to the same changes', () => {
    const original = [
        { action: 'replace', id: 'main', patches: [{ search: 'a || b', replace: 'c' }] },
        { action: 'append', id: 'style', value: 'Tail.' },
        { action: 'toggle', id: 'style', enabled: false },
    ];
    assert.deepEqual(parsePromptChangesFromText(reconstructPromptChangesBlock(original)), original);
});

test('preview fails safe on a missing anchor, a slot, or an unknown id', () => {
    ccContext();
    const miss = previewPromptChange({ action: 'replace', id: 'main', patches: [{ search: 'not in the prompt at all', replace: 'x' }] });
    assert.equal(miss.ok, false);
    assert.match(miss.reason, /not found/);
    assert.equal(previewPromptChange({ action: 'overwrite', id: 'chatHistory', value: 'x' }).ok, false);
    assert.equal(previewPromptChange({ action: 'append', id: 'ghost', value: 'x' }).ok, false);
});

test('applying a replace, append and toggle changes the live prompts', () => {
    const { ctx } = ccContext();
    assert.equal(applyPromptChange({ action: 'replace', id: 'main', patches: [{ search: 'Write as {{char}}.', replace: 'Speak as {{char}}.' }] }).ok, true);
    assert.equal(applyPromptChange({ action: 'append', id: 'style', value: 'Use dialogue.' }).ok, true);
    assert.equal(applyPromptChange({ action: 'toggle', id: 'style', enabled: true }).ok, true);
    const p = id => ctx.chatCompletionSettings.prompts.find(x => x.identifier === id);
    assert.equal(p('main').content, 'Speak as {{char}}.');
    assert.equal(p('style').content, 'Short.\n\nUse dialogue.');
    assert.equal(ctx.chatCompletionSettings.prompt_order[1].order[0].enabled, true);
});

test('get_prompts lists without content, then returns content for requested ids', () => {
    ccContext();
    const list = getPromptsForTool();
    assert.equal(list.prompts.length, 3);
    assert.equal('content' in list.prompts[0], false);
    const one = getPromptsForTool(['main', 'nope']);
    assert.equal(one.prompts[0].content, 'Write as {{char}}.');
    assert.deepEqual(one.missing, ['nope']);
});

test('text completion edits the system prompt', () => {
    const sp = { name: 'RP', content: 'old', enabled: true };
    globalThis.__stContext = { mainApi: 'textgenerationwebui', powerUserSettings: { sysprompt: sp }, saveSettingsDebounced() {} };
    assert.equal(getPromptManagerState().entries[0].content, 'old');
    applyPromptChanges({ sysprompt: { content: 'new' } });
    assert.equal(sp.content, 'new');
});
