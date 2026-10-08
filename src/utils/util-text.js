import { _dbgAdd } from './util-debug.js';

export function _repairJSON(raw) {
    let s = raw;
    s = s.replace(/,\s*([\}\]])/g, '$1');
    try {
        s = s.replace(/"((?:[^"\\]|\\.)*)"/g, (match, inner) => {
            const fixed = inner.replace(/(?<!\\)"/g, '\\"');
            return `"${fixed}"`;
        });
    } catch (_) {}
    const opens = (s.match(/[\[{]/g) || []).length;
    const closes = (s.match(/[\]\}]/g) || []).length;
    if (opens > closes) {
        const stack = [];
        for (const ch of s) {
            if (ch === '{') stack.push('}');
            else if (ch === '[') stack.push(']');
            else if (ch === '}' || ch === ']') stack.pop();
        }
        s += stack.reverse().join('');
    }
    return s;
}

export function _sanitizeProposedTags(value) {
    if (typeof value !== 'string') return '';
    let cleaned = value.trim();
    
    try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
            return parsed.map(t => String(t).trim()).filter(Boolean).join(', ');
        }
        if (typeof parsed === 'string') {
            cleaned = parsed.trim();
        }
    } catch (_) {}

    cleaned = cleaned.replace(/^\[\s*|\]\s*$/g, '').trim();

    const quotedMatches = [...cleaned.matchAll(/["']([^"']+)["']/g)].map(m => m[1].trim());
    if (quotedMatches.length > 0) {
        return quotedMatches.filter(Boolean).join(', ');
    }

    return cleaned.split(',')
        .map(item => item.replace(/[\[\]"']/g, '').trim())
        .filter(Boolean)
        .join(', ');
}

// A "word" for fuzzy anchor matching: a run of letters/digits in any script. Han and kana
// are written without spaces, so each of those characters is its own token.
const WORD_TOKEN_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|(?:(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])[\p{L}\p{M}\p{N}])+/u;

// bulk_replace semantics: replace every exact, whole-word occurrence. Fuzzy matching is
// only used for "first || last" anchors, since a fuzzy or substring replace-all would hit
// similar words (e.g. "old" inside "gold").
export function applyBulkReplacement(content, searchText, replaceText) {
    const src = content || '';
    const srch = searchText || '';
    if (!srch) return { result: src, matched: false };
    if (srch.includes('||')) return applySearchReplaceToField(src, srch, replaceText);
    const wordChar = /[\p{L}\p{M}\p{N}_]/u;
    const escaped = srch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
        (wordChar.test(srch[0]) ? '(?<![\\p{L}\\p{M}\\p{N}_])' : '') + escaped +
        (wordChar.test(srch[srch.length - 1]) ? '(?![\\p{L}\\p{M}\\p{N}_])' : ''),
        'gu');
    let matched = false;
    const result = src.replace(re, () => { matched = true; return replaceText || ''; });
    return { result, matched };
}

// LLMs copying text routinely swap these: curly quotes, dashes, the ellipsis glyph, and
// whitespace runs. Matching on a normalized copy absorbs that without any guessing. map[k]
// is the index in the original text of normalized character k.
function _normalizeWithMap(text) {
    let out = '';
    const map = [];
    let prevSpace = false;
    for (let i = 0; i < text.length; i++) {
        let ch = text[i];
        if (/\s/.test(ch)) {
            if (prevSpace) continue;
            ch = ' ';
            prevSpace = true;
        } else {
            prevSpace = false;
        }
        if ('‘’‚′'.includes(ch)) ch = "'";
        else if ('“”„″'.includes(ch)) ch = '"';
        else if ('–—−'.includes(ch)) ch = '-';
        if (ch === '…') { out += '...'; map.push(i, i, i); continue; }
        out += ch;
        map.push(i);
    }
    return { text: out, map };
}

function _findAllIndices(haystack, needle) {
    const hits = [];
    if (!needle) return hits;
    let i = haystack.indexOf(needle);
    while (i !== -1) {
        hits.push(i);
        i = haystack.indexOf(needle, i + needle.length);
    }
    return hits;
}

