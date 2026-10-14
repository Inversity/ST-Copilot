// Every translation key the UI uses has a Korean translation, and translations keep the
// ${n} placeholders of their key. A failure here means new or reworded UI text: run
// `node tools/i18n-keys.mjs` to list the keys, and add them to i18n/ko-kr.json.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('every UI translation key has a Korean translation', () => {
    const out = execFileSync(process.execPath, ['tools/i18n-keys.mjs', '--json'], { cwd: root, encoding: 'utf8' });
    const { missing } = JSON.parse(out);
    assert.deepEqual(Object.keys(missing), [], 'keys without a translation in i18n/ko-kr.json');
});

test('Korean translations keep the placeholders of their key', () => {
    const ko = JSON.parse(fs.readFileSync(path.join(root, 'i18n/ko-kr.json'), 'utf8'));
    const ph = s => (String(s).match(/\$\{\d+\}/g) || []).sort().join();
    const bad = Object.entries(ko).filter(([k, v]) => ph(k) !== ph(v)).map(([k]) => k);
    assert.deepEqual(bad, []);
});
