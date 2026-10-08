import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionProviderKey, validateModelOverride } from '../src/utils/util-st.js';

const deepseek = { api: 'deepseek', model: 'deepseek-v4-pro' };
const openrouter = { api: 'openrouter', model: 'google/gemini-3.7-flash' };

test('an override survives while the provider is unchanged', () => {
    const s = { modelOverride: 'deepseek-v4-flash', modelOverrideFor: 'deepseek' };
    assert.equal(validateModelOverride(s, deepseek), 'deepseek-v4-flash');
    assert.equal(s.modelOverride, 'deepseek-v4-flash');
});

test('switching the profile to another provider clears the override', () => {
    const s = { modelOverride: 'deepseek-v4-flash', modelOverrideFor: 'deepseek' };
    assert.equal(validateModelOverride(s, openrouter), '');
    assert.deepEqual([s.modelOverride, s.modelOverrideFor], ['', '']);
});

test('an override saved before providers were tracked adopts the current provider', () => {
    const s = { modelOverride: 'google/gemini-3.8-flash' };
    assert.equal(validateModelOverride(s, openrouter), 'google/gemini-3.8-flash');
    assert.equal(s.modelOverrideFor, 'openrouter');
});

test('custom endpoints are told apart by URL', () => {
    const a = { api: 'custom', 'api-url': 'http://127.0.0.1:4000/v1' };
    const b = { api: 'custom', 'api-url': 'http://127.0.0.1:8901/claude/v1' };
    assert.notEqual(connectionProviderKey(a), connectionProviderKey(b));
    const s = { modelOverride: 'x', modelOverrideFor: connectionProviderKey(a) };
    assert.equal(validateModelOverride(s, b), '');
});
