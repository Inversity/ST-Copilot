import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCharChangesFromText, parseCharCreationFromText, stripCharChangesBlock, parseAnchorPatches, groupChangesByCharacter } from '../src/features/feature-character-engine.js';
import { reconstructCharChangesBlock } from '../src/features/feature-character-ui.js';

const fence = (name, body) => 'Here you go.\n```' + name + '\n' + body + '\n```';

test('parses the documented character-changes format', () => {
    const text = fence('character-changes', [
        '<replace char="Rose" field="description">',
        '<<<<<<< ANCHOR',
        'Rose is || her garden.',
        '=======',
        'Rose is a botanist.',
        '>>>>>>> REPLACE',
        '</replace>',
        '<overwrite char="Rose" field="scenario">New scenario</overwrite>',
    ].join('\n'));
    const changes = parseCharChangesFromText(text);
    assert.equal(changes.length, 2);
    const rep = changes.find(c => c.action === 'replace');
    assert.equal(rep.char, 'Rose');
    assert.deepEqual(rep.patches, [{ search: 'Rose is || her garden.', replace: 'Rose is a botanist.' }]);
    assert.equal(changes.find(c => c.action === 'overwrite').value, 'New scenario');
});

test('accepts the character-edits block name used by older prompts', () => {
    const changes = parseCharChangesFromText(fence('character-edits', '<overwrite char="A" field="personality">x</overwrite>'));
    assert.equal(changes?.length, 1);
    assert.equal(stripCharChangesBlock(fence('character-edits', '<overwrite field="personality">x</overwrite>')), 'Here you go.');
});

test('accepts character-creation as well as character-create', () => {
    const body = '{"name_suggestion":"Mira","description":"d"}';
    assert.equal(parseCharCreationFromText(fence('character-creation', body)).name_suggestion, 'Mira');
    assert.equal(parseCharCreationFromText(fence('character-create', body)).name_suggestion, 'Mira');
});

test('anchor on the same line as the marker still parses', () => {
    const patches = parseAnchorPatches('<<<<<<< ANCHOR first words || last words\n=======\nnew text\n>>>>>>> REPLACE');
    assert.deepEqual(patches, [{ search: 'first words || last words', replace: 'new text' }]);
});

test('empty replacement deletes the passage', () => {
    const patches = parseAnchorPatches('<<<<<<< SEARCH\nfoo || bar\n=======\n\n>>>>>>> REPLACE');
    assert.deepEqual(patches, [{ search: 'foo || bar', replace: '' }]);
});

test('a malformed patch is skipped, never turned into a full overwrite', () => {
    const text = fence('character-changes', '<replace char="A" field="description">\n<<<<<<< ANCHOR\nfoo || bar\n</replace>');
    assert.equal(parseCharChangesFromText(text), null);
});

test('single-quoted attributes and field aliases are understood', () => {
    const changes = parseCharChangesFromText(fence('character-changes', "<overwrite char='A' field='first_message'>Hi</overwrite>"));
    assert.equal(changes[0].field, 'first_mes');
    assert.equal(changes[0].char, 'A');
});

test('<append> on a text field appends text instead of being dropped', () => {
    const changes = parseCharChangesFromText(fence('character-changes', '<append char="A" field="description">More.</append>'));
    assert.equal(changes[0].action, 'append_text');
    const greet = parseCharChangesFromText(fence('character-changes', '<append char="A" field="alternate_greetings">Hello</append>'));
    assert.equal(greet[0].action, 'append');
});

test('character names inside field text are left untouched', () => {
    const changes = parseCharChangesFromText(fence('character-changes', '<overwrite char="Rose" field="description">She rose early. Rose smiled.</overwrite>'));
    assert.equal(changes[0].value, 'She rose early. Rose smiled.');
    assert.equal(changes[0].char, 'Rose');
});

test('rebuilt pending block keeps the char attribute and round-trips', () => {
    const pending = [
        { field: 'description', action: 'replace', char: 'Bob', patches: [{ search: 'a || b', replace: 'c' }] },
        { field: 'scenario', action: 'overwrite', char: 'Ann', value: 'S' },
    ];
    const reparsed = parseCharChangesFromText(reconstructCharChangesBlock(pending));
    assert.deepEqual(reparsed.map(c => [c.char, c.field, c.action]).sort(), [['Ann', 'scenario', 'overwrite'], ['Bob', 'description', 'replace']]);
});

test('group chat: unknown names are skipped instead of hitting the first member', () => {
    const ann = { name: 'Ann', avatar: 'ann.png', data: {} };
    const bob = { name: 'Bob', avatar: 'bob.png', data: {} };
    globalThis.__stContext = { groupId: 'g1', groups: [{ id: 'g1', members: ['ann.png', 'bob.png'] }], characters: [ann, bob], name1: 'User' };
    try {
        const groups = groupChangesByCharacter([
            { field: 'description', action: 'overwrite', char: 'Bob', value: 'x' },
            { field: 'description', action: 'overwrite', char: 'Zed', value: 'y' },
        ]);
        assert.equal(groups.length, 1);
        assert.equal(groups[0].char.avatar, 'bob.png');
    } finally {
        delete globalThis.__stContext;
    }
});
