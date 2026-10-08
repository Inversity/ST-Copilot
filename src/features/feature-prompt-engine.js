import { ST_GLOBAL_PROMPT_ORDER_ID } from '../utils/util-st.js';

// Reads and writes the prompts SillyTavern sends for roleplay, the same objects ST's own
// Prompt Manager edits. Chat Completion: oai_settings.prompts in the global prompt order.
// Text Completion: the Advanced Formatting system prompt.

function _cc(ctx) {
    const cc = ctx.chatCompletionSettings || {};
    const order = (cc.prompt_order || []).find(o => String(o.character_id) === ST_GLOBAL_PROMPT_ORDER_ID)?.order || [];
    return { cc, prompts: cc.prompts || [], order };
}

// { mode: 'cc'|'tc', presetName, entries: [{ id, name, role, content, marker, enabled }] }
// Chat Completion entries follow ST's order, including disabled prompts and markers.
export function getPromptManagerState() {
    const ctx = SillyTavern.getContext();
    if (ctx.mainApi === 'openai') {
        const { cc, prompts, order } = _cc(ctx);
        const entries = order
            .map(o => {
                const p = prompts.find(x => x.identifier === o.identifier);
                if (!p) return null;
                return {
                    id: p.identifier,
                    name: p.name || p.identifier,
                    role: p.role || 'system',
                    content: p.content ?? '',
                    marker: !!p.marker,
                    enabled: !!o.enabled,
                };
            })
            .filter(Boolean);
        return { mode: 'cc', presetName: cc.preset_settings_openai || 'Default', entries };
    }
    const sp = ctx.powerUserSettings?.sysprompt || {};
    return {
        mode: 'tc',
        presetName: sp.name || '',
        entries: [{ id: 'sysprompt', name: sp.name || 'System Prompt', role: 'system', content: sp.content ?? '', marker: false, enabled: !!sp.enabled }],
    };
}

// changes: { [id]: { content?, name?, role?, enabled? } }. Writes into ST's live settings
// objects and saves settings.json, like ST's Prompt Manager. Markers keep their content
// (ST fills them in); only their enabled flag can change. Returns the ids applied.
export function applyPromptChanges(changes) {
    const ctx = SillyTavern.getContext();
    const applied = [];
    if (ctx.mainApi === 'openai') {
        const { prompts, order } = _cc(ctx);
        for (const [id, ch] of Object.entries(changes || {})) {
            const p = prompts.find(x => x.identifier === id);
            if (!p) continue;
            if (!p.marker) {
                if (typeof ch.content === 'string') p.content = ch.content;
                if (typeof ch.name === 'string' && ch.name.trim()) p.name = ch.name.trim();
                if (['system', 'user', 'assistant'].includes(ch.role)) p.role = ch.role;
            }
            if (typeof ch.enabled === 'boolean') {
                const o = order.find(x => x.identifier === id);
                if (o) o.enabled = ch.enabled;
            }
            applied.push(id);
        }
    } else {
        const sp = ctx.powerUserSettings?.sysprompt;
        const ch = changes?.sysprompt;
        if (sp && ch) {
            if (typeof ch.content === 'string') sp.content = ch.content;
            if (typeof ch.enabled === 'boolean') sp.enabled = ch.enabled;
            applied.push('sysprompt');
        }
    }
    if (applied.length && typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
    return applied;
}

// Same as ST's "Update current preset": writes the current settings into the preset file.
export async function updateCurrentPreset() {
    const ctx = SillyTavern.getContext();
    const pm = typeof ctx.getPresetManager === 'function' ? ctx.getPresetManager(ctx.mainApi === 'openai' ? 'openai' : 'sysprompt') : null;
    if (!pm || typeof pm.updatePreset !== 'function') throw new Error('Preset manager not available');
    await pm.updatePreset();
}
