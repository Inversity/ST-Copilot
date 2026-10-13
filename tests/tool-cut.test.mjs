import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findToolCallCut, cutAfterToolCalls, parseToolCallsFromText } from '../src/features/feature-tools-engine.js';

const call = (name, input = {}) => '```tool_call\n' + JSON.stringify({ name, input }) + '\n```';

test('no tool call, or one still streaming, gives no cut', () => {
    assert.equal(findToolCallCut('Just an answer.'), null);
    assert.equal(findToolCallCut('Checking.\n```tool_call\n{"name": "get_char'), null);
});

test('a complete block is not settled until other text follows it', () => {
    const block = 'Let me read it.\n' + call('get_char_info');
    assert.deepEqual(findToolCallCut(block), { end: block.length, settled: false });
    assert.equal(findToolCallCut(block + '\n\n').settled, false);
    assert.equal(findToolCallCut(block + '\n\n``').settled, false, 'could be a second block opening');
    assert.equal(findToolCallCut(block + '\n\n```tool_call\n{"na').settled, false, 'second block still streaming');
    assert.deepEqual(findToolCallCut(block + '\n\nHere is the review'), { end: block.length, settled: true });
});

test('the review written after a tool call is cut, the text before it is kept', () => {
    const head = 'Greeting 3 is only a preview, so I will read it first.\n' + call('get_char_info', { fields: ['alternate_greetings'], greeting_ids: [3] });
    const text = head + '\n\nGreeting 3 reads well overall, but the pacing...';
    assert.equal(cutAfterToolCalls(text), head);
    assert.deepEqual(parseToolCallsFromText(cutAfterToolCalls(text)).map(t => t.name), ['get_char_info']);
});

test('back-to-back blocks all survive the cut', () => {
    const head = call('get_char_info') + '\n' + call('read_messages', { indices: [0] });
    assert.equal(cutAfterToolCalls(head + '\nAnd so...'), head);
    assert.equal(parseToolCallsFromText(head).length, 2);
});

test('several calls in one block parse, one object per line', () => {
    const block = '```tool_call\n{"name": "get_char_info", "input": {"greeting_ids": [1]}}\n{"name": "read_messages", "input": {"indices": [2]}}\n```';
    assert.deepEqual(parseToolCallsFromText(block).map(t => t.name), ['get_char_info', 'read_messages']);
});

test('text without a complete block is returned unchanged', () => {
    assert.equal(cutAfterToolCalls('No tools here.'), 'No tools here.');
});
