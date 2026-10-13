import { EXT_DISPLAY, EMBEDDED_BOOK_KEY, DEFAULT_LB_MANAGE_PROMPT, LB_FORMAT_BLOCK } from '../constants.js';
import { getSettings, getCurrentSession, saveSettings, expandMacros } from '../session.js';
import { _dbgAdd } from '../utils/util-debug.js';
import { ST_WorldInfo, ST_Utils, ST_Script } from '../index.js';
import { _repairJSON } from '../utils/util-text.js';
import { t, translate } from '../utils/util-i18n.js';

export const wiCache = {};
export const wiPromises = {}; 
export let lastActiveEntries = [];

let _wiExternalListenerBound = false;
export function setupExternalWIChangeListener() {
    if (_wiExternalListenerBound) return;
    _wiExternalListenerBound = true;
    const ctx = SillyTavern.getContext();
    const es = ctx.eventSource || window.eventSource;
    const et = ctx.event_types || window.event_types || {};
    if (!es) return;
    es.on(et.WORLDINFO_UPDATED || 'worldinfo_updated', (name) => {
        if (name) delete wiCache[name];
    });
    es.on(et.WORLDINFO_SETTINGS_UPDATED || 'worldinfo_settings_updated', () => {
        for (const key of Object.keys(wiCache)) delete wiCache[key];
    });

    // What ST itself put in the roleplay prompt. ST reports the entries after the World Info scan
    // of a real generation (WORLD_INFO_ACTIVATED, not emitted when none activate), so the result is
    // kept once that generation's request data is built. Dry runs and quiet generations that leave
    // World Info out (skipWIAN) do not count.
    es.on(et.GENERATION_STARTED, (_type, opts, dryRun) => {
        stLore.pending = dryRun || opts?.skipWIAN ? null : new Set();
    });
    es.on(et.WORLD_INFO_ACTIVATED, (entries) => {
        if (stLore.pending) stLore.pending = new Set((entries || []).map(e => loreKey(e.world, e.uid)));
    });
    es.on(et.GENERATE_AFTER_DATA, (_data, dryRun) => {
        if (dryRun || !stLore.pending) return;
        stLore.lastGeneration = { chatId: currentChatId(), keys: stLore.pending };
        stLore.pending = null;
        stLore.forcedPending = false;
    });
    // Entries forced on (e.g. by STscript) wait in ST for its next scan, and a dry run of the scan
    // would use them up, so Copilot does not scan until a real generation has taken them.
    es.on(et.WORLDINFO_FORCE_ACTIVATE, () => { stLore.forcedPending = true; });
}

// ─── ST World Info activation ───────────────────────────────────────────────
const stLore = { pending: null, lastGeneration: null, forcedPending: false, scans: new Map() };

const loreKey = (book, uid) => `${book}.${uid}`;

function currentChatId() {
    try { return String(SillyTavern.getContext().getCurrentChatId?.() || ''); } catch (_) { return ''; }
}

// Runs ST's own World Info scan as a dry run over `lines` (newest first, as ST passes chat) and
// returns the activated entries as 'book.uid' keys, or null when the scan is unavailable.
// Same rules as the roleplay prompt: secondary-key logic, case and whole-word settings, scan
// depth, recursion, inclusion groups, probability, budget. A dry run saves no timed effects,
// but it rewrites the Author's Note prompt with its World Info, so that is put back after.
async function runSTWorldInfoScan(lines, globalScanData = {}) {
    const check = ST_WorldInfo?.checkWorldInfo;
    if (typeof check !== 'function' || stLore.forcedPending) return null;
    const ctx = SillyTavern.getContext();
    const AN_KEY = '2_floating_prompt';
    const savedAN = ctx.extensionPrompts?.[AN_KEY];
    // The budget is a share of the prompt size ST generates with (context minus response length).
    const maxContext = typeof ST_Script?.getMaxContextSize === 'function' ? ST_Script.getMaxContextSize() : ctx.maxContext;
    try {
        const res = await check(lines, maxContext, true, { trigger: 'normal', ...globalScanData });
        return new Set([...(res?.allActivatedEntries?.values() || [])].map(e => loreKey(e.world, e.uid)));
    } catch (e) {
        _dbgAdd('LB_ST_SCAN_FAILED', { error: e.message });
        return null;
    } finally {
        if (savedAN && ctx.extensionPrompts) ctx.extensionPrompts[AN_KEY] = savedAN;
    }
}

