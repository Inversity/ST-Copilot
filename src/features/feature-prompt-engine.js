import { ST_GLOBAL_PROMPT_ORDER_ID } from '../utils/util-st.js';
import { applySearchReplaceToField } from '../utils/util-text.js';
import { parseAnchorPatches } from './feature-character-engine.js';

export const PROMPT_CHANGES_BLOCK = 'prompt-changes';

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

// ─── AI-proposed edits ──────────────────────────────────────────────────────

// get_prompts tool: without ids, a listing; with ids, those prompts' stored content.
export function getPromptsForTool(ids) {
    const { mode, presetName, entries } = getPromptManagerState();
    const want = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;
    if (!want) {
        return {
            mode, preset: presetName,
            prompts: entries.map(e => ({ id: e.id, name: e.name, role: e.role, enabled: e.enabled, slot: e.marker, chars: e.marker ? 0 : String(e.content || '').length })),
            note: 'Call again with ids to read content. Slots are filled by SillyTavern and cannot be edited, only toggled.',
        };
    }
    const found = entries.filter(e => want.has(e.id) || want.has(e.name));
    return {
        prompts: found.map(e => ({ id: e.id, name: e.name, role: e.role, enabled: e.enabled, slot: e.marker, content: e.marker ? null : e.content })),
        missing: [...want].filter(w => !found.some(e => e.id === w || e.name === w)),
    };
}

const _ATTR_RE = /([\w-]+)\s*=\s*"([^"]*)"/g;
function _attrs(s) {
    const out = {};
    for (const m of String(s || '').matchAll(_ATTR_RE)) out[m[1]] = m[2];
    return out;
}

// Finished ```prompt-changes block only; an unterminated one is still streaming.
function _extractBlock(text) {
    const m = String(text || '').match(new RegExp('```' + PROMPT_CHANGES_BLOCK + '[^\\n]*\\n([\\s\\S]*?)```'));
    return m ? m[1] : null;
}

// [{ action: 'replace'|'overwrite'|'append'|'prepend'|'toggle', id, patches?, value?, enabled? }]
export function parsePromptChangesFromText(text) {
    const raw = _extractBlock(text);
    if (!raw) return null;
    const changes = [];
    const tagRe = /<(replace|overwrite|append|prepend)\b([^>]*)>([\s\S]*?)<\/\1>/g;
    for (const m of raw.matchAll(tagRe)) {
        const [, action, attrStr, body] = m;
        const id = _attrs(attrStr).id;
        if (!id) continue;
        if (action === 'replace') {
            const patches = parseAnchorPatches(body);
            // A replace without a usable patch must not turn into an overwrite.
            if (patches.length) changes.push({ action, id, patches });
        } else {
            changes.push({ action, id, value: body.replace(/^\r?\n/, '').replace(/\r?\n$/, '') });
        }
    }
    for (const m of raw.matchAll(/<toggle\b([^>]*?)\/?>/g)) {
        const a = _attrs(m[1]);
        if (a.id && (a.enabled === 'true' || a.enabled === 'false')) changes.push({ action: 'toggle', id: a.id, enabled: a.enabled === 'true' });
    }
    return changes.length ? changes : null;
}

export function stripPromptChangesBlock(text) {
    return String(text || '')
        .replace(new RegExp('```' + PROMPT_CHANGES_BLOCK + '[\\s\\S]*?```', 'g'), '')
        .replace(new RegExp('```' + PROMPT_CHANGES_BLOCK + '[\\s\\S]*$'), '')
        .trim();
}

// Rebuilds a block from the still-pending changes, so a re-render shows only those.
export function reconstructPromptChangesBlock(changes) {
    const body = changes.map(c => {
        if (c.action === 'toggle') return `<toggle id="${c.id}" enabled="${c.enabled}"/>`;
        if (c.action === 'replace') {
            const patches = c.patches.map(p => `<<<<<<< ANCHOR\n${p.search}\n=======\n${p.replace}\n>>>>>>> REPLACE`).join('\n');
            return `<replace id="${c.id}">\n${patches}\n</replace>`;
        }
        return `<${c.action} id="${c.id}">\n${c.value}\n</${c.action}>`;
    }).join('\n');
    return '```' + PROMPT_CHANGES_BLOCK + '\n' + body + '\n```';
}

