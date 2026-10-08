import { EXT_DISPLAY, CHAR_EDIT_FORMAT_BLOCK, CHAR_CREATE_FORMAT_BLOCK, DEFAULT_CHAR_EDIT_DIRECTIVE } from '../constants.js';
import { getSettings, saveSettings, getCurrentSession } from '../session.js';
import { _dbgAdd } from '../utils/util-debug.js';
import { escHtml } from '../utils/util-dom.js';
import { _sanitizeProposedTags, applySearchReplaceToField, _repairJSON, _ensureWrapped } from '../utils/util-text.js';
import { getTagsForCharacter, getUserPersona, getAuthorsNote } from '../utils/util-st.js';
import { _getAspectEvolutiaCharFields, _getAspectEvolutiaPersonaFields } from '../integrations/integ-evolutia.js';

export function getEffectiveCharField(settings, k) {
    const ovKey = 'charField_' + k;
    if (settings[ovKey] !== undefined) return settings[ovKey];
    return !!(settings.charEditFields || {})[k];
}

export function isCharacterExcluded(settings, charId) {
    return (settings.charMgrExcluded || []).includes(charId);
}

export function setCharacterExcluded(settings, charId, excluded) {
    if (!Array.isArray(settings.charMgrExcluded)) settings.charMgrExcluded = [];
    const idx = settings.charMgrExcluded.indexOf(charId);
    if (excluded && idx === -1) settings.charMgrExcluded.push(charId);
    else if (!excluded && idx !== -1) settings.charMgrExcluded.splice(idx, 1);
}

export function getCharFieldOverride(settings, charId, field) {
    return (settings.charMgrFieldOverrides || {})[charId]?.[field];
}

export function setCharFieldOverride(settings, charId, field, value) {
    if (!settings.charMgrFieldOverrides) settings.charMgrFieldOverrides = {};
    if (!settings.charMgrFieldOverrides[charId]) settings.charMgrFieldOverrides[charId] = {};
    if (value === undefined) delete settings.charMgrFieldOverrides[charId][field];
    else settings.charMgrFieldOverrides[charId][field] = value;
}

export function getEffectiveCharFieldForChar(settings, charId, field) {
    const ov = getCharFieldOverride(settings, charId, field);
    return ov !== undefined ? ov : getEffectiveCharField(settings, field);
}

export function getActiveCharacterEntities() {
    const ctx = SillyTavern.getContext();
    const entities = [];
    const seen = new Set();
    const pushChar = char => {
        if (char && !seen.has(char.avatar)) {
            seen.add(char.avatar);
            entities.push({ id: char.avatar, name: char.name, avatar: char.avatar, char, isPersona: false });
        }
    };

    if (ctx.groupId) {
        const group = (ctx.groups || []).find(g => g.id === ctx.groupId);
        (group?.members || []).forEach(m => {
            const avatarId = typeof m === 'string' ? m : (m?.avatar || m?.id);
            pushChar((ctx.characters || []).find(c => c.avatar === avatarId));
        });
    } else {
        pushChar(ctx.characters?.[ctx.characterId]);
    }
    return entities;
}
function buildSingleCharacterBlock(settings, entity) {
    const ctx = SillyTavern.getContext();
    const { char, id: charId } = entity;
    const d = char.data || {};
    const parts = [];
    const eff = field => getEffectiveCharFieldForChar(settings, charId, field);

    const charTags = getTagsForCharacter(char);
    if (eff('tags') && charTags.length) parts.push(`<tags>\n${charTags.join(', ')}\n</tags>`);

    const sysPrompt = d.system_prompt || char.system_prompt;
    if (eff('system_prompt') && sysPrompt) parts.push(`<character_system_prompt_override>\n${sysPrompt}\n</character_system_prompt_override>`);

    const postHist = d.post_history_instructions || char.post_history_instructions;
    if (eff('post_history_instructions') && postHist) parts.push(`<post_history_instructions>\n${postHist}\n</post_history_instructions>`);

    const simple = {
        description: d.description || char.description,
        personality: d.personality || char.personality,
        scenario: d.scenario || char.scenario,
        first_mes: d.first_mes || char.first_mes,
        mes_example: d.mes_example || char.mes_example,
    };

    const isMainChar = char.avatar === ctx.characters?.[ctx.characterId]?.avatar;
    if (isMainChar && getSettings().useAspectEvolutia) {
        const aeFields = _getAspectEvolutiaCharFields();
        if (aeFields && aeFields.length) {
            delete simple.description;
            aeFields.forEach(f => parts.push(`<evolutia_char_field name="${escHtml(f.name)}">\n${f.content}\n</evolutia_char_field>`));
        }
    }

    for (const [key, val] of Object.entries(simple)) {
        if (eff(key) && val) parts.push(`<${key}>\n${val}\n</${key}>`);
    }

    if (eff('alternate_greetings') && Array.isArray(d.alternate_greetings) && d.alternate_greetings.length) {
        const agMap = settings.altGreetingIndices || {};
        const indices = Array.isArray(agMap[charId]) ? agMap[charId] : d.alternate_greetings.map((_, i) => i);
        const filtered = indices.filter(i => i >= 0 && i < d.alternate_greetings.length);
        if (filtered.length) {
            const gs = filtered.map(i => `  <greeting id="${i+1}">\n${d.alternate_greetings[i]}\n  </greeting>`).join('\n');
            parts.push(`<alternate_greetings>\n${gs}\n</alternate_greetings>`);
        }
    }

    if (eff('authors_note')) {
        const an = getAuthorsNote();
        if (an) parts.push(`<authors_note>\n${an}\n</authors_note>`);
    }

    if (!parts.length) return '';
    return `<character name="${escHtml(char.name)}">\n${parts.join('\n\n')}\n</character>`;
}