// One scan per distinct input: the token counter rebuilds the context on every pause in typing.
function cachedScan(stamp, run) {
    if (!stLore.scans.has(stamp)) {
        if (stLore.scans.size > 8) stLore.scans.clear();
        stLore.scans.set(stamp, run());
    }
    return stLore.scans.get(stamp);
}

// The ST chat as ST's own scan reads it: hidden messages left out, "Name: text" when
// World Info includes names.
function stChatScanLines(chat) {
    const withNames = ST_WorldInfo?.world_info_include_names ?? true;
    return chat.filter(m => !m.is_system).map(m => withNames ? `${m.name}: ${m.mes}` : m.mes).reverse();
}

// Entries ST has in the roleplay prompt for the current chat: from its last generation, or,
// before one in this chat, from a dry run of its scan. { keys, source: 'generation'|'scan' } or null.
async function getSTActiveLore() {
    const chatId = currentChatId();
    if (stLore.lastGeneration?.chatId === chatId) return { keys: stLore.lastGeneration.keys, source: 'generation' };
    const ctx = SillyTavern.getContext();
    const chat = ctx.chat || [];
    const stamp = `st\x00${chatId}\x00${chat.length}\x00${chat.at(-1)?.mes ?? ''}`;
    const keys = await cachedScan(stamp, () => {
        let card = {};
        try { card = ctx.getCharacterCardFields?.() || {}; } catch (_) {}
        return runSTWorldInfoScan(stChatScanLines(chat), {
            personaDescription: card.persona, characterDescription: card.description,
            characterPersonality: card.personality, characterDepthPrompt: card.charDepthPrompt,
            scenario: card.scenario, creatorNotes: card.creatorNotes,
        });
    });
    return keys ? { keys, source: 'scan' } : null;
}

// Entries the Copilot side of things activates by ST's rules: the ST messages picked for
// Copilot plus the user's own messages among the latest Copilot messages, scanned as one newest
// message. Copilot's replies are left out: they repeat lore it already has, and under ST's
// budget their extra matches crowd out the entries the user asked about. The chat is padded
// to its real length so entry delays count the same as in ST.
async function getConversationLore(settings) {
    const ctx = SillyTavern.getContext();
    const msgs = ctx.chat || [];
    let text = '';
    let stamp = '';
    try {
        const session = getCurrentSession();
        const picked = (session.pickedChatIndices || []).filter(i => i >= 0 && i < msgs.length);
        const copilotMsgs = session.messages
            .filter(m => !m.isLBHistory)
            .slice(-(settings.lorebookCopilotScanDepth ?? 6))
            .filter(m => m.role === 'user');
        text = [...picked.map(i => msgs[i].mes), ...copilotMsgs.map(m => m.content)].filter(Boolean).join('\n');
        stamp = `cp\x00${session.id}\x00${picked.join(',')}\x00${copilotMsgs.length}\x00${copilotMsgs.at(-1)?.content ?? ''}`;
    } catch (_) {}
    if (!text) return new Set();
    const lines = [text, ...Array(Math.max(0, msgs.length - 1)).fill('')];
    return (await cachedScan(stamp, () => runSTWorldInfoScan(lines))) || new Set();
}

const INCLUSION_LABELS = {
    forced: 'forced on in Copilot',
    st: 'active in SillyTavern',
    constant: 'constant',
    conversation: 'matched in this Copilot chat',
    book: 'whole book included in Copilot',
};

// Why an entry goes into Copilot's lorebook context, or '' when it does not. A user override
// wins, then what SillyTavern itself activated, constants, what the Copilot conversation
// activates, and books picked whole for Copilot.
export function loreInclusionReason(entry, { override, inST, inConversation, bookSelected }) {
    if (override === false) return '';
    if (override === true) return 'forced';
    if (inST) return 'st';
    if (entry.constant && !entry.disable) return 'constant';
    if (inConversation) return 'conversation';
    if (bookSelected) return 'book';
    return '';
}

