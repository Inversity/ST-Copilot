import { DEFAULT_TOOLS_PROMPT, TOOL_CALL_FORMAT_BLOCK, TOOL_DEFINITIONS } from '../constants.js';
import { getSettings } from '../session.js';
import { _ensureWrapped } from '../utils/util-text.js';
import { getCharInfo, getTagsForCharacter } from '../utils/util-st.js';
import { fetchWorldInfoBook, getDisplayName, getActiveLorebookNames, wiEntriesToArray, getEntryOutletName } from './feature-lorebook-engine.js';

// Read tools that return previews say so, and name the tool that returns the full text: edits
// need anchors copied exactly, and an anchor guessed from a preview fails or hits the wrong place.
const PREVIEW_NOTE_MESSAGES = 'Long messages are cut to a preview (truncated: true). Before quoting or editing one, read it in full with read_messages.';
const PREVIEW_NOTE_LOREBOOK = 'content_preview is the first 200 characters. Before quoting or editing an entry, read it in full with get_lorebook_entry.';
const READ_MESSAGES_MAX = 20;
const WI_POSITION_NAMES = ['before_char', 'after_char', 'authors_note_top', 'authors_note_bottom', 'at_depth', 'examples_top', 'examples_bottom', 'outlet'];

const _messageView = (ctx, m, i) => ({
    index: i,
    role: m.is_user ? 'user' : 'assistant',
    name: m.name || (m.is_user ? (ctx.name1 || 'User') : (ctx.name2 || 'Character')),
    hidden: !!(m.is_system || m.extra?.is_hidden),
});
const _preview = (text, max) => text.length > max ? { content: text.slice(0, max) + '...[truncated]', truncated: true } : { content: text };
import { getPromptsForTool } from './feature-prompt-engine.js';
import { loadRegexModule } from '../integrations/integ-regex.js';

export function getEnabledTools() {
    const s = getSettings();
    if (!s.toolsEnabled) return [];
    return TOOL_DEFINITIONS.filter(t => s[t.settingKey] !== false);
}

export function buildAnthropicToolsPayload() {
    return getEnabledTools().map(t => ({
        name: t.name,
        description: t.label + ': ' + t.description,
        input_schema: t.schema,
    }));
}