export function buildCharacterContextBlock(settings) {
    const entities = getActiveCharacterEntities();
    if (!entities.length) return '';
    const excluded = new Set(settings.charMgrExcluded || []);
    const blocks = entities
        .filter(ent => !excluded.has(ent.id))
        .map(ent => buildSingleCharacterBlock(settings, ent))
        .filter(Boolean);
    if (!blocks.length) return '';
    return `<characters>\n${blocks.join('\n\n')}\n</characters>`;
}

export function buildCharEditAIInstructions(settings) {
    if (!settings.charEditAIEnabled) return '';
    const baseFields = ['name', 'tags', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'authors_note', 'alternate_greetings', 'system_prompt', 'post_history_instructions'];
    const fieldsList = baseFields.filter(k => k === 'name' || getEffectiveCharField(settings, k));
    
    if (settings.includeUserPersonality && !fieldsList.includes('user_persona')) {
        fieldsList.push('user_persona');
    }
    const enabledFields = fieldsList.join(', ') || 'all fields';
    
    const aeCharFields = settings.useAspectEvolutia ? _getAspectEvolutiaCharFields() : null;
    const aeUserFields = settings.useAspectEvolutia && settings.includeUserPersonality ? _getAspectEvolutiaPersonaFields() : null;
    
    let evolutiaDocs = '';
    if (aeCharFields || aeUserFields) {
        evolutiaDocs = `\n\n<aspect_evolutia_integration>\nDynamic fields are currently managing descriptions. To edit them, target their specific virtual names.\n`;
        if (aeCharFields && aeCharFields.length) {
            evolutiaDocs += `Character Aspect Fields:\n` + aeCharFields.map(f => `- Field: "evolutia_char:${f.name}"`).join('\n') + `\n`;
        }
        if (aeUserFields && aeUserFields.length) {
            evolutiaDocs += `User Aspect Fields:\n` + aeUserFields.map(f => `- Field: "evolutia_user:${f.name}"`).join('\n') + `\n`;
        }
        evolutiaDocs += `Example: <replace field="evolutia_char:FieldName">...</replace>\n</aspect_evolutia_integration>`;
    }
    
    const base = (settings.charEditPrompt || DEFAULT_CHAR_EDIT_DIRECTIVE.trim())
        .replace('{{char_edit_fields}}', enabledFields)
        .replace('{{char_edit_format}}', CHAR_EDIT_FORMAT_BLOCK)
        .replace('{{char_create_format}}', CHAR_CREATE_FORMAT_BLOCK);
        
    return _ensureWrapped(`${base}${evolutiaDocs}`, 'character_management');
}

function _levenshtein(a, b) {
    a = String(a); b = String(b);
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
        }
    }
    return dp[m][n];
}

export function resolveCharacterByName(aiName, entities = null) {
    if (!aiName) return null;
    const ctx = SillyTavern.getContext();
    const list = entities || getActiveCharacterEntities();
    if (!list.length) return null;

    let found = list.find(e => e.char.name === aiName);
    if (found) return found.char;

    const normAi = aiName.toLowerCase().trim();
    found = list.find(e => e.char.name.toLowerCase().trim() === normAi);
    if (found) return found.char;

    found = list.find(e => {
        const n = e.char.name.toLowerCase().trim();
        return n.includes(normAi) || normAi.includes(n);
    });
    if (found) return found.char;

    if (list.length === 1) {
        const userName = (ctx.name1 || '').toLowerCase().trim();
        if (normAi !== userName) return list[0].char;
    }

    let best = null, bestDist = Infinity;
    for (const e of list) {
        const dist = _levenshtein(normAi, e.char.name.toLowerCase().trim());
        if (dist < bestDist) { bestDist = dist; best = e.char; }
    }
    if (best && bestDist <= 2) return best;

    return null;
}