export async function fetchWorldInfoBook(name) {
    if (name === EMBEDDED_BOOK_KEY) return getEmbeddedCharBook();
    
    if (wiCache[name] && Date.now() - (wiCache[name]._ts || 0) < 30000) return wiCache[name];
    if (wiPromises[name]) return wiPromises[name];

    const ctx = SillyTavern.getContext();
    
    wiPromises[name] = (async () => {
        try {
            let data = null;
            if (typeof ctx.loadWorldInfo === 'function') {
                data = await ctx.loadWorldInfo(name);
            } else {
                const res = await fetch('/api/worldinfo/get', {
                    method: 'POST',
                    headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name }),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                data = await res.json();
            }
            if (!data) return null;
            data._ts = Date.now();
            wiCache[name] = data;
            return data;
        } catch (e) {
            _dbgAdd('LB_LOAD_FILE_FAILED', { bookName: name, error: e.message });
            console.error(`[${EXT_DISPLAY}] WI load failed for "${name}":`, e);
            return null;
        } finally {
            delete wiPromises[name];
        }
    })();

    return wiPromises[name];
}

export function getEmbeddedCharBook() {
    const ctx = SillyTavern.getContext();
    const char = ctx.characters?.[ctx.characterId];
    const book = char?.data?.character_book;
    if (!book?.entries?.length) return null;
    
    const data = { entries: {}, _embedded: true, _ts: Date.now() };

    (book.entries || []).forEach((e, idx) => {
        const uid = e.id ?? idx;
        const keys = Array.isArray(e.keys) ? e.keys : (e.key || []);
        const outlet = e.automation_id || e.automationId || e.extensions?.outlet_name || e.outletName || e.outlet_name || e.outlet || '';
        const isOutlet = Boolean(outlet); 
        const isForceConstant = e.selective === false; 

        data.entries[uid] = {
            uid,
            key: keys,
            keysecondary: [],
            content: e.content || '',
            comment: e.name || '',
            disable: false,
            selective: true,
            constant: !isOutlet && (e.constant === true || isForceConstant),
            position: isOutlet ? 7 : (e.position ?? 0),
            displayIndex: uid,
            automation_id: outlet,
            outletName: outlet,
            outlet: e.outlet || e.outlet_name || e.outletName || '',
            group: e.group || (isOutlet ? outlet : ''),
            role: null,
            extensions: { outlet_name: outlet },
            order: e.order ?? 100,
            probability: e.probability ?? 100,
            groupWeight: e.groupWeight ?? 100,
            depth: 4,
            useProbability: true,
            addMemo: true,
            groupOverride: false,
            sticky: 0,
            cooldown: 0,
            delay: 0,
            excludeRecursion: false,
            preventRecursion: false,
            delayUntilRecursion: false,
            ignoreBudget: false,
            vectorized: false,
            scanDepth: null,
            caseSensitive: null,
            matchWholeWords: null,
            useGroupScoring: null,
            matchPersonaDescription: false,
            matchCharacterDescription: false,
            matchCharacterPersonality: false,
            matchCharacterDepthPrompt: false,
            matchScenario: false,
            matchCreatorNotes: false
        };
    });

    return data;
}

export async function saveWorldInfoBook(name, data) {
    if (data._embedded) { toastr.warning(translate('Cannot save embedded character books directly.'), EXT_DISPLAY); return; }
    const ctx = SillyTavern.getContext();
    const payload = { ...data };
    delete payload._ts;
    try {
        if (typeof ctx.saveWorldInfo === 'function') {
            await ctx.saveWorldInfo(name, payload);
        } else {
            const res = await fetch('/api/worldinfo/edit', {
                method: 'POST',
                headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, data: payload }),
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => res.statusText);
                throw new Error(`HTTP ${res.status}: ${errText}`);
            }
        }
    } catch (e) {
        _dbgAdd('LB_SAVE_FILE_FAILED', { bookName: name, error: e.message });
        console.error(`[${EXT_DISPLAY}] saveWorldInfoBook failed for "${name}":`, e);
        throw e;
    }
    delete wiCache[name];
    
    try {
        if (typeof ctx.reloadWorldInfoEditor === 'function') {
            ctx.reloadWorldInfoEditor(name, true);
        }
    } catch (_) {}
}

