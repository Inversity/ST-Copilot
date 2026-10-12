import { state } from '../state.js';

// Markdown for Copilot messages. Pure (no DOM), so it can be tested under Node.

const LIST_LINE = /^\s*([*\-+]|\d+\.)\s+\S/;
const HEADING_LINE = /^#{1,6}\s+./;  // same lines as renderMarkdown's /^(#{1,6})\s+(.+)/
const HR_LINE = /^(---+|\*\*\*+|___+)$/;

// A line renderMarkdown turns into an ordinary inline segment, with nothing that can reach
// across a blank line: no list, indent, heading, rule, quote, table, code fence or placeholder.
function isPlainLine(line) {
    const t = line.trim();
    return t !== '' && !/^\s/.test(line) && !LIST_LINE.test(line) && !HEADING_LINE.test(line)
        && !HR_LINE.test(t) && !t.startsWith('>') && !/^\|.*\|$/.test(t)
        && !t.includes('```') && !t.includes('\x00');
}

/**
 * Splits streaming text at the last blank-line run where rendering the two sides apart
 * gives the same HTML as rendering the whole, so a stream can keep the finished part and
 * re-render only the paragraph being written:
 *   renderMarkdown(text) === renderMarkdown(stable) + joiner + renderMarkdown(tail)
 * The side before the blank lines must end in a plain line outside any code fence; the
 * side after must not start with a list (a blank line inside a list keeps it open) or a
 * quote or table. Each blank line adds a <br>, plus one more when the tail starts inline.
 * Returns null when there is no such point.
 */