export function groupChangesByCharacter(changes) {
    const ctx = SillyTavern.getContext();
    const entities = getActiveCharacterEntities();
    const groups = new Map();

    for (const change of changes) {
        let resolvedChar = change.char ? resolveCharacterByName(change.char, entities) : null;
        if (!resolvedChar && change.char && entities.length > 1 && change.field !== 'user_persona') {
            // Guessing in a group chat could write one member's text into another member's card.
            _dbgAdd('CHAR_ROUTE_UNRESOLVED', { char: change.char, field: change.field });
            if (typeof toastr !== 'undefined') toastr.warning(`[CharEdit] No group member named "${escHtml(change.char)}"; skipped its "${escHtml(change.field)}" change.`, EXT_DISPLAY, { timeOut: 8000 });
            continue;
        }
        if (!resolvedChar) {
            if (entities.length === 1) resolvedChar = entities[0].char;
            else resolvedChar = ctx.characters?.[ctx.characterId] || entities[0]?.char || null;
        }
        if (!resolvedChar) continue;
        const key = resolvedChar.avatar;
        if (!groups.has(key)) groups.set(key, { char: resolvedChar, changes: [] });
        groups.get(key).changes.push(change);
    }
    return Array.from(groups.values());
}

// Accepts double-quoted, single-quoted and unquoted attribute values.
function _parseTagAttrs(attrStr) {
    const attrs = {};
    const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let m;
    while ((m = re.exec(attrStr || '')) !== null) attrs[m[1]] = m[2] ?? m[3] ?? m[4];
    if (attrs.field) attrs.field = _normalizeFieldName(attrs.field);
    return attrs;
}

// Common names models use for card fields, mapped to the internal field ids.
const FIELD_ALIASES = {
    first_message: 'first_mes', greeting: 'first_mes',
    example_dialogue: 'mes_example', example_dialogues: 'mes_example', mes_examples: 'mes_example', examples: 'mes_example',
    main_prompt: 'system_prompt', system_prompt_override: 'system_prompt',
    post_history: 'post_history_instructions', jailbreak: 'post_history_instructions',
    persona: 'user_persona', persona_description: 'user_persona',
    alternate_greeting: 'alternate_greetings', alt_greetings: 'alternate_greetings',
    author_note: 'authors_note', authors_notes: 'authors_note',
};

function _normalizeFieldName(field) {
    const f = String(field).trim();
    if (/^evolutia_(char|user):/.test(f)) return f;
    const key = f.toLowerCase().replace(/[\s-]+/g, '_');
    return FIELD_ALIASES[key] || key;
}

function _matchTagsWithAttrs(xml, tagName) {
    const re = new RegExp(`<${tagName}(\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}\\s*>`, 'g');
    const out = [];
    let m;
    while ((m = re.exec(xml)) !== null) out.push({ attrs: _parseTagAttrs(m[1]), content: m[2] });
    return out;
}

// Block names the model may use. The prompt asks for the first one; the others are
// tolerated because older prompts (and some models) use them.
const CHAR_CHANGES_BLOCK = '(?:character-changes|character-edits?)(?![\\w-])';
const CHAR_CREATE_BLOCK = '(?:character-creation|character-create)(?![\\w-])';

function _extractFencedBlock(text, namePattern) {
    const strict = text.match(new RegExp('```' + namePattern + '[^\\S\\r\\n]*\\r?\\n?([\\s\\S]*?)```'));
    if (strict) return strict[1];
    const open = text.match(new RegExp('```' + namePattern + '[^\\S\\r\\n]*\\r?\\n?([\\s\\S]*)$'));
    return open ? open[1] : null;
}

const HAS_DIFF_MARKER_RE = /<{5,}[ \t]*(?:SEARCH|ANCHOR)/;

// Parses "<<<<<<< ANCHOR / ======= / >>>>>>> REPLACE" patches. Tolerates the anchor on the
// same line as the marker, extra spaces, and a missing closing marker.
export function parseAnchorPatches(content) {
    const re = /<{5,}[ \t]*(?:SEARCH|ANCHOR)[ \t]*\r?\n?([\s\S]*?)\r?\n?[ \t]*={5,}[ \t]*\r?\n?([\s\S]*?)(?:\r?\n?[ \t]*>{5,}[ \t]*REPLACE[ \t]*|(?=<{5,}[ \t]*(?:SEARCH|ANCHOR))|$)/g;
    const patches = [];
    let m;
    while ((m = re.exec(content)) !== null) {
        if (m[0] === '') { re.lastIndex++; continue; }
        const search = m[1].trim();
        if (!search) continue;
        patches.push({ search, replace: m[2].replace(/^\r?\n/, '').replace(/\r?\n[ \t]*$/, '') });
    }
    return patches;
}