export function getDisplayName(name) {
    if (name === EMBEDDED_BOOK_KEY) {
        const ctx = SillyTavern.getContext();
        const char = ctx.characters?.[ctx.characterId];
        return `[${char?.name || 'Character'} Book]`;
    }
    return name;
}

export function getActiveLorebookNames() {
    const ctx = SillyTavern.getContext();
    const names = new Set();

    const globalBooks = ST_WorldInfo?.selected_world_info || window.selected_world_info ||[];
    if (Array.isArray(globalBooks)) {
        globalBooks.forEach(n => n && names.add(n));
    }

    const charId = ctx.characterId;
    const character = ctx.characters?.[charId];
    if (character) {
        const baseWorldName = character.data?.extensions?.world || character.world;
        if (baseWorldName && typeof baseWorldName === 'string') names.add(baseWorldName);

        let fileName = character.avatar;
        if (ST_Utils && typeof ST_Utils.getCharaFilename === 'function') {
            fileName = ST_Utils.getCharaFilename(charId);
        }
        const charLoreList = ST_WorldInfo?.world_info?.charLore || window.world_info?.charLore;
        if (fileName && Array.isArray(charLoreList)) {
            const extraCharLore = charLoreList.find(e => e.name === fileName);
            if (extraCharLore && Array.isArray(extraCharLore.extraBooks)) {
                extraCharLore.extraBooks.forEach(book => book && names.add(book));
            }
        }
    }

    const wiKey = ST_WorldInfo?.METADATA_KEY || window.WI_METADATA_KEY || 'world_info';
    const chatWorldName = ctx.chatMetadata?.[wiKey];
    if (chatWorldName && typeof chatWorldName === 'string') names.add(chatWorldName);

    const personaWorldName = ctx.powerUserSettings?.persona_description_lorebook;
    if (personaWorldName && typeof personaWorldName === 'string') names.add(personaWorldName);

    return [...names].filter(Boolean);
}

export function getBookSourceType(name) {
    if (name === EMBEDDED_BOOK_KEY) return 'embedded';
    const ctx = SillyTavern.getContext();
    
    const globalBooks = ST_WorldInfo?.selected_world_info || window.selected_world_info || [];
    if (Array.isArray(globalBooks) && globalBooks.includes(name)) {
        return 'global';
    }

    const charId = ctx.characterId;
    const character = ctx.characters?.[charId];
    if (character) {
        const baseWorldName = character.data?.extensions?.world || character.world;
        if (baseWorldName === name) return 'character';

        let fileName = character.avatar;
        if (ST_Utils && typeof ST_Utils.getCharaFilename === 'function') {
            fileName = ST_Utils.getCharaFilename(charId);
        }
        const charLoreList = ST_WorldInfo?.world_info?.charLore || window.world_info?.charLore;
        if (fileName && Array.isArray(charLoreList)) {
            const extraCharLore = charLoreList.find(e => e.name === fileName);
            if (extraCharLore?.extraBooks?.includes(name)) return 'character';
        }
    }

    const wiKey = ST_WorldInfo?.METADATA_KEY || window.WI_METADATA_KEY || 'world_info';
    if (ctx.chatMetadata?.[wiKey] === name) return 'chat';
    
    if (ctx.powerUserSettings?.persona_description_lorebook === name) return 'chat';

    return 'manual';
}

export function wiEntriesToArray(data) {
    if (!data?.entries) return [];
    return Object.values(data.entries).sort((a, b) => (a.displayIndex ?? a.uid) - (b.displayIndex ?? b.uid));
}

