import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReasoningClock } from '../src/api.js';

function fakeClock() {
    let t = 0;
    return { now: () => t, at: v => { t = v; } };
}

test('done once real text arrives and reasoning stops; time ends at the last reasoning', () => {
    const c = fakeClock();
    const tick = createReasoningClock(c.now);
    c.at(0);    assert.deepEqual(tick('think', ''), { ms: 0, done: false });
    c.at(4000); assert.deepEqual(tick('think more', ''), { ms: 4000, done: false });
    c.at(5000); assert.deepEqual(tick('think more', 'Hello'), { ms: 4000, done: true });
    c.at(9000); assert.deepEqual(tick('think more', 'Hello there'), { ms: 4000, done: true });
});

test('a stray newline before the reply does not stop the timer', () => {
    const c = fakeClock();
    const tick = createReasoningClock(c.now);
    c.at(0);     tick('a', '');
    c.at(10000); assert.equal(tick('a', '\n').done, false);
    c.at(70000); const r = tick('a b c', '\n');
    assert.equal(r.done, false);
    assert.equal(r.ms, 70000);
});

test('reasoning that resumes after text starts the timer again', () => {
    const c = fakeClock();
    const tick = createReasoningClock(c.now);
    c.at(0);    tick('plan', '');
    c.at(2000); assert.equal(tick('plan', 'Step 1').done, true);
    c.at(6000); assert.deepEqual(tick('plan, then more', 'Step 1'), { ms: 6000, done: false });
    c.at(7000); assert.deepEqual(tick('plan, then more', 'Step 1. Step 2'), { ms: 6000, done: true });
});

test('no reasoning at all reports no time', () => {
    const tick = createReasoningClock(() => 0);
    assert.deepEqual(tick(null, 'Just an answer'), { ms: null, done: false });
});