export function parseCharChangesFromText(text) {
    const raw = _extractFencedBlock(text, CHAR_CHANGES_BLOCK);
    if (!raw) return null;
    const xml = _repairCharChangesXML(raw);
    const changes = [];

    const replaceByKey = {};
    for (const { attrs, content } of _matchTagsWithAttrs(xml, 'replace')) {
        const field = attrs.field;
        if (!field) continue;
        const charName = attrs.char || null;
        const index = attrs.index ? parseInt(attrs.index, 10) : undefined;
        const key = `${charName || ''}::${field}${index !== undefined ? `_${index}` : ''}`;

        const patches = parseAnchorPatches(content).map(p => field === 'tags'
            ? { search: _sanitizeProposedTags(p.search), replace: _sanitizeProposedTags(p.replace) }
            : p);
        if (!patches.length && HAS_DIFF_MARKER_RE.test(content)) {
            // A broken patch must never fall through to a full overwrite of the field.
            // (Also the normal state of a patch that is still streaming in.)
            _dbgAdd('CHAR_PATCH_UNPARSEABLE', { field, content: content.slice(0, 300) });
            continue;
        }
        if (!patches.length) {
            let val = content.trim();
            if (field === 'tags') val = _sanitizeProposedTags(val);
            const item = { field, action: 'overwrite', value: val, char: charName };
            if (index !== undefined) item.index = index;
            changes.push(item);
            continue;
        }
        if (!replaceByKey[key]) {
            const item = { field, action: 'replace', patches, char: charName };
            if (index !== undefined) item.index = index;
            replaceByKey[key] = item;
        } else {
            replaceByKey[key].patches.push(...patches);
        }
    }
    for (const item of Object.values(replaceByKey)) changes.push(item);

    for (const { attrs, content } of _matchTagsWithAttrs(xml, 'overwrite')) {
        if (!attrs.field) continue;
        let val = content.trim();
        if (attrs.field === 'tags') val = _sanitizeProposedTags(val);
        const item = { field: attrs.field, action: 'overwrite', value: val, char: attrs.char || null };
        if (attrs.index) item.index = parseInt(attrs.index, 10);
        changes.push(item);
    }

    for (const { attrs, content } of _matchTagsWithAttrs(xml, 'append')) {
        if (!attrs.field) continue;
        let val = content.trim();
        if (attrs.field === 'tags') val = _sanitizeProposedTags(val);
        // <append> adds a new entry for alternate_greetings; for text fields it means append_text.
        const action = attrs.field === 'alternate_greetings' ? 'append' : 'append_text';
        changes.push({ field: attrs.field, action, value: val, char: attrs.char || null });
    }

    for (const { attrs, content } of _matchTagsWithAttrs(xml, 'prepend')) {
        if (!attrs.field) continue;
        let val = content.trim();
        if (attrs.field === 'tags') val = _sanitizeProposedTags(val);
        const item = { field: attrs.field, action: 'prepend', value: val, char: attrs.char || null };
        if (attrs.index) item.index = parseInt(attrs.index, 10);
        changes.push(item);
    }

    for (const { attrs, content } of _matchTagsWithAttrs(xml, 'append_text')) {
        if (!attrs.field) continue;
        let val = content.trim();
        if (attrs.field === 'tags') val = _sanitizeProposedTags(val);
        const item = { field: attrs.field, action: 'append_text', value: val, char: attrs.char || null };
        if (attrs.index) item.index = parseInt(attrs.index, 10);
        changes.push(item);
    }

    return changes.length ? changes : null;
}

export function _repairCharChangesXML(raw) {
    let s = raw;
    const TAGS = ['replace', 'overwrite', 'append_text', 'append', 'prepend'];

    for (const tag of TAGS) {
        const openRe = new RegExp(`<${tag}(\\s[^>]*)?>`, 'g');
        const closeRe = new RegExp(`</${tag}>`, 'g');
        const parts = [];
        let lastIdx = 0;
        let openMatch;
        openRe.lastIndex = 0;
        const opens = [];
        while ((openMatch = openRe.exec(s)) !== null) opens.push(openMatch.index);

        if (opens.length === 0) continue;
        const closes = [];
        let cm;
        closeRe.lastIndex = 0;
        while ((cm = closeRe.exec(s)) !== null) closes.push(cm.index);

        if (opens.length <= closes.length) continue;

        const result = [];
        let cursor = 0;
        for (let i = 0; i < opens.length; i++) {
            const openStart = opens[i];
            const nextOpen = opens[i + 1] ?? Infinity;
            const closeAfterOpen = closes.find(ci => ci > openStart && ci < nextOpen);
            if (closeAfterOpen === undefined) {
                const insertAt = nextOpen === Infinity ? s.length : nextOpen;
                s = s.slice(0, insertAt) + `</${tag}>` + s.slice(insertAt);
                const shift = tag.length + 3;
                for (let j = i + 1; j < opens.length; j++) opens[j] += shift;
                for (let j = 0; j < closes.length; j++) { if (closes[j] >= insertAt) closes[j] += shift; }
                closes.push(insertAt);
                closes.sort((a, b) => a - b);
            }
        }
    }

    return s;
}