export function getEntryOverrideKey(bookName, entry) {
    let entryName = String(entry.comment || entry.name || '').trim();
    if (!entryName && entry.key && entry.key.length) {
        entryName = entry.key.join('_').slice(0, 40);
    }
    entryName = String(entryName).replace(/[\r\n]+/g, ' ').trim();
    return entryName ? `${bookName}_${entryName}` : `${bookName}_${entry.uid}`;
}

// Outlet name of a lorebook entry, or '' when it is not an outlet entry. ST marks outlets with
// position 7 (world_info_position.outlet); an explicit outlet field also counts. The tools used
// to test position 5, which is "top of example messages", so they mislabelled those entries.
export function getEntryOutletName(entry) {
    const outletField = (entry.outlet || entry.outlet_name || entry.outletName || entry.automation_id || entry.automationId || '').trim();
    const isOutletPos = String(entry.position).toLowerCase() === 'outlet' || String(entry.position) === '7';
    return outletField || (isOutletPos ? ((entry.group || '').trim() || '(unnamed)') : '');
}

export async function buildLorebookContextBlock(settings) {
    const selectedBooks = settings.lorebookSelectedBooks || [];
    const excludedBooks = new Set(settings.lorebookExcludedBooks || []);
    const overrides = settings.lorebookEntryOverrides || {};
    const loadedBooks = {};
    const _activeNamesSet = new Set(getActiveLorebookNames());

    if (!_activeNamesSet.size) { lastActiveEntries = []; return ''; }

    await Promise.all([..._activeNamesSet].map(async name => {
        if (excludedBooks.has(name)) return;
        const data = await fetchWorldInfoBook(name);
        if (data) loadedBooks[name] = data;
    }));

    if (!Object.keys(loadedBooks).length) { lastActiveEntries = []; return ''; }

    // Keyword activation is ST's: what it put in the roleplay prompt, plus what the Copilot
    // conversation activates under the same rules.
    let stActive = null;
    let conversationActive = new Set();
    if (settings.lorebookAutoKeyword) {
        [stActive, conversationActive] = await Promise.all([getSTActiveLore(), getConversationLore(settings)]);
    }

    const toInject = {};
    const outletLines = [];
    const active = [];
    let overridesChanged = false;

    for (const [bookName, data] of Object.entries(loadedBooks)) {
        for (const entry of wiEntriesToArray(data)) {
            if (!entry.content) continue;

            const oldKey = `${bookName}_${entry.uid}`;
            const newKey = getEntryOverrideKey(bookName, entry);

            if (oldKey !== newKey && overrides[oldKey] !== undefined) {
                overrides[newKey] = overrides[oldKey];
                delete overrides[oldKey];
                overridesChanged = true;
            }

            const reason = loreInclusionReason(entry, {
                override: overrides[newKey],
                inST: !!stActive?.keys.has(loreKey(bookName, entry.uid)),
                inConversation: conversationActive.has(loreKey(bookName, entry.uid)),
                bookSelected: selectedBooks.includes(bookName),
            });
            if (!reason) continue;

            const finalOutletName = getEntryOutletName(entry);
            if (finalOutletName) {
                if (!entry.disable) {
                    outletLines.push(`### ${entry.comment || `Entry #${entry.uid}`} (uid: ${entry.uid}, book: "${getDisplayName(bookName)}") [outlet name: ${finalOutletName}] [${INCLUSION_LABELS[reason]}]\n${entry.content}`);
                    active.push({ bookName, displayName: getDisplayName(bookName), entryName: entry.comment || `#${entry.uid}`, uid: entry.uid, reason });
                }
                continue;
            }

            if (!toInject[bookName]) toInject[bookName] = [];
            toInject[bookName].push({ entry, reason });
        }
    }

    if (overridesChanged) saveSettings();

    let block = '\n\n<lorebook_context>\n';
    if (stActive) {
        block += stActive.source === 'generation'
            ? 'Each entry says why it is here. "active in SillyTavern" entries were in the roleplay prompt of SillyTavern\'s last reply; the others were not.\n\n'
            : 'Each entry says why it is here. "active in SillyTavern" entries are the ones SillyTavern\'s World Info scan activates for its next reply; the others are not in the roleplay prompt.\n\n';
    }
    let hasEntries = false;
    for (const [bookName, entries] of Object.entries(toInject)) {
        let bookBlock = `## ${getDisplayName(bookName)}\n`;

        for (const { entry: e, reason } of entries) {
            hasEntries = true;
            bookBlock += `### ${e.comment || `Entry #${e.uid}`} (uid: ${e.uid})`;
            if (e.key?.length) bookBlock += ` [keys: ${e.key.slice(0, 5).join(', ')}]`;
            bookBlock += ` [${INCLUSION_LABELS[reason]}]`;
            bookBlock += `\n${e.content}\n\n`;

            active.push({ bookName, displayName: getDisplayName(bookName), entryName: e.comment || `#${e.uid}`, uid: e.uid, reason });
        }
        block += bookBlock;
    }

    if (outletLines.length) {
        hasEntries = true;
        block += `## Outlet Entries (injected only where an outlet::<name> macro is manually placed elsewhere, not directly)\n${outletLines.join('\n\n')}\n\n`;
    }

    lastActiveEntries = active;
    if (!hasEntries) return '';

    block += '</lorebook_context>';
    return block;
}

export function buildLBAIInstructions(settings) {
    if (!settings.lorebookAIManageEnabled) return '';
    const excludedBooks = new Set(settings.lorebookExcludedBooks || []);
    const activeBooks =[...new Set(lastActiveEntries.map(e => e.displayName || e.bookName))].filter(b => !excludedBooks.has(b));
    const activeBooksStr = activeBooks.length > 0 ? activeBooks.map(b => `"${b}"`).join(', ') : 'None';
    
    let rawPrompt = settings.lorebookManagePrompt || DEFAULT_LB_MANAGE_PROMPT;
    
    if (!rawPrompt.includes('{{active_lorebooks}}')) {
        if (rawPrompt.includes('Format requirment:')) {
            rawPrompt = rawPrompt.replace('Format requirment:', `Active lorebooks: {{active_lorebooks}}\n\nFormat requirment:`);
        } else {
            rawPrompt = `Active lorebooks: {{active_lorebooks}}\n\n` + rawPrompt;
        }
    }

    const prompt = rawPrompt
        .replace('{{active_lorebooks}}', activeBooksStr)
        .replace('{{lorebook_output}}', LB_FORMAT_BLOCK);
        
    return `<lorebook_management>\n${prompt}\n</lorebook_management>`;
}

export function _parseLBDiffPatch(str) {
    const m = str.match(/<<<<<<< (?:SEARCH|ANCHOR)\r?\n([\s\S]*?)\r?\n=+\r?\n([\s\S]*?)\r?\n>>>>>>> REPLACE/);
    return m ? { search: m[1], replace: m[2] } : null;
}

export function _sanitizeLBChanges(changes) {
    if (!Array.isArray(changes)) return null;
    const valid = [];
    for (const c of changes) {
        if (!c || typeof c !== 'object') continue;
        if (!['add', 'edit', 'patch', 'prepend', 'append', 'delete'].includes(c.action)) continue;
        if (!c.worldName && !c.name && c.uid == null) continue;
        if (c.triggers === 'original' || c.triggers === 'keep' || c.triggers === undefined || c.triggers === null) {
            c.triggers = null;
        } else if (!Array.isArray(c.triggers)) {
            c.triggers = String(c.triggers).split(',').map(s => s.trim()).filter(Boolean);
        }
        if (c.constant !== undefined) c.constant = !!c.constant;
        if (c.action === 'patch' && Array.isArray(c.patches)) {
            c.patches = c.patches.map(p => {
                if (typeof p === 'string') return _parseLBDiffPatch(p);
                if (p && typeof p === 'object') {
                    p.search = p.search || p.anchor;
                    if (p.search !== undefined) return p;
                }
                return null;
            }).filter(Boolean);
        }
        valid.push(c);
    }
    return valid.length ? valid : null;
}

export function parseLBChangesFromText(text) {
    let raw = null;
    const strict = text.match(/```lorebook-changes\s*([\s\S]*?)```/);
    if (strict) {
        raw = strict[1].trim();
    } else {
        const open = text.match(/```lorebook-changes\s*([\s\S]*?)(?=```|$)/);
        if (open) raw = open[1].trim();
    }
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (Array.isArray(data.changes)) return _sanitizeLBChanges(data.changes);
    } catch (_) {}
    try {
        const repaired = _repairJSON(raw);
        const data = JSON.parse(repaired);
        if (Array.isArray(data.changes)) return _sanitizeLBChanges(data.changes);
    } catch (_) {}
    try {
        const lines = raw.split('\n');
        const fixed = lines.map(line => {
            return line.replace(/("(?:content|name|comment|search|replace|triggers)":\s*)"((?:[^"\\]|\\.)*)"/, (match, prefix, val) => {
                const escaped = val.replace(/(?<!\\)"/g, '\\"');
                return `${prefix}"${escaped}"`;
            });
        }).join('\n');
        const data = JSON.parse(fixed);
        if (Array.isArray(data.changes)) return _sanitizeLBChanges(data.changes);
    } catch (_) {}

    if (raw) _dbgAdd('LB_PROPOSAL_PARSING_FAILED', { rawText: raw.slice(0, 300) + (raw.length > 300 ? '...' : '') });
    return null;
}

