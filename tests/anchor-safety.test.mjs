import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySearchReplaceToField } from '../src/utils/util-text.js';

test('exact text found twice is refused as ambiguous', () => {
    const src = 'He smiles. Later she smiles.';
    const r = applySearchReplaceToField(src, 'smiles.', 'X');
    assert.equal(r.matched, false);
    assert.equal(r.reason, 'ambiguous');
    assert.equal(r.result, src);
});

test('boundary anchor with a repeated start is refused', () => {
    const src = '*{{char}} waves.* Hello. *{{char}} waves.* Goodbye.';
    const r = applySearchReplaceToField(src, '*{{char}} waves.* || Goodbye.', 'X');
    assert.equal(r.reason, 'ambiguous');
    assert.equal(r.result, src);
});

test('boundary anchor with a repeated end after the start is refused', () => {
    const src = 'Opening line. She smiles. Middle. She smiles. Tail.';
    const r = applySearchReplaceToField(src, 'Opening line. || She smiles.', 'X');
    assert.equal(r.reason, 'ambiguous');
    assert.equal(r.result, src);
});

test('a near-miss anchor no longer patches a similar sentence', () => {
    // The old 0.72 threshold matched "bar" for "wall" and rewrote the wrong greeting.
    const src = '*{{char}} leans against the bar, smirking.*\n\n*{{char}} leans against the door, smirking.*';
    const r = applySearchReplaceToField(src, '{{char}} leans against the wall, smirking.', 'X');
    assert.equal(r.matched, false);
    assert.equal(r.reason, 'not_found');
    assert.equal(r.result, src);
});

test('a typo equally close to two sentences is refused as ambiguous', () => {
    // "rad" is one edit from both "red" and "rod".
    const src = '{{char}} slowly opens the heavy red door. Later {{char}} slowly opens the heavy rod door.';
    const r = applySearchReplaceToField(src, '{{char}} slowly opens the heavy rad door.', 'X');
    assert.equal(r.reason, 'ambiguous');
    assert.equal(r.result, src);
});

test('a typo with one clearly closer sentence picks that one', () => {
    const src = '{{char}} leans against the counter, smirking at nothing. Then {{char}} leans against the counter, smirking at nobody.';
    const r = applySearchReplaceToField(src, '{{char}} leans against the counter, smirkng at nothing.', 'X.');
    assert.equal(r.matched, true);
    assert.equal(r.result, 'X. Then {{char}} leans against the counter, smirking at nobody.');
});

test('a small typo with one clear match still applies', () => {
    const src = 'Intro. {{char}} polishes the old brass lantern slowly. Outro.';
    const r = applySearchReplaceToField(src, '{{char}} polishes the old brass lanturn slowly.', 'NEW.');
    assert.equal(r.matched, true);
    assert.equal(r.result, 'Intro. NEW. Outro.');
});

test('curly quotes and dashes in the field match straight ones in the anchor', () => {
    const src = 'Before. “Hello,” she said — quietly. After.';
    const r = applySearchReplaceToField(src, '"Hello," she said - quietly.', 'X.');
    assert.equal(r.matched, true);
    assert.equal(r.result, 'Before. X. After.');
});

test('whitespace differences do not break a match', () => {
    const src = 'Line one.\n\nLine   two. Rest.';
    const r = applySearchReplaceToField(src, 'Line one. Line two.', 'X.');
    assert.equal(r.matched, true);
    assert.equal(r.result, 'X. Rest.');
});

test('an ellipsis in prose is not treated as a boundary separator', () => {
    // The old matcher split on "..." and replaced everything from "She paused" to "then she left".
    const src = 'She paused. A long unrelated stretch of narration sits here. Then she left.';
    const r = applySearchReplaceToField(src, 'She paused... then left', 'X');
    assert.equal(r.matched, false);
    assert.equal(r.result, src);
});