export async function executeTool(toolName, toolInput) {
    const ctx = SillyTavern.getContext();
    switch (toolName) {
        case 'search_chat': {
            const msgs = ctx.chat || [];
            let rawQueries = Array.isArray(toolInput.queries) ? toolInput.queries : (Array.isArray(toolInput.query) ? toolInput.query : [toolInput.query || '']);
            const parsedQueries = rawQueries.map(q => {
                const s = String(q);
                const regexMatch = s.match(/^\/(.+)\/([gimsuy]*)$/);
                if (regexMatch) {
                    try { return { type: 'regex', re: new RegExp(regexMatch[1], regexMatch[2]) }; } catch(_) {}
                }
                return { type: 'text', lq: s.toLowerCase() };
            });
            const role = toolInput.role || 'all';
            const fromIdx = toolInput.from_index ?? 0;
            const toIdx = toolInput.to_index ?? msgs.length - 1;
            const maxResults = Math.min(toolInput.max_results ?? 10, 50);
            const includeContent = toolInput.include_content !== false;
            
            const results = [];
            for (let i = Math.max(0, fromIdx); i <= Math.min(msgs.length - 1, toIdx); i++) {
                const m = msgs[i];
                if (role === 'user' && !m.is_user) continue;
                if (role === 'assistant' && m.is_user) continue;
                const text = m.mes || '';
                
                let matched = false;
                for (const pq of parsedQueries) {
                    if (pq.type === 'regex' && pq.re) {
                        pq.re.lastIndex = 0;
                        if (pq.re.test(text)) { matched = true; break; }
                    } else {
                        if (text.toLowerCase().includes(pq.lq)) { matched = true; break; }
                        const tokens = pq.lq.split(/\s+/).filter(Boolean);
                        if (tokens.length > 1 && tokens.every(t => text.toLowerCase().includes(t))) { matched = true; break; }
                    }
                }
                
                if (matched) {
                    const entry = _messageView(ctx, m, i);
                    if (includeContent) Object.assign(entry, _preview(text, 500));
                    results.push(entry);
                    if (results.length >= maxResults) break;
                }
            }
            return { found: results.length, results, note: `Use 'index' values in chat-changes proposals. ${PREVIEW_NOTE_MESSAGES} Total messages searched: ${Math.min(msgs.length - 1, toIdx) - Math.max(0, fromIdx) + 1}` };
        }
        case 'search_lorebook_entry': {
            const activeBooks = getActiveLorebookNames();
            let rawQueries = Array.isArray(toolInput.queries) ? toolInput.queries : (Array.isArray(toolInput.query) ? toolInput.query : [toolInput.query || '']);
            const parsedQueries = rawQueries.map(q => {
                const s = String(q);
                const regexMatch = s.match(/^\/(.+)\/([gimsuy]*)$/);
                if (regexMatch) {
                    try { return { type: 'regex', re: new RegExp(regexMatch[1], regexMatch[2]) }; } catch(_) {}
                }
                return { type: 'text', lq: s.toLowerCase() };
            });
            
            const targetBook = toolInput.book_name;
            const searchIn = toolInput.search_in || 'all';
            const onlyConstant = !!toolInput.only_constant;
            const onlyOutlet = !!toolInput.only_outlet;
            const results = [];
            for (const bookName of activeBooks) {
                if (targetBook && !bookName.toLowerCase().includes(targetBook.toLowerCase())) continue;
                const data = await fetchWorldInfoBook(bookName).catch(() => null);
                if (!data) continue;
                for (const entry of wiEntriesToArray(data)) {
                    const outletField = getEntryOutletName(entry);
                    const isEntryOutlet = outletField !== '';
                    if (onlyConstant && !entry.constant) continue;
                    if (onlyOutlet && !isEntryOutlet) continue;
                    
                    const name = (entry.comment || '');
                    const keys = (entry.key || []).join(' ');
                    const text = (entry.content || '');
                    
                    let matched = false;
                    for (const pq of parsedQueries) {
                        if (pq.type === 'regex' && pq.re) {
                            pq.re.lastIndex = 0;
                            if (searchIn === 'all') {
                                matched = pq.re.test(name) || pq.re.test(keys) || pq.re.test(text);
                            } else if (searchIn === 'name') {
                                matched = pq.re.test(name);
                            } else if (searchIn === 'keys') {
                                matched = pq.re.test(keys);
                            } else if (searchIn === 'content') {
                                matched = pq.re.test(text);
                            }
                        } else {
                            const lq = pq.lq;
                            const lname = name.toLowerCase();
                            const lkeys = keys.toLowerCase();
                            const ltext = text.toLowerCase();
                            if (searchIn === 'all') {
                                matched = lname.includes(lq) || lkeys.includes(lq) || ltext.includes(lq);
                            } else if (searchIn === 'name') {
                                matched = lname.includes(lq);
                            } else if (searchIn === 'keys') {
                                matched = lkeys.includes(lq);
                            } else if (searchIn === 'content') {
                                matched = ltext.includes(lq);
                            }
                        }
                        if (matched) break;
                    }
                    
                    if (matched) results.push({
                        book: getDisplayName(bookName),
                        uid: entry.uid,
                        name: entry.comment || `Entry #${entry.uid}`,
                        keys: entry.key || [],
                        content_preview: (entry.content || '').slice(0, 200) + ((entry.content || '').length > 200 ? '...' : ''),
                        is_constant: !!entry.constant,
                        is_outlet: isEntryOutlet,
                        outlet_name: outletField || null,
                        disabled: !!entry.disable,
                    });
                    if (results.length >= 20) break;
                }
                if (results.length >= 20) break;
            }
            return { found: results.length, results, note: PREVIEW_NOTE_LOREBOOK };
        }
        case 'get_lorebook_entry': {
            // Full entries by book + uid, with the settings that decide when and where they fire.
            const activeBooks = getActiveLorebookNames();
            const wanted = toolInput.book_name || '';
            const book = activeBooks.find(n => n === wanted || getDisplayName(n) === wanted)
                || activeBooks.find(n => getDisplayName(n).toLowerCase() === wanted.toLowerCase());
            if (!book) return { error: `No active lorebook named "${wanted}".`, active_lorebooks: activeBooks.map(getDisplayName) };
            const data = await fetchWorldInfoBook(book).catch(() => null);
            if (!data) return { error: `Could not load lorebook "${getDisplayName(book)}".` };
            const uids = (Array.isArray(toolInput.uids) ? toolInput.uids : [toolInput.uid]).map(Number).filter(Number.isFinite);
            const entries = wiEntriesToArray(data);
            const found = uids.map(uid => entries.find(e => Number(e.uid) === uid)).filter(Boolean);
            const missing = uids.filter(uid => !found.some(e => Number(e.uid) === uid));
            return {
                book: getDisplayName(book),
                entries: found.map(e => ({
                    uid: e.uid,
                    name: e.comment || `Entry #${e.uid}`,
                    content: e.content || '',
                    keys: e.key || [],
                    secondary_keys: e.keysecondary || [],
                    constant: !!e.constant,
                    disabled: !!e.disable,
                    position: WI_POSITION_NAMES[Number(e.position)] ?? String(e.position),
                    depth: e.depth ?? null,
                    order: e.order ?? null,
                    probability: e.useProbability === false ? 100 : (e.probability ?? 100),
                    outlet_name: getEntryOutletName(e) || null,
                })),
                ...(missing.length ? { not_found_uids: missing } : {}),
            };
        }
        case 'get_lorebooks': {
            const activeBooks = getActiveLorebookNames();
            const includeEntries = !!toolInput.include_entries;
            const specificBook = toolInput.book_name;
            if (!includeEntries) {
                return {
                    lorebooks: activeBooks.map(name => ({ name: getDisplayName(name), internal_name: name })),
                    total: activeBooks.length,
                };
            }
            const booksToProcess = specificBook
                ? activeBooks.filter(n => n === specificBook || getDisplayName(n) === specificBook)
                : activeBooks;
            const result = {};
            for (const name of booksToProcess) {
                const data = await fetchWorldInfoBook(name).catch(() => null);
                if (!data) { result[getDisplayName(name)] = []; continue; }
                result[getDisplayName(name)] = wiEntriesToArray(data).map(e => {
                    const outletField = getEntryOutletName(e);
                    return {
                        name: e.comment || `#${e.uid}`,
                        uid: e.uid,
                        is_constant: !!e.constant,
                        is_outlet: outletField !== '',
                        outlet_name: outletField || null,
                        disabled: !!e.disable,
                    };
                });
            }
            return { lorebooks: result };
        }
        case 'ask_user': {
            return { __ask_user: true, question: toolInput.question, context: toolInput.context };
        }
        case 'get_char_info': {
            const charInfoFull = getCharInfo();
            if (!charInfoFull) return { error: 'No active character.' };
            const charCtx = ctx.characters?.[ctx.characterId];
            const requestedFields = toolInput.fields || ['description', 'personality', 'scenario'];
            const result = { name: charInfoFull.name };
            for (const f of requestedFields) {
                if (f === 'tags') result.tags = getTagsForCharacter(charCtx);
                // Label each greeting with the 1-based id that edits use as index="N", so the
                // model never has to count a bare array (which it does 0-based). greeting_ids
                // limits the result, since a card can have dozens.
                else if (f === 'alternate_greetings') {
                    const all = (charCtx?.data?.alternate_greetings || []).map((text, i) => ({ id: i + 1, text }));
                    const ids = Array.isArray(toolInput.greeting_ids) ? toolInput.greeting_ids.map(Number) : null;
                    result.alternate_greetings = ids ? all.filter(g => ids.includes(g.id)) : all;
                    result.alternate_greetings_total = all.length;
                }
                // Return the stored text, macros unexpanded: edits are matched against the stored
                // field, so anchors copied from an expanded copy ("Lexi" for {{char}}) never match.
                else {
                    const raw = charCtx?.data?.[f] ?? charCtx?.[f];
                    result[f] = typeof raw === 'string' ? raw : (charInfoFull[f] || '');
                }
            }
            return result;
        }
        case 'get_prompts': {
            return getPromptsForTool(toolInput?.ids);
        }
        case 'get_chat_stats': {
            const msgs = ctx.chat || [];
            const userMsgs = msgs.filter(m => m.is_user);
            const asMsgs = msgs.filter(m => !m.is_user);
            const totalChars = msgs.reduce((s, m) => s + (m.mes || '').length, 0);
            return {
                total_messages: msgs.length,
                user_messages: userMsgs.length,
                assistant_messages: asMsgs.length,
                approx_tokens: Math.ceil(totalChars / 3.5),
                first_message_index: 0,
                last_message_index: msgs.length - 1,
                char_name: ctx.name2 || 'Character',
                user_name: ctx.name1 || 'User',
            };
        }
        case 'get_recent_messages': {
            const msgs = ctx.chat || [];
            const count = Math.min(toolInput.count ?? 10, 50);
            const fromEnd = toolInput.from_end !== false;
            const role = toolInput.role || 'all';
            let filtered = msgs.map((m, i) => ({ ...m, _idx: i }));
            if (role === 'user') filtered = filtered.filter(m => m.is_user);
            if (role === 'assistant') filtered = filtered.filter(m => !m.is_user);
            if (fromEnd) filtered = filtered.slice(-count);
            else filtered = filtered.slice(0, count);
            return {
                messages: filtered.map(m => ({ ..._messageView(ctx, m, m._idx), ..._preview(m.mes || '', 600) })),
                note: `Use "index" values in chat-changes proposals for precise targeting. ${PREVIEW_NOTE_MESSAGES}`,
            };
        }
        case 'get_generation_settings': {
            // Read-only view of what SillyTavern is sending with right now (live settings, so
            // unsaved changes included). Never includes keys or secrets.
            const pu = ctx.powerUserSettings || {};
            if (ctx.mainApi === 'openai') {
                const s = ctx.chatCompletionSettings || {};
                return {
                    api: 'chat_completion',
                    source: s.chat_completion_source,
                    model: typeof ctx.getChatCompletionModel === 'function' ? ctx.getChatCompletionModel() : null,
                    preset: s.preset_settings_openai,
                    sampling: { temperature: s.temp_openai, top_p: s.top_p_openai, top_k: s.top_k_openai, min_p: s.min_p_openai,
                        frequency_penalty: s.freq_pen_openai, presence_penalty: s.pres_pen_openai, repetition_penalty: s.repetition_penalty_openai, seed: s.seed },
                    context_size: s.openai_max_context,
                    max_response_tokens: s.openai_max_tokens,
                    reasoning_effort: s.reasoning_effort,
                    show_thoughts: s.show_thoughts,
                    streaming: s.stream_openai,
                };
            }
            const s = ctx.textCompletionSettings || {};
            return {
                api: ctx.mainApi === 'textgenerationwebui' ? 'text_completion' : ctx.mainApi,
                backend: s.type,
                preset: s.preset_settings_textgenerationwebui ?? null,
                sampling: { temperature: s.temp, top_p: s.top_p, top_k: s.top_k, min_p: s.min_p, repetition_penalty: s.rep_pen, seed: s.seed },
                context_size: ctx.maxContext,
                context_template: pu.context?.preset ?? null,
                instruct_template: pu.instruct?.enabled ? (pu.instruct?.preset ?? null) : 'disabled',
                streaming: s.streaming,
            };
        }
        case 'get_regex_scripts': {
            const mod = await loadRegexModule();
            if (!mod?.getScriptsByType || !mod?.SCRIPT_TYPES) return { error: 'The Regex extension is not available.' };
            const placementNames = Object.fromEntries(Object.entries(mod.regex_placement || {}).map(([k, v]) => [v, k.toLowerCase()]));
            const scopes = [['global', mod.SCRIPT_TYPES.GLOBAL], ['character', mod.SCRIPT_TYPES.SCOPED], ['preset', mod.SCRIPT_TYPES.PRESET]];
            const scripts = scopes.flatMap(([scope, type]) => (mod.getScriptsByType(type, { allowedOnly: false }) || []).map(r => ({
                scope,
                name: r.scriptName,
                find: r.findRegex,
                replace: r.replaceString,
                trim: r.trimStrings?.length ? r.trimStrings : undefined,
                applies_to: (r.placement || []).map(p => placementNames[p] ?? p),
                disabled: !!r.disabled,
                display_only: !!r.markdownOnly,
                prompt_only: !!r.promptOnly,
                run_on_edit: !!r.runOnEdit,
                depth: (r.minDepth ?? null) !== null || (r.maxDepth ?? null) !== null ? { min: r.minDepth ?? null, max: r.maxDepth ?? null } : undefined,
            })));
            return { count: scripts.length, scripts };
        }
        case 'get_quick_replies': {
            const api = globalThis.quickReplyApi;
            if (!api) return { error: 'The Quick Replies extension is not available.' };
            const active = { global: api.listGlobalSets?.() || [], chat: api.listChatSets?.() || [] };
            if (!toolInput.set_name) return { active_sets: active, all_sets: api.listSets?.() || [], note: 'Pass set_name to read a set\'s replies in full.' };
            const set = api.getSetByName?.(toolInput.set_name);
            if (!set) return { error: `No quick reply set named "${toolInput.set_name}".`, all_sets: api.listSets?.() || [] };
            return {
                set: set.name,
                replies: (set.qrList || []).map(q => ({
                    label: q.label,
                    title: q.title || undefined,
                    message: q.message,
                    hidden: !!q.isHidden,
                    runs_on: ['executeOnStartup', 'executeOnUser', 'executeOnAi', 'executeOnChatChange', 'executeOnGroupMemberDraft', 'executeOnNewChat']
                        .filter(k => q[k]).map(k => k.replace(/^executeOn/, '').replace(/^./, c => c.toLowerCase())),
                    automation_id: q.automationId || undefined,
                })),
            };
        }
        case 'read_messages': {
            // Full text, uncut, for quoting and exact edit anchors. Capped by count, not length.
            const msgs = ctx.chat || [];
            let indices = Array.isArray(toolInput.indices) ? toolInput.indices.map(Number) : [];
            if (!indices.length && Number.isFinite(Number(toolInput.from_index))) {
                const from = Math.max(0, Number(toolInput.from_index));
                const to = Math.min(msgs.length - 1, Number.isFinite(Number(toolInput.to_index)) ? Number(toolInput.to_index) : from);
                for (let i = from; i <= to; i++) indices.push(i);
            }
            indices = [...new Set(indices)].filter(i => Number.isInteger(i) && i >= 0 && i < msgs.length);
            const capped = indices.length > READ_MESSAGES_MAX;
            indices = indices.slice(0, READ_MESSAGES_MAX);
            return {
                messages: indices.map(i => ({ ..._messageView(ctx, msgs[i], i), content: msgs[i].mes || '' })),
                last_index: msgs.length - 1,
                ...(capped ? { note: `Only the first ${READ_MESSAGES_MAX} requested messages were returned; ask again for the rest.` } : {}),
            };
        }
        default: return { error: `Unknown tool: ${toolName}` };
    }
}