export function stripLBChangesBlock(text) {
    return text
        .replace(/```lorebook-changes[\s\S]*?```/g, '')
        .replace(/```lorebook-changes[\s\S]*/g, '')
        .trim();
}

export async function bindNewLorebookToCharacter(bookName) {
    try {
        const ctx = SillyTavern.getContext();

        const allBooks = window.world_names || ST_WorldInfo?.world_names || [];
        const isNew = !allBooks.includes(bookName);

        if (isNew) {
            console.log('[ST-Copilot-Debug] Lorebook is new. Requesting ST to create...');
            if (typeof ST_WorldInfo?.createNewWorldInfo === 'function') {
                await ST_WorldInfo.createNewWorldInfo(bookName);
            } else if (typeof window.createNewWorldInfo === 'function') {
                await window.createNewWorldInfo(bookName);
            } else {
                const payload = { entries: {}, extensions: {} };
                await fetch('/api/worldinfo/edit', {
                    method: 'POST',
                    headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: bookName, data: payload }),
                });
                if (typeof ctx.updateWorldInfoList === 'function') await ctx.updateWorldInfoList();
                else if (typeof window.loadWorldInfoList === 'function') await window.loadWorldInfoList();
            }
            toastr.success(t`Lorebook "${bookName}" created successfully.`, EXT_DISPLAY);
        }

        delete wiCache[bookName];

        const charId = ctx.characterId;
        if (charId === undefined || charId === null) return;

        let fileName = ctx.characters?.[charId]?.avatar;
        if (ST_Utils && typeof ST_Utils.getCharaFilename === 'function') {
            fileName = ST_Utils.getCharaFilename(charId);
        } else if (typeof window.getCharaFilename === 'function') {
            fileName = window.getCharaFilename(charId);
        }
        if (!fileName) return;

        let wiSettings = window.world_info || ST_WorldInfo?.world_info;
        if (!wiSettings) return;

        if (!Array.isArray(wiSettings.charLore)) wiSettings.charLore = [];

        const charLoreList = wiSettings.charLore;
        let extraCharLore = charLoreList.find(e => e.name === fileName);
        if (!extraCharLore) {
            extraCharLore = { name: fileName, extraBooks: [] };
            charLoreList.push(extraCharLore);
        }
        if (!Array.isArray(extraCharLore.extraBooks)) extraCharLore.extraBooks = [];

        if (!extraCharLore.extraBooks.includes(bookName)) {
            extraCharLore.extraBooks.push(bookName);
            console.log(`[ST-Copilot-Debug] Added "${bookName}" to extraBooks.`);

            if (typeof ST_WorldInfo?.saveWorldInfoSettings === 'function') ST_WorldInfo.saveWorldInfoSettings();
            else if (typeof window.saveWorldInfoSettings === 'function') window.saveWorldInfoSettings();

            if (typeof window.saveSettingsDebounced === 'function') window.saveSettingsDebounced();
            else if (typeof saveSettingsDebounced === 'function') saveSettingsDebounced();

            if (typeof ST_WorldInfo?.printWorldInfoCharacters === 'function') ST_WorldInfo.printWorldInfoCharacters();
            else if (typeof window.printWorldInfoCharacters === 'function') window.printWorldInfoCharacters();
        }
    } catch (e) {
        _dbgAdd('LB_AUTO_BIND_NEW_BOOK_FAILED', { bookName, error: e.message });
        console.error(`[ST-Copilot-Debug] Exception in bindNewLorebookToCharacter:`, e);
    }
}

export async function resolveLBChangeTarget(change, strictBook = false) {
    let bookName = change.worldName || '';
    const targetName = (change.originalName || change.name || '').trim().toLowerCase();
    const hasUid = change.uid !== undefined && change.uid !== null;

    if (bookName === getDisplayName(EMBEDDED_BOOK_KEY)) bookName = EMBEDDED_BOOK_KEY;

    const findEntry = (data) => {
        const entries = Object.values(data?.entries || {});
        // IDs are authoritative and book-local. Never fall back to a name when
        // an explicit ID is missing; name may also be the requested NEW title.
        const matches = hasUid
            ? entries.filter(entry => String(entry.uid) === String(change.uid))
            : entries.filter(entry => targetName && (entry.comment || 'Entry #' + entry.uid).trim().toLowerCase() === targetName);
        return matches.length === 1 ? matches[0] : null;
    };

    if (bookName) {
        const data = await fetchWorldInfoBook(bookName);
        return { bookName, data, origEntry: findEntry(data) };
    }

    // Without a book, only an unambiguous exact name can identify the target.
    // Never reinterpret an ID in a different book or guess using substrings.
    if (strictBook || hasUid || !targetName || change.action === 'add') {
        return { bookName, data: null, origEntry: null };
    }
    const matches = [];
    for (const name of getActiveLorebookNames()) {
        const data = await fetchWorldInfoBook(name);
        for (const entry of Object.values(data?.entries || {})) {
            if ((entry.comment || 'Entry #' + entry.uid).trim().toLowerCase() === targetName) {
                matches.push({ bookName: name, data, origEntry: entry });
            }
        }
    }
    return matches.length === 1 ? matches[0] : { bookName, data: null, origEntry: null };
}

export async function expandOutletsAsync(text, depth = 0) {
    if (!text || typeof text !== 'string' || !text.includes('{{outlet::') || depth > 3) return text;

    const outletRegex = /\{\{outlet::(.*?)\}\}/gi;
    const matches = [...new Set([...text.matchAll(outletRegex)].map(m => m[1]))];
    
    if (!matches.length) return text;

    const activeNames = getActiveLorebookNames();
    
    if (!activeNames.includes(EMBEDDED_BOOK_KEY)) {
        activeNames.push(EMBEDDED_BOOK_KEY);
    }

    const loadedBooks = [];
    for (const name of activeNames) {
        const data = await fetchWorldInfoBook(name);
        if (data) loadedBooks.push(data);
    }

    let result = text;
    for (const name of matches) {
        const searchName = name.trim();
        const matchedEntries = [];

        for (const book of loadedBooks) {
            const entries = Object.values(book.entries || {});
            for (const e of entries) {
                const outletField = (e.outlet || e.outlet_name || e.outletName || e.automation_id || e.automationId || '').trim();
                const isOutletPos = String(e.position) === '7' || String(e.position).toLowerCase() === 'outlet';
                const finalOutletName = outletField || (isOutletPos ? (e.group || '').trim() : '');
                
                if (!e.disable && finalOutletName === searchName) {
                    matchedEntries.push(e);
                }
            }
        }

        const replacementText = matchedEntries.map(e => expandMacros(e.content || '')).join('\n');
        
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\{\\{outlet::${escapedName}\\}\\}`, 'g');
        
        result = result.replace(regex, replacementText);
    }

    if (result.includes('{{outlet::')) {
        result = await expandOutletsAsync(result, depth + 1);
    }

    return result;
}