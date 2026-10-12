import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, splitStreamingMarkdown } from '../src/utils/util-markdown.js';

// HTML-block placeholder ids come from a counter, so two renders of the same text differ
// only there.
const norm = html => html.replace(/data-hbid="scp-hb-\d+"/g, 'data-hbid="x"');

function rng(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Replies mixing every construct renderMarkdown knows, including the ones that reach
// across blank lines (lists, code fences) and edge cases like a heading of only spaces.
function randomDoc(seed) {
    const r = rng(seed);
    const pick = a => a[Math.floor(r() * a.length)];
    const words = ['lantern', 'ford', '**bold**', '*it*', '`code`', '~~old~~', 'a < b', 'x & y', 'map', 'rain'];
    const sentence = () => Array.from({ length: 2 + Math.floor(r() * 6) }, () => pick(words)).join(' ');
    const blocks = [
        () => sentence() + (r() < 0.3 ? '\n' + sentence() : ''),
        () => `${'#'.repeat(1 + Math.floor(r() * 3))} ${sentence()}`,
        () => '##  ',
        () => pick(['---', '***', '___']),
        () => Array.from({ length: 2 + Math.floor(r() * 3) }, (_, i) => `${r() < 0.3 ? '  ' : ''}${r() < 0.5 ? '-' : `${i + 1}.`} ${sentence()}`).join('\n'),
        () => `- ${sentence()}\n\n- ${sentence()}`,
        () => ['| a | b |', '|---|---|', `| ${sentence()} | x |`].join('\n'),
        () => `> ${sentence()}\n> ${sentence()}`,
        () => '```js\nconst a = 1;\n\nconst b = 2;\n```',
        () => '```html\n<b>hi</b>\n```',
        () => `  ${sentence()}`,
        () => `${sentence()} \`\`\`inline fence\`\`\` ${sentence()}`,
    ];
    const parts = Array.from({ length: 6 + Math.floor(r() * 10) }, () => pick(blocks)());
    return parts.map((p, i) => p + (i < parts.length - 1 ? '\n'.repeat(1 + Math.floor(r() * 3)) : '')).join('');
}

test('split render equals full render for every prefix of generated replies', () => {
    let splits = 0;
    for (let seed = 1; seed <= 150; seed++) {
        const doc = randomDoc(seed);
        for (let end = 1; end <= doc.length; end++) {
            const text = doc.slice(0, end);
            const s = splitStreamingMarkdown(text);
            if (!s) continue;
            splits++;
            assert.equal(norm(renderMarkdown(s.stable) + s.joiner + renderMarkdown(s.tail)), norm(renderMarkdown(text)),
                `seed ${seed}, prefix ${end}: ${JSON.stringify(text.slice(-80))}`);
        }
    }
    // Guards against a split that is "always equal" because it never applies.
    assert.ok(splits > 1000, `expected the split to apply often, got ${splits}`);
});

test('splits at the last eligible blank line; a heading tail adds no extra <br>', () => {
    const s = splitStreamingMarkdown('First paragraph.\n\n\nSecond paragraph.\n\n## Heading\n\nTail being written');
    assert.deepEqual(s, {
        stable: 'First paragraph.\n\n\nSecond paragraph.',
        joiner: '<br>',
        tail: '## Heading\n\nTail being written',
    });
});

test('never splits inside an open code fence', () => {
    assert.deepEqual(splitStreamingMarkdown('Intro.\n\n```js\nconst a = 1;\n\nconst b'), {
        stable: 'Intro.',
        joiner: '<br><br>',
        tail: '```js\nconst a = 1;\n\nconst b',
    });
});

test('never splits before a list item, since a blank line inside a list keeps it open', () => {
    assert.equal(splitStreamingMarkdown('Para.\n\n- item one\n\n- item two'), null);
});