export function parseToolCallsFromText(text) {
    const results = [];
    const re = /```tool_call\n?([\s\S]*?)(?:```|$)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
        const rawBlock = m[1].trim();
        if (!rawBlock) continue;

        let extracted = [];

        try {
            const parsed = JSON.parse(rawBlock);
            if (Array.isArray(parsed)) {
                extracted = parsed.filter(p => p && p.name).map(p => ({ name: p.name, input: p.input || {} }));
            } else if (parsed && parsed.name) {
                extracted.push({ name: parsed.name, input: parsed.input || {} });
            }
        } catch (_) {}

        if (!extracted.length) {
            try {
                const fixedRaw = '[' + rawBlock.replace(/}\s*{/g, '},{') + ']';
                const parsed = JSON.parse(fixedRaw);
                if (Array.isArray(parsed)) {
                    extracted = parsed.filter(p => p && p.name).map(p => ({ name: p.name, input: p.input || {} }));
                }
            } catch (_) {}
        }

        if (!extracted.length) {
            const lines = rawBlock.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line.trim());
                    if (parsed && parsed.name) {
                        extracted.push({ name: parsed.name, input: parsed.input || {} });
                    }
                } catch (_) {}
            }
        }

        if (!extracted.length) {
            const nameMatch = rawBlock.match(/"name"\s*:\s*"([^"]+)"/);
            if (nameMatch) {
                extracted.push({ name: nameMatch[1], input: {} });
            } else {
                extracted.push({ name: 'parsing...', input: {} });
            }
        }

        results.push(...extracted);
    }
    return results;
}