// What a change would produce against the prompt as it is now. Fails safe: an anchor that
// doesn't match (or matches twice) returns ok: false and changes nothing.
export function previewPromptChange(change) {
    const entry = getPromptManagerState().entries.find(e => e.id === change.id || e.name === change.id);
    if (!entry) return { ok: false, reason: `No prompt with id "${change.id}"` };
    if (change.action === 'toggle') return { ok: true, entry, before: entry.content, after: entry.content, enabled: change.enabled };
    if (entry.marker) return { ok: false, entry, reason: `"${entry.name}" is a slot; its content can't be edited` };
    const before = String(entry.content || '');
    let after = before;
    if (change.action === 'overwrite') after = change.value;
    else if (change.action === 'append') after = before ? `${before}\n\n${change.value}` : change.value;
    else if (change.action === 'prepend') after = before ? `${change.value}\n\n${before}` : change.value;
    else if (change.action === 'replace') {
        for (const p of change.patches) {
            const r = applySearchReplaceToField(after, p.search, p.replace);
            if (!r.matched) {
                return { ok: false, entry, reason: r.reason === 'ambiguous'
                    ? `Anchor matches more than one place: "${p.search.slice(0, 50)}"`
                    : `Anchor not found: "${p.search.slice(0, 50)}"` };
            }
            after = r.result;
        }
    }
    return { ok: true, entry, before, after };
}

export function applyPromptChange(change) {
    const pv = previewPromptChange(change);
    if (!pv.ok) return pv;
    const id = pv.entry.id;
    applyPromptChanges(change.action === 'toggle' ? { [id]: { enabled: change.enabled } } : { [id]: { content: pv.after } });
    return pv;
}

export const DEFAULT_PROMPT_EDIT_DIRECTIVE = `<prompt_editing>
You can edit the user's SillyTavern roleplay prompts (the Prompt Manager prompts of the active preset). Read them first with the get_prompts tool: call it without ids for the list, then with ids for the content you need. Never edit a prompt you have not read in this turn; an accepted edit changes the text.

To propose changes, end your reply with one block:
\`\`\`${PROMPT_CHANGES_BLOCK}
<replace id="PROMPT_ID">
<<<<<<< ANCHOR
exact current text to find (or "first words || last words" for a long span)
=======
replacement text
>>>>>>> REPLACE
</replace>
<append id="PROMPT_ID">text added at the end</append>
<prepend id="PROMPT_ID">text added at the start</prepend>
<overwrite id="PROMPT_ID">entire new content</overwrite>
<toggle id="PROMPT_ID" enabled="false"/>
\`\`\`

Rules:
- id is the prompt id from get_prompts (e.g. "main" or a long generated id), copied exactly.
- Prefer replace. Its anchor must be copied verbatim from the current content and must match exactly one place; otherwise the edit is refused and nothing changes. Use overwrite only for a full rewrite.
- Keep macros such as {{char}} and {{user}} exactly as they appear.
- Slots (chatHistory, charDescription, ...) can only be toggled.
- The user reviews every change before it is applied.
</prompt_editing>`;

export function buildPromptEditAIInstructions(settings) {
    return settings?.promptEditAIEnabled ? DEFAULT_PROMPT_EDIT_DIRECTIVE : '';
}

// Same as ST's "Update current preset": writes the current settings into the preset file.
export async function updateCurrentPreset() {
    const ctx = SillyTavern.getContext();
    const pm = typeof ctx.getPresetManager === 'function' ? ctx.getPresetManager(ctx.mainApi === 'openai' ? 'openai' : 'sysprompt') : null;
    if (!pm || typeof pm.updatePreset !== 'function') throw new Error('Preset manager not available');
    await pm.updatePreset();
}
