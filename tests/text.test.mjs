import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySearchReplaceToField, applyBulkReplacement, promptHash } from '../src/utils/util-text.js';

test('anchor "first || last" replaces the whole span', () => {
    const src = 'Intro. The ancient castle was built in 1240 by a grumpy dwarf. Outro.';
    const { result, matched } = applySearchReplaceToField(src, 'The ancient castle || a grumpy dwarf.', 'NEW.');
    assert.equal(matched, true);
    assert.equal(result, 'Intro. NEW. Outro.');
});

test('exact search text is replaced verbatim', () => {
    const { result } = applySearchReplaceToField('a {{char}} b', '{{char}}', 'X');
    assert.equal(result, 'a X b');
});

test('anchors match Cyrillic text', () => {
    const src = 'Начало. Древний замок был построен гномом в горах. Конец.';
    const { result, matched } = applySearchReplaceToField(src, 'Древний замок был || гномом в горах.', 'Новый текст.');
    assert.equal(matched, true);
    assert.equal(result, 'Начало. Новый текст. Конец.');
});

test('anchors match Japanese text without spaces', () => {
    const src = '始まり。古い城は山の上に建っていた。終わり。';
    const { result, matched } = applySearchReplaceToField(src, '古い城は || 建っていた。', '新しい文。');
    assert.equal(matched, true);
    assert.equal(result, '始まり。新しい文。終わり。');
});

test('unmatched anchor reports failure and leaves text alone', () => {
    const src = 'Completely unrelated sentence here.';
    const { result, matched } = applySearchReplaceToField(src, 'Dragons breathe || over the mountains', 'x');
    assert.equal(matched, false);
    assert.equal(result, src);
});

test('bulk replacement is exact and replaces every occurrence', () => {
    const { result, matched } = applyBulkReplacement('old gold, old coat, OLD', 'old', 'new');
    assert.equal(matched, true);
    assert.equal(result, 'new gold, new coat, OLD');
});

test('bulk replacement does not fuzzy-match similar words', () => {
    const { matched } = applyBulkReplacement('the gold coin', 'old', 'new');
    assert.equal(matched, false);
});

test('promptHash ignores whitespace differences only', () => {
    assert.equal(promptHash('a  b\n c '), promptHash('a b c'));
    assert.notEqual(promptHash('a b c'), promptHash('a b d'));
});