// Where a reply that calls tools should end: after its first run of complete tool_call
// blocks (only whitespace between them). Anything the model writes after that was written
// without the results, and the next round writes it again with them. Returns null until a
// block is complete. `settled` is false while the text after the run could still be the
// start of another block, so a stream should keep reading.
export function findToolCallCut(text) {
    const s = String(text || '');
    let i = s.search(/```tool_call/i);
    if (i < 0) return null;
    const block = /```tool_call[\s\S]*?```/iy;
    const space = /\s*/y;
    let end = -1;
    for (;;) {
        block.lastIndex = i;
        if (!block.exec(s)) break;
        end = block.lastIndex;
        space.lastIndex = end;
        space.exec(s);
        i = space.lastIndex;
    }
    if (end < 0) return null;
    const rest = s.slice(i).toLowerCase();
    const opener = '```tool_call';
    const settled = rest.length > 0 && !opener.startsWith(rest.slice(0, opener.length)) && !rest.startsWith(opener);
    return { end, settled };
}

export function cutAfterToolCalls(text) {
    const cut = findToolCallCut(text);
    return cut ? text.slice(0, cut.end) : text;
}

export function stripToolCallsFromText(text) {
    return text.replace(/```tool_call[\s\S]*?```/gi, '').trim();
}

export function buildToolCallsSystemBlock() {
    const tools = getEnabledTools();
    if (!tools.length) return '';
    const s = getSettings();
    
    const formatSchemaProps = (properties) => {
        if (!properties || Object.keys(properties).length === 0) return '{}';
        const lines = [];
        for (const [key, prop] of Object.entries(properties)) {
            lines.push(`"${key}": ${JSON.stringify(prop)}`);
        }
        return `{${lines.join(',\n    ')}}`;
    };

    const toolsList = tools.map(t =>
        `- **${t.name}**: ${t.description} | Params: ${formatSchemaProps(t.schema.properties)}`
    ).join("\n");
    
    let prompt = s.toolsSystemPrompt || DEFAULT_TOOLS_PROMPT;
    if (!prompt.includes('{{tools_list}}')) {
        prompt += '\n\nTools available:\n{{tools_list}}';
    }
    if (!prompt.includes('{{tool_call_format}}')) {
        prompt = prompt.replace('Format requirement:', 'Format requirement:\n{{tool_call_format}}');
    }
    
    const finalPrompt = prompt
        .replace('{{tools_list}}', toolsList)
        .replace('{{tool_call_format}}', TOOL_CALL_FORMAT_BLOCK);
        
    return '\n\n' + _ensureWrapped(finalPrompt, 'tool_calls_system');
}