export function stripCharChangesBlock(text) {
    return text
        .replace(new RegExp('```' + CHAR_CHANGES_BLOCK + '[\\s\\S]*?```', 'g'), '')
        .replace(new RegExp('```' + CHAR_CHANGES_BLOCK + '[\\s\\S]*', 'g'), '')
        .trim();
}

export function parseCharCreationFromText(text) {
    const raw = _extractFencedBlock(text, CHAR_CREATE_BLOCK)?.trim();
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (typeof data !== 'object' || Array.isArray(data)) return null;
        if (data.tags) {
            data.tags = _sanitizeProposedTags(Array.isArray(data.tags) ? JSON.stringify(data.tags) : String(data.tags));
        }
        return data;
    } catch (_) {}
    try {
        const data = JSON.parse(_repairJSON(raw));
        if (typeof data !== 'object' || Array.isArray(data)) return null;
        if (data.tags) {
            data.tags = _sanitizeProposedTags(Array.isArray(data.tags) ? JSON.stringify(data.tags) : String(data.tags));
        }
        return data;
    } catch (_) { return null; }
}

export function stripCharCreationBlock(text) {
    return text
        .replace(new RegExp('```' + CHAR_CREATE_BLOCK + '[\\s\\S]*?```', 'g'), '')
        .replace(new RegExp('```' + CHAR_CREATE_BLOCK + '[\\s\\S]*', 'g'), '')
        .trim();
}

export function getCharFieldValue(char, fieldId) {
    if (fieldId === 'user_persona') return getUserPersona();
    if (fieldId === 'tags') return getTagsForCharacter(char).join(', ');
    
    if (fieldId.startsWith('evolutia_char:')) {
        const aeName = fieldId.split('evolutia_char:')[1];
        const fields = _getAspectEvolutiaCharFields();
        const f = fields?.find(x => String(x.name).trim().toLowerCase() === String(aeName).trim().toLowerCase());
        return f ? f.content : '';
    }
    if (fieldId.startsWith('evolutia_user:')) {
        const aeName = fieldId.split('evolutia_user:')[1];
        const fields = _getAspectEvolutiaPersonaFields();
        const f = fields?.find(x => String(x.name).trim().toLowerCase() === String(aeName).trim().toLowerCase());
        return f ? f.content : '';
    }
    
    if (fieldId === 'name') return char.name || '';
    const d = char.data || {};
    if (fieldId === 'authors_note') return getAuthorsNote();
    if (fieldId === 'alternate_greetings') return d.alternate_greetings || [];
    if (fieldId === 'system_prompt') return d.system_prompt || char.system_prompt || '';
    if (fieldId === 'post_history_instructions') return d.post_history_instructions || char.post_history_instructions || '';
    return d[fieldId] || char[fieldId] || '';
}

// True when `char` is the character loaded in SillyTavern's character editor. Writing into
// the editor's textareas (and firing input) makes ST autosave the form for that character,
// so doing it for any other character would overwrite the wrong card.
function _isOpenInEditor(ctx, char) {
    if (ctx.menuType === 'create') return false;
    if (typeof document !== 'undefined' && document.getElementById('form_create')?.getAttribute('actiontype') === 'createcharacter') return false;
    const open = ctx.characterId !== undefined && ctx.characterId !== null ? ctx.characters?.[ctx.characterId] : null;
    return !!open && open.avatar === char.avatar;
}

function _emitCharacterEdited(ctx, char) {
    const es = ctx.eventSource || window.eventSource;
    const et = ctx.event_types || window.event_types;
    if (!es || !et?.CHARACTER_EDITED) return;
    const id = (ctx.characters || []).findIndex(c => c.avatar === char.avatar);
    es.emit(et.CHARACTER_EDITED, { detail: { id: id >= 0 ? id : ctx.characterId, character: char } });
}

