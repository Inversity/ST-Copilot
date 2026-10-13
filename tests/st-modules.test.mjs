import { test } from 'node:test';
import assert from 'node:assert/strict';
// Under test, index.js exports are stub functions; ST module values are set on them.
import { ST_WorldInfo, ST_Personas, ST_Utils } from '../src/index.js';
import { getCurrentPersonaId, getUserPersona } from '../src/utils/util-st.js';
import { bindNewLorebookToCharacter } from '../src/features/feature-lorebook-engine.js';

function stContext(extra = {}) {
    const saves = [];
    globalThis.__stContext = {
        characters: [{ name: 'Lexi', avatar: 'lexi.png' }],
        characterId: 0,
        powerUserSettings: { persona_descriptions: { 'me.png': { description: 'A cartographer.' } } },
        substituteParams: t => t,
        getWorldInfoNames: () => ['Old Book', 'New Book'],
        saveSettingsDebounced: () => saves.push(1),
        ...extra,
    };
    return saves;
}

test('persona id comes from personas.js user_avatar', () => {
    stContext();
    ST_Personas.user_avatar = 'me.png';
    assert.equal(getCurrentPersonaId(), 'me.png');
    assert.equal(getUserPersona(), 'A cartographer.');
    ST_Personas.user_avatar = '';
    assert.equal(getCurrentPersonaId(), '');
});

test('binding a book uses charUpdateAddAuxWorld with the character avatar', async () => {
    stContext();
    const calls = [];
    ST_Utils.getCharaFilename = (_chid, { manualAvatarKey }) => manualAvatarKey.replace(/\.[^/.]+$/, '');
    ST_WorldInfo.world_info = { charLore: [{ name: 'lexi', extraBooks: ['Old Book'] }] };
    ST_WorldInfo.charUpdateAddAuxWorld = async (key, name) => calls.push([key, name]);
    await bindNewLorebookToCharacter('New Book');
    assert.deepEqual(calls, [['lexi.png', 'New Book']]);
    await bindNewLorebookToCharacter('Old Book');
    assert.equal(calls.length, 1, 'already bound: nothing to do');
});

test('without charUpdateAddAuxWorld it writes ST\'s world_info settings, not a DOM element', async () => {
    const saves = stContext();
    delete ST_WorldInfo.charUpdateAddAuxWorld;
    ST_WorldInfo.world_info = { charLore: [] };
    await bindNewLorebookToCharacter('New Book');
    assert.deepEqual(ST_WorldInfo.world_info.charLore, [{ name: 'lexi', extraBooks: ['New Book'] }]);
    assert.equal(saves.length, 1);
});