// Every non-overlapping place `query` occurs in `src`: exact first, then normalized.
function _findLiteral(src, query) {
    const q = query.trim();
    if (!q) return [];
    const exact = _findAllIndices(src, q);
    if (exact.length) return exact.map(start => ({ start, end: start + q.length }));
    const ns = _normalizeWithMap(src);
    const nq = _normalizeWithMap(q).text.trim();
    return _findAllIndices(ns.text, nq).map(k => ({ start: ns.map[k], end: ns.map[k + nq.length - 1] + 1 }));
}

// Anchors must identify exactly one place. A failed or ambiguous anchor changes nothing,
// so the edit fails safe instead of patching the wrong region. Returns
// { result, matched, reason } where reason is 'not_found' | 'ambiguous' when unmatched.
export function applySearchReplaceToField(fieldContent, searchText, replaceText) {
    if (!fieldContent) return { result: replaceText || '', matched: true };
    const src = fieldContent;
    const srch = searchText || '';
    const repl = replaceText || '';
    // 0.85 still let one wholly wrong word through a 6-word anchor ("wall" matched "bar").
    const FUZZY_MIN = 0.9;
    const FUZZY_TIE_MARGIN = 0.05;

    function levenshtein(a, b) {
        if (a === b) return 0;
        let l1 = a.length, l2 = b.length;
        if (l1 === 0) return l2;
        if (l2 === 0) return l1;
        let prev = new Int32Array(l2 + 1);
        let curr = new Int32Array(l2 + 1);
        for (let j = 0; j <= l2; j++) prev[j] = j;
        for (let i = 1; i <= l1; i++) {
            curr[0] = i;
            for (let j = 1; j <= l2; j++) {
                let cost = (a.charAt(i - 1) === b.charAt(j - 1)) ? 0 : 1;
                curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
            }
            let temp = prev; prev = curr; curr = temp;
        }
        return prev[l2];
    }

    function getTokenSimilarity(t1, t2) {
        if (t1 === t2) return 1.0;
        if (t1.length >= 3 && t2.length >= 3) {
            if (t1.startsWith(t2) || t2.startsWith(t1)) return 0.85;
        }
        const dist = levenshtein(t1, t2);
        return 1 - (dist / Math.max(t1.length, t2.length));
    }

    function getTokensWithOffsets(text) {
        const tokens = [];
        const re = new RegExp(WORD_TOKEN_RE.source, 'gu');
        let match;
        while ((match = re.exec(text)) !== null) {
            tokens.push({ text: match[0].toLowerCase(), start: match.index, end: re.lastIndex });
        }
        return tokens;
    }

    function findFuzzyRange(srcText, queryText, minScore = 0.72) {
        const srcTokens = getTokensWithOffsets(srcText);
        const queryTokens = queryText.toLowerCase().match(new RegExp(WORD_TOKEN_RE.source, 'gu')) || [];

        if (!queryTokens.length) {
            const litIdx = srcText.indexOf(queryText.trim());
            if (litIdx !== -1) return { start: litIdx, end: litIdx + queryText.trim().length, score: 1.0 };
            return null;
        }
        if (!srcTokens.length) return null;

        let bestScore = 0;
        let bestStartIdx = -1;
        let bestEndIdx = -1;
        const qualifying = [];

        const minWinSize = Math.max(1, queryTokens.length - 1);
        const maxWinSize = queryTokens.length + 1;

        for (let winSize = minWinSize; winSize <= maxWinSize; winSize++) {
            for (let i = 0; i <= srcTokens.length - winSize; i++) {
                const windowTokens = srcTokens.slice(i, i + winSize);
                let totalSim = 0;
                const compareCount = Math.max(queryTokens.length, windowTokens.length);
                for (let j = 0; j < compareCount; j++) {
                    const qT = queryTokens[j];
                    const wT = windowTokens[j]?.text;
                    if (qT && wT) totalSim += getTokenSimilarity(qT, wT);
                }
                const score = totalSim / compareCount;
                if (score >= minScore) qualifying.push({ s: i, e: i + winSize - 1, score });
                if (score > bestScore) {
                    bestScore = score;
                    bestStartIdx = i;
                    bestEndIdx = i + winSize - 1;
                }
            }
        }

        if (bestScore >= minScore) {
            let startPos = srcTokens[bestStartIdx].start;
            let endPos = srcTokens[bestEndIdx].end;

            const qLower = queryText.toLowerCase();
            const lastQTok = queryTokens[queryTokens.length - 1];
            const lastTokIdx = qLower.lastIndexOf(lastQTok);
            if (lastTokIdx !== -1) {
                const trailMatch = queryText.slice(lastTokIdx + lastQTok.length).match(/^[^\p{L}\p{M}\p{N}]+/u);
                if (trailMatch && srcText.slice(endPos, endPos + trailMatch[0].length) === trailMatch[0]) {
                    endPos += trailMatch[0].length;
                }
            }

            const firstQTok = queryTokens[0];
            const firstTokIdx = qLower.indexOf(firstQTok);
            if (firstTokIdx > 0) {
                const leadMatch = queryText.slice(0, firstTokIdx).match(/[^\p{L}\p{M}\p{N}]+$/u);
                if (leadMatch && srcText.slice(startPos - leadMatch[0].length, startPos) === leadMatch[0]) {
                    startPos -= leadMatch[0].length;
                }
            }

            // A second, non-overlapping window scoring nearly as well means the query fits
            // two places; picking one would be a guess.
            const ambiguous = qualifying.some(w => (w.e < bestStartIdx || w.s > bestEndIdx) && w.score >= bestScore - FUZZY_TIE_MARGIN);
            return { start: startPos, end: endPos, score: bestScore, ambiguous };
        }
        return null;
    }

    // All places `query` occurs in `text`: literal matches, else one fuzzy match. A fuzzy
    // match that fits two places is returned twice so callers see it as ambiguous.
    function locate(text, query) {
        const literal = _findLiteral(text, query);
        if (literal.length) return literal;
        const fz = findFuzzyRange(text, query, FUZZY_MIN);
        if (!fz) return [];
        const hit = { start: fz.start, end: fz.end };
        return fz.ambiguous ? [hit, hit] : [hit];
    }

    const fail = (reason) => {
        _dbgAdd('PATCH_ANCHOR_FAILED', { search: srch, reason, srcLength: src.length });
        return { result: src, matched: false, reason };
    };
    const replaceRange = (start, end) => ({ result: src.slice(0, start) + repl + src.slice(end), matched: true });

    if (!srch.trim()) return fail('not_found');

    let sepIdx = srch.indexOf(' || ');
    let sepLen = 4;
    if (sepIdx === -1) { sepIdx = srch.indexOf('||'); sepLen = 2; }
    const startPart = sepIdx > 0 ? srch.slice(0, sepIdx).trim() : '';
    const endPart = sepIdx > 0 ? srch.slice(sepIdx + sepLen).trim() : '';

    if (startPart && endPart) {
        // Boundary anchor: exactly one start, and exactly one end after it.
        const starts = locate(src, startPart);
        if (!starts.length) return fail('not_found');
        if (starts.length > 1) return fail('ambiguous');
        const after = starts[0].end;
        const ends = locate(src.slice(after), endPart);
        if (!ends.length) return fail('not_found');
        if (ends.length > 1) return fail('ambiguous');
        return replaceRange(starts[0].start, after + ends[0].end);
    }

    const hits = locate(src, srch);
    if (!hits.length) return fail('not_found');
    if (hits.length > 1) return fail('ambiguous');
    return replaceRange(hits[0].start, hits[0].end);
}

export function _ensureWrapped(text, tag) {
    if (!text || !text.trim()) return '';
    let t = text.trim();
    const open = `<${tag}>`;
    const close = `</${tag}>`;
    
    t = t.replace(new RegExp(`^<${tag}>\\s*`, 'i'), '');
    t = t.replace(new RegExp(`\\s*</${tag}>$`, 'i'), '');
    
    return `${open}\n${t}\n${close}`;
}
// Stable hash of a prompt's text, ignoring whitespace differences. Used to
// recognise saved prompts that are unmodified copies of an old default.
export function promptHash(text) {
    const str = String(text || '').replace(/\s+/g, ' ').trim();
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
