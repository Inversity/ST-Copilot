import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeTool } from '../src/features/feature-tools-engine.js';

function withCharacter(data) {
    globalThis.__stContext = {
        characters: [{ name: 'Lexi', avatar: 'lexi.png', data }],
        characterId: 0,
        name1: 'Joe',
        chatMetadata: {},
        // Expands like ST does ({{description}} resolves to the field, then its nested
        // macros resolve), so a regression back to expanded text would show up.
        substituteParams: s => String(s)
            .replace(/\{\{(description|personality|scenario)\}\}/g, (_, f) => data[f] || '')
            .replaceAll('{{char}}', 'Lexi').replaceAll('{{user}}', 'Joe'),
    };
}

test('get_char_info labels alternate greetings with their 1-based edit index', async () => {
    withCharacter({ alternate_greetings: ['First alt', 'Second alt', 'Third alt'] });
    const r = await executeTool('get_char_info', { fields: ['alternate_greetings'] });
    assert.deepEqual(r.alternate_greetings, [
        { id: 1, text: 'First alt' },
        { id: 2, text: 'Second alt' },
        { id: 3, text: 'Third alt' },
    ]);
});

test('get_char_info returns stored text with macros unexpanded', async () => {
    withCharacter({ description: '{{char}} teases {{user}} constantly.' });
    const r = await executeTool('get_char_info', { fields: ['description'] });
    assert.equal(r.description, '{{char}} teases {{user}} constantly.');
});

test('get_char_info returns an empty string for an empty stored field', async () => {
    withCharacter({ scenario: '' });
    const r = await executeTool('get_char_info', { fields: ['scenario'] });
    assert.equal(r.scenario, '');
});
