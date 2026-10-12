import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSmoothReveal } from '../src/api.js';

// A fake clock and frame queue: frames run only when the test calls tick(ms).
function harness(settings, { focused = true } = {}) {
    let t = 0;
    let frames = [];
    const out = [];
    const reveal = createSmoothReveal((text, reasoning) => out.push({ text, reasoning }), {
        now: () => t,
        frame: cb => frames.push(cb),
        settings: () => settings,
        focused: () => focused,
    });
    const tick = ms => { t += ms; const run = frames; frames = []; run.forEach(cb => cb()); };
    return { reveal, tick, out, last: () => out.at(-1), pending: () => frames.length };
}

test('off: every push is shown at once', () => {
    const h = harness({ smooth_streaming: false });
    h.reveal.push('Hello world', null, null, false);
    assert.deepEqual(h.last(), { text: 'Hello world', reasoning: null });
    assert.equal(h.pending(), 0);
});

test('on: characters appear at ST getDelay pace (speed 50 = 20 ms each)', () => {
    const h = harness({ smooth_streaming: true, smooth_streaming_speed: 50 });
    h.reveal.push('abcdef', null, null, false);
    h.tick(0);   // first frame starts the clock; the first character has no delay before it
    assert.equal(h.last().text, 'a');
    h.tick(40);  // two more characters at 20 ms each
    assert.equal(h.last().text, 'abc');
    h.tick(1000);
    assert.equal(h.last().text, 'abcdef');
    assert.equal(h.pending(), 0);
});

test('punctuation pauses: 25x after a period, 12.5x after a comma', () => {
    const h = harness({ smooth_streaming: true, smooth_streaming_speed: 50 });  // base 20 ms
    h.reveal.push('a.b,c', null, null, false);
    h.tick(0);                        // "a"
    h.tick(20);  assert.equal(h.last().text, 'a.');
    h.tick(499); assert.equal(h.last().text, 'a.');   // 500 ms pause after "."
    h.tick(1);   assert.equal(h.last().text, 'a.b');
    h.tick(20);  assert.equal(h.last().text, 'a.b,');
    h.tick(249); assert.equal(h.last().text, 'a.b,');  // 250 ms pause after ","
    h.tick(1);   assert.equal(h.last().text, 'a.b,c');
});

test('reasoning is shown first; no_think skips its pacing', () => {
    const paced = harness({ smooth_streaming: true, smooth_streaming_speed: 50 });
    paced.reveal.push('xy', 'abc', null, false);
    paced.tick(0);
    assert.deepEqual(paced.last(), { text: '', reasoning: 'a' });

    const noThink = harness({ smooth_streaming: true, smooth_streaming_speed: 50, smooth_streaming_no_think: true });
    noThink.reveal.push('xy', 'abc', null, false);
    noThink.tick(0);
    assert.deepEqual(noThink.last(), { text: 'x', reasoning: 'abc' });
});

test('unfocused page: no pacing, as in ST', () => {
    const h = harness({ smooth_streaming: true, smooth_streaming_speed: 50 }, { focused: false });
    h.reveal.push('Hello', null, null, false);
    assert.equal(h.last().text, 'Hello');
});

test('drain waits for the reveal; abort shows the rest at once', async () => {
    const h = harness({ smooth_streaming: true, smooth_streaming_speed: 50 });
    h.reveal.push('abcdef', null, null, true);
    h.tick(0);
    let drained = false;
    const done = h.reveal.drain().then(() => { drained = true; });
    h.tick(40);
    await Promise.resolve();
    assert.equal(drained, false);
    h.tick(1000);
    await done;
    assert.equal(h.last().text, 'abcdef');

    const h2 = harness({ smooth_streaming: true, smooth_streaming_speed: 50 });
    h2.reveal.push('abcdef', null, null, true);
    h2.tick(0);
    const ac = new AbortController();
    const d2 = h2.reveal.drain(ac.signal);
    ac.abort();
    await d2;
    assert.equal(h2.last().text, 'abcdef');
});

test('after an aborted drain, a frame still queued emits nothing', async () => {
    const h = harness({ smooth_streaming: true, smooth_streaming_speed: 50 });
    h.reveal.push('abcdef', null, null, true);
    h.tick(0);                       // a step is now queued for the next frame
    const ac = new AbortController();
    const d = h.reveal.drain(ac.signal);
    ac.abort();
    await d;
    const emitted = h.out.length;
    h.tick(1000);                    // the leftover frame runs
    h.reveal.push('abcdefgh', null, null, true);
    assert.equal(h.out.length, emitted);
});

test('rewritten text keeps only the part still shown', () => {
    const h = harness({ smooth_streaming: true, smooth_streaming_speed: 50 });
    h.reveal.push('abcdef', null, null, false);
    h.tick(0); h.tick(60);                 // "abcd" shown
    h.reveal.push('abXYZ', null, null, false);
    h.tick(0);
    assert.equal(h.last().text.slice(0, 2), 'ab');
    assert.ok(h.last().text.length <= 5);
    h.tick(1000);
    assert.equal(h.last().text, 'abXYZ');
});