export function splitStreamingMarkdown(text) {
    const lines = text.split('\n');
    let fences = 0;
    let lastPlain = -1;  // index of the last non-blank line, if it was plain and outside a fence
    let best = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const prev = lastPlain;
        if (prev >= 0 && i - prev > 1 && fences % 2 === 0) {
            const t = line.trim();
            const block = HEADING_LINE.test(line) || HR_LINE.test(t);
            const eligible = block || (!LIST_LINE.test(line) && !t.startsWith('>') && !/^\|.*\|$/.test(t));
            if (eligible) best = { at: i, blanks: i - prev - 1, inlineStart: !block, stableEnd: prev };
        }
        fences += (line.match(/```/g) || []).length;
        lastPlain = (fences % 2 === 0 && isPlainLine(line)) ? i : -1;
    }
    if (!best) return null;
    return {
        stable: lines.slice(0, best.stableEnd + 1).join('\n'),
        joiner: '<br>'.repeat(best.blanks + (best.inlineStart ? 1 : 0)),
        tail: lines.slice(best.at).join('\n'),
    };
}
export function renderMarkdown(text) {
    const codeBlocks = [];
    let out = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        if (lang && lang.toLowerCase() === 'html') {
            const id = `scp-hb-${state.htmlBlockCounter++}`;
            state.htmlBlockRegistry.set(id, code.trim());
            return `\x00H${id}\x00`;
        }
        const i = codeBlocks.length;
        const escaped = code.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        codeBlocks.push(`<pre class="scp-code-block${lang ? ` lang-${lang}` : ''}"><code>${escaped}</code></pre>`);
        return `\x00B${i}\x00`;
    });

    out = out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    out = out.replace(/`([^`\n]+)`/g, '<code class="scp-inline-code">$1</code>');

    const applyInline = (s) => {
        let res = s;
        res = res.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        res = res.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        res = res.replace(/~~(.+?)~~/g, '<del>$1</del>');
        res = res.replace(/\*([^<>\*\n]+)\*/g, '<em>$1</em>');
        return res;
    };

    const lines = out.split('\n');

    const getULIndent = (l) => { const m = l.match(/^(\s*)[*\-+]\s+\S/); return m ? m[1].length : -1; };
    const getOLIndent = (l) => { const m = l.match(/^(\s*)\d+\.\s+\S/); return m ? m[1].length : -1; };
    const isListLine = (l) => getULIndent(l) >= 0 || getOLIndent(l) >= 0;

    const buildNestedList = (listLines) => {
        const stack = [];
        let r = '';
        const closeUntil = (targetIndent, targetType) => {
            while (stack.length) {
                const top = stack[stack.length - 1];
                if (top.indent > targetIndent || (top.indent === targetIndent && top.type !== targetType)) {
                    r += `</li></${top.type}>`;
                    stack.pop();
                } else {
                    break;
                }
            }
        };
        for (let line of listLines) {
            if (!line.trim()) continue;
            if (!isListLine(line)) {
                r += `<br>${applyInline(line.trim())}`;
                continue;
            }
            const ulI = getULIndent(line);
            const olI = getOLIndent(line);
            const indent = ulI >= 0 ? ulI : olI;
            const type = ulI >= 0 ? 'ul' : 'ol';
            const cls = `scp-list${type === 'ol' ? ' scp-list-ol' : ''}`;
            
            let content = type === 'ul'
                ? line.replace(/^\s*[*\-+]\s+/, '')
                : line.replace(/^\s*\d+\.\s+/, '');
            
            content = applyInline(content);
            closeUntil(indent, type);
            
            if (stack.length && stack[stack.length - 1].indent === indent && stack[stack.length - 1].type === type) {
                r += `</li><li>${content}`;
            } else {
                r += `<${type} class="${cls}"><li>${content}`;
                stack.push({ indent, type });
            }
        }
        while (stack.length) r += `</li></${stack.pop().type}>`;
        return r;
    };

    const segs = [];
    const pushBlock = (h) => segs.push({ t: 'block', h });
    const pushInline = (h) => segs.push({ t: 'inline', h });

    let listBuf = [];
    let tableRows = [];
    let bqLines = [];

    const flushList = () => {
        if (!listBuf.length) return;
        pushBlock(buildNestedList(listBuf));
        listBuf = [];
    };
    const flushTable = () => {
        if (!tableRows.length) return;
        pushBlock(`<div class="scp-table-wrap"><table class="scp-table"><tbody>${tableRows.join('')}</tbody></table></div>`);
        tableRows = [];
    };
    const flushBq = () => {
        if (!bqLines.length) return;
        pushBlock(`<blockquote class="scp-blockquote">${bqLines.join('<br>')}</blockquote>`);
        bqLines = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimLine = line.trim();

        if (/^(---+|\*\*\*+|___+)$/.test(trimLine)) {
            flushList(); flushTable(); flushBq();
            pushBlock('<hr class="scp-hr">');
            continue;
        }

        const hm = line.match(/^(#{1,6})\s+(.+)/);
        if (hm) {
            flushList(); flushTable(); flushBq();
            pushBlock(`<span class="scp-h${hm[1].length}">${applyInline(hm[2])}</span>`);
            continue;
        }

        const bq = line.match(/^&gt;\s*(.*)/);
        if (bq) { flushList(); flushTable(); bqLines.push(applyInline(bq[1])); continue; }

        const tm = trimLine.match(/^\|(.*)\|$/);
        if (tm) {
            flushList(); flushBq();
            if (/^[|\s\-:]+$/.test(trimLine)) continue;
            const cells = tm[1].split('|').map(c => applyInline(c.trim()));
            const tag = tableRows.length === 0 ? 'th' : 'td';
            tableRows.push(`<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`);
            continue;
        }

        if (isListLine(line)) {
            flushTable(); flushBq();
            listBuf.push(line);
            continue;
        }

        if (listBuf.length > 0 && trimLine && /^\s+/.test(line)) {
            listBuf.push(line);
            continue;
        }

        if (!trimLine) {
            let nextNonEmpty = '';
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].trim()) { nextNonEmpty = lines[j]; break; }
            }
            if (nextNonEmpty && isListLine(nextNonEmpty)) {
                listBuf.push('');
            } else {
                flushList(); flushTable(); flushBq();
                pushInline('');
            }
            continue;
        }

        flushList(); flushTable(); flushBq();
        pushInline(applyInline(line));
    }
    flushList(); flushTable(); flushBq();

    let result = '';
    for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        if (seg.t === 'inline' && i > 0 && segs[i - 1].t === 'inline') result += '<br>';
        result += seg.h;
    }
    out = result;

    out = out.replace(/\x00H(scp-hb-\d+)\x00/g, (_, id) => `<div class="scp-html-block-ph" data-hbid="${id}"></div>`);
    out = out.replace(/\x00B(\d+)\x00/g, (_, i) => codeBlocks[+i]);
    out = out.replace(/\x00TC_(\d+)\x00/g, (_, i) => `<div class="scp-tool-call-ph" data-tcid="${i}"></div>`);
    out = out.replace(/(<div class="scp-tool-call-ph"[^>]*><\/div>)(?:<br>|\s)*/g, '$1');

    return out;
}
