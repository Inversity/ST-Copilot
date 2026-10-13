import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySearchReplaceToField } from '../src/utils/util-text.js';
import { applyPatch, applyPatches } from '../src/utils/util-patch.js';

const SRC = 'Rule one. Never cross the ford after dark. Middle text. Never cross the ford after dark. End.';

test('a repeated plain anchor is refused by default and reports how many places', () => {
    const r = applySearchReplaceToField(SRC, 'Never cross the ford after dark.', 'X');
    assert.equal(r.matched, false);
    assert.equal(r.reason, 'ambiguous');
    assert.equal(r.occurrences, 2);
    assert.equal(r.result, SRC);
});

test('with all: true every identical occurrence is replaced', () => {
    const r = applySearchReplaceToField(SRC, 'Never cross the ford after dark.', 'Never cross the ford at night.', { all: true });
    assert.equal(r.matched, true);
    assert.equal(r.occurrences, 2);
    assert.equal(r.result, 'Rule one. Never cross the ford at night. Middle text. Never cross the ford at night. End.');
});

test('all does not apply to boundary anchors or fuzzy near-matches', () => {
    const boundary = applySearchReplaceToField('A x B. A y B.', 'A || B.', 'Z', { all: true });
    assert.equal(boundary.matched, false);
    // "rad" is equally close to "red" and "rod": two different places, not identical text.
    const fuzzy = applySearchReplaceToField('the heavy red door. the heavy rod door.', 'the heavy rad door.', 'Z', { all: true });
    assert.equal(fuzzy.matched, false);
    assert.equal(fuzzy.occurrences, undefined);
});

test('applyPatches carries the choice and reports ambiguity for the card', () => {
    const patch = { search: 'Never cross the ford after dark.', replace: 'Never cross the ford at night.' };
    const first = applyPatches(SRC, [patch], 'description');
    assert.equal(first.ok, false);
    assert.equal(first.ambiguous.count, 2);
    assert.equal(first.ambiguous.patch, patch);
    assert.match(first.reason, /appears 2 times in description/);
    patch.all = true;  // what "Change all" does
    const second = applyPatches(SRC, [patch]);
    assert.equal(second.ok, true);
    assert.doesNotMatch(second.text, /after dark/);
    assert.equal(applyPatch(SRC, patch).result, second.text);
});

test('applyPatches runs patches in sequence, as apply does', () => {
    const r = applyPatches('alpha beta gamma', [{ search: 'alpha', replace: 'one' }, { anchor: 'one beta', replace: 'two' }]);
    assert.deepEqual(r, { ok: true, text: 'two gamma' });
    const miss = applyPatches('alpha', [{ search: 'zeta', replace: 'x' }]);
    assert.equal(miss.ok, false);
    assert.match(miss.reason, /not found/);
});