export async function saveCharacterField(char, fieldId, newValue) {
    const ctx = SillyTavern.getContext();
    
    if (fieldId.startsWith('evolutia_char:')) {
        const aeName = fieldId.split('evolutia_char:')[1];
        const AE_KEY = 'st-description-swap-fields';
        if (!char.data.extensions) char.data.extensions = {};
        const state = char.data.extensions[AE_KEY];
        if (!state) throw new Error('Evolutia state missing');
        const activeId = state.activeAlterEgoId || 'base';
        const alterEgos = Array.isArray(state.alterEgos) ? state.alterEgos : [];
        const activeEgo = alterEgos.find(a => a.id === activeId) || alterEgos[0];
        const fields = Array.isArray(activeEgo?.fields) ? activeEgo.fields : (Array.isArray(state.fields) ? state.fields : []);
        
        const f = fields.find(x => {
            const rawName = String(x.name || '').trim().toLowerCase();
            const rawId = String(x.id || '').trim().toLowerCase();
            const searchTarget = String(aeName).trim().toLowerCase();
            return rawName === searchTarget || rawId === searchTarget;
        });
        if (!f) throw new Error(`Aspect field "${aeName}" not found`);
        
        f.content = newValue;
        
        const payload = {
            name: char.name,
            avatar: char.avatar,
            data: {
                extensions: {
                    [AE_KEY]: state
                }
            }
        };
        
        const res = await fetch('/api/characters/merge-attributes', {
            method: 'POST',
            headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            const errText = await res.text().catch(() => res.statusText);
            throw new Error(`HTTP ${res.status}: ${errText}`);
        }
        
        _emitCharacterEdited(ctx, char);
        return;
    }

    if (fieldId.startsWith('evolutia_user:')) {
        const aeName = fieldId.split('evolutia_user:')[1];
        const pu = window.power_user || ctx.powerUserSettings || {};
        let personaId = window.user_avatar || ctx.user_avatar || ctx.userAvatar || ctx.personaId || ctx.activePersonaId || ctx.active_persona_id;
        if (!personaId && typeof document !== 'undefined') {
            const selected = document.querySelector('#user_avatar_block .avatar-container.selected, #persona_container .avatar-container.selected, .persona_selected');
            if (selected) personaId = selected.getAttribute('data-avatar-id') || selected.dataset?.avatarId;
        }
        if (typeof personaId === 'object' && personaId !== null) personaId = personaId.avatarId || personaId.avatar_id || personaId.user_avatar || personaId.userAvatar || personaId.id;
        
        const AE_KEY = 'st-description-swap-fields';
        const personaState = pu[AE_KEY]?.personaDynamicFields?.[personaId];
        if (!personaState) throw new Error('Evolutia persona state missing');
        const activeId = personaState.activeAlterEgoId || 'base';
        const alterEgos = Array.isArray(personaState.alterEgos) ? personaState.alterEgos : [];
        const activeEgo = alterEgos.find(a => a.id === activeId) || alterEgos[0];
        const fields = Array.isArray(activeEgo?.fields) ? activeEgo.fields : (Array.isArray(personaState.fields) ? personaState.fields : []);
        
        const f = fields.find(x => {
            const rawName = String(x.name || '').trim().toLowerCase();
            const rawId = String(x.id || '').trim().toLowerCase();
            const searchTarget = String(aeName).trim().toLowerCase();
            return rawName === searchTarget || rawId === searchTarget;
        });
        if (!f) throw new Error(`Aspect persona field "${aeName}" not found`);
        
        f.content = newValue;
        
        if (typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
        else if (typeof window.saveSettingsDebounced === 'function') window.saveSettingsDebounced();
        return;
    }

    if (fieldId === 'name') {
        const trimmedName = (newValue || '').trim();
        if (!trimmedName) throw new Error('Character name cannot be empty');
        
        // /rename-char renames the selected character, so only use it for that one.
        const isSelected = ctx.characters?.[ctx.characterId]?.avatar === char.avatar;
        if (isSelected && typeof ctx.executeSlashCommandsWithOptions === 'function') {
            const safeName = trimmedName.replace(/"/g, '\\"');
            await ctx.executeSlashCommandsWithOptions(`/rename-char silent=true chats=true "${safeName}"`);
            return;
        }

        const renameRes = await fetch('/api/characters/rename', {
            method: 'POST',
            headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ avatar_url: char.avatar, new_name: trimmedName }),
        });
        if (!renameRes.ok) {
            const errText = await renameRes.text().catch(() => renameRes.statusText);
            throw new Error(`Rename failed: HTTP ${renameRes.status}: ${errText}`);
        }
        char.name = trimmedName;
        if (char.data) char.data.name = trimmedName;
        if (typeof ctx.getCharacters === 'function') await ctx.getCharacters().catch(() => {});
        else if (typeof window.getCharacters === 'function') await window.getCharacters().catch(() => {});
        _emitCharacterEdited(ctx, char);
        if (typeof window.PrintCharacterList === 'function') window.PrintCharacterList();
        return;
    }
    
    if (fieldId === 'user_persona') {
        const pu = window.power_user || ctx.powerUserSettings || {};
        
        let avatar = window.user_avatar || ctx.user_avatar || ctx.userAvatar || ctx.personaId || ctx.activePersonaId || ctx.active_persona_id;
        if (!avatar && typeof document !== 'undefined') {
            const selected = document.querySelector('#user_avatar_block .avatar-container.selected, #persona_container .avatar-container.selected, .persona_selected');
            if (selected) avatar = selected.getAttribute('data-avatar-id') || selected.dataset?.avatarId;
        }
        if (typeof avatar === 'object' && avatar !== null) {
            avatar = avatar.avatarId || avatar.avatar_id || avatar.user_avatar || avatar.userAvatar || avatar.id;
        }

        if (avatar) {
            try {
                const res = await fetch('/api/characters/merge-attributes', {
                    method: 'POST',
                    headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ avatar: avatar, data: { description: newValue }, is_persona: true })
                });
            } catch(e) { console.warn("Failed to merge persona API:", e); }
            
            if (pu.persona_descriptions && typeof pu.persona_descriptions === 'object') {
                if (typeof pu.persona_descriptions[avatar] === 'object') {
                    pu.persona_descriptions[avatar].description = newValue;
                } else {
                    pu.persona_descriptions[avatar] = newValue;
                }
            }
        } else {
            pu.persona_description = newValue;
        }
        
        if (typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
        else if (typeof window.saveSettingsDebounced === 'function') window.saveSettingsDebounced();
        
        ['persona_description', 'user_persona_edit', 'user_persona_textarea', 'persona_description_textarea'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.value = newValue; el.dispatchEvent(new Event('input', {bubbles:true})); }
        });
        return;
    }

    if (fieldId === 'authors_note') {
        ctx.chatMetadata = ctx.chatMetadata || {};
        ctx.chatMetadata.note_prompt = newValue;
        if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
        else saveSettings();
        
        ['note_prompt', 'note_textarea', 'chat_anote_textarea', 'anote_textarea', 'extension_floating_prompt'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.value = newValue; el.dispatchEvent(new Event('input', {bubbles:true})); }
        });
        return;
    }

    if (fieldId === 'tags') {
        const newTagsNames = typeof newValue === 'string' 
            ? newValue.split(',').map(t => t.trim()).filter(Boolean) 
            : (Array.isArray(newValue) ? newValue : []);
        
        const avatar = char.avatar;
        
        if (ctx.tagMap && ctx.tags) {
            const currentTagIds = ctx.tagMap[avatar] || [];
            const toUnlink = currentTagIds.filter(id => {
                const tagObj = ctx.tags.find(t => t.id === id);
                if (!tagObj) return false;
                return !newTagsNames.some(n => n.toLowerCase() === tagObj.name.toLowerCase());
            });

            if (toUnlink.length > 0) {
                ctx.tagMap[avatar] = currentTagIds.filter(id => !toUnlink.includes(id));
                if (typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
                else if (typeof window.saveSettingsDebounced === 'function') window.saveSettingsDebounced();
            }
        }
        
        if (!char.data) char.data = {};
        char.data.tags = newTagsNames;
        char.tags = newTagsNames;
        
        const payload = {
            avatar_url: avatar,
            ch_name: char.name || 'Unknown',
            field: 'tags',
            value: newTagsNames
        };
        
        try {
            const res = await fetch('/api/characters/edit-attribute', {
                method: 'POST',
                headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) console.warn("[ST-Copilot] Tags edit-attribute failed:", res.status);
        } catch (e) { console.warn("[ST-Copilot] Failed to edit tags API:", e); }

        if (typeof ctx.importTags === 'function') {
            try {
                await ctx.importTags(char, { importSetting: 3 }); 
            } catch(e) { console.warn("[ST-Copilot] Failed to import tags via core context:", e); }
        }

        _emitCharacterEdited(ctx, char);
        return;
    }
    
    if (!char.data) char.data = {};
    
    const payload = { 
        avatar_url: char.avatar, 
        ch_name: char.name || 'Unknown',
        field: fieldId,
        value: newValue 
    };

    if (fieldId === 'alternate_greetings') {
        char.data.alternate_greetings = newValue;
    } else {
        char.data[fieldId] = newValue;
        char[fieldId] = newValue;
    }
    
    const res = await fetch('/api/characters/edit-attribute', {
        method: 'POST',
        headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        // edit-attribute rejects fields missing from the stored card (e.g. older cards
        // without system_prompt); merge-attributes can add them.
        const errText = await res.text().catch(() => '');
        if (res.status !== 400 || !/invalid field/i.test(errText)) throw new Error(`HTTP ${res.status}: ${errText}`);
        const mergeRes = await fetch('/api/characters/merge-attributes', {
            method: 'POST',
            headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ avatar: char.avatar, data: { [fieldId]: newValue } }),
        });
        if (!mergeRes.ok) {
            const mergeErr = await mergeRes.text().catch(() => mergeRes.statusText);
            throw new Error(`HTTP ${mergeRes.status}: ${mergeErr}`);
        }
    }

    const domMap = {
        description: 'description_textarea',
        personality: 'personality_textarea',
        scenario: 'scenario_pole',
        first_mes: 'firstmessage_textarea',
        mes_example: 'mes_example_textarea',
        system_prompt: 'system_prompt_textarea',
        post_history_instructions: 'post_history_instructions_textarea',
    };

    if (_isOpenInEditor(ctx, char)) {
        if (domMap[fieldId]) {
            const el = document.getElementById(domMap[fieldId]);
            if (el) {
                el.value = newValue;
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        } else if (fieldId === 'alternate_greetings') {
            if (typeof window.printAlternateGreetings === 'function') {
                window.printAlternateGreetings();
            }
        }
    }

    _emitCharacterEdited(ctx, char);
}

export async function createCharacterAPI(data) {
    const ctx = SillyTavern.getContext();
    
    _dbgAdd('CHAR_CREATE_START', { data });

    const tagsString = Array.isArray(data.tags) 
        ? data.tags.join(', ') 
        : (typeof data.tags === 'string' ? data.tags : '');

    const formData = new FormData();
    formData.append('ch_name', data.name || 'New Character');
    formData.append('description', data.description || '');
    formData.append('personality', data.personality || '');
    formData.append('scenario', data.scenario || '');
    formData.append('first_mes', data.first_mes || '');
    formData.append('mes_example', data.mes_example || '');
    formData.append('tags', tagsString);

    const headers = ctx.getRequestHeaders();
    delete headers['Content-Type'];
    
    let res;
    try {
        res = await fetch('/api/characters/create', {
            method: 'POST',
            headers,
            body: formData,
            cache: 'no-cache',
        });
    } catch (err) {
        console.error('[ST-Copilot-Debug] Network error during character post:', err);
        _dbgAdd('CHAR_CREATE_NET_ERR', { error: err.message, stack: err.stack });
        throw err;
    }

    if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        console.error(`[ST-Copilot-Debug] API returned HTTP Error ${res.status}: ${errText}`);
        _dbgAdd('CHAR_CREATE_HTTP_ERR', { status: res.status, text: errText });
        throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const newAvatar = await res.text();
    _dbgAdd('CHAR_CREATE_SERVER_OK', { avatar: newAvatar });

    await new Promise(r => setTimeout(r, 400));

    try {
        if (typeof ctx.getCharacters === 'function') {
            await ctx.getCharacters();
        } else if (typeof window.getCharacters === 'function') {
            await window.getCharacters();
        }
    } catch(e) {
        console.warn('[ST-Copilot-Debug] Failed to reload list of characters:', e);
        _dbgAdd('CHAR_CREATE_RELOAD_ERR', { error: e.message });
    }

    const chars = ctx.characters || window.characters || [];
    
    const foundChar = chars.find(c => c.avatar === newAvatar);
    if (foundChar) {
        _dbgAdd('CHAR_CREATE_CACHE_FOUND', { name: foundChar.name, tags: foundChar.tags });

        if (typeof ctx.importTags === 'function') {
            try {
                const importResult = await ctx.importTags(foundChar, { importSetting: 3 });
                _dbgAdd('CHAR_CREATE_IMPORT_TAGS_DONE', { result: importResult });
            } catch (importErr) {
                console.error('[ST-Copilot-Debug] Exception inside importTags():', importErr);
                _dbgAdd('CHAR_CREATE_IMPORT_TAGS_FAIL', { error: importErr.message, stack: importErr.stack });
            }
        } else {
            _dbgAdd('CHAR_CREATE_IMPORT_TAGS_MISSING', { reason: 'ctx.importTags is not a function' });
        }
    } else {
        console.error(`[ST-Copilot-Debug] Character "${newAvatar}" is missing from ST cache!`);
        _dbgAdd('CHAR_CREATE_CACHE_MISSING', { avatar: newAvatar });
    }

    try {
        if (typeof window.PrintCharacterList === 'function') {
            window.PrintCharacterList();
        }
        const es = ctx.eventSource || window.eventSource;
        const et = ctx.event_types || window.event_types;
        if (es && et?.CHARACTERS_UPDATED) {
            es.emit(et.CHARACTERS_UPDATED);
        }
    } catch(e) {
        console.warn('[ST-Copilot-Debug] UI redraw error:', e);
    }

    return true;
}