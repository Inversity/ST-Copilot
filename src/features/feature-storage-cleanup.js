import { EXT_DISPLAY } from '../constants.js';
import { SESSION_FILE_RE, getCurrentSessionFileId, loadSessionFile, deleteSessionFile } from '../session.js';
import { showCustomDialog, escHtml } from '../utils/util-dom.js';
import { _dbgAdd } from '../utils/util-debug.js';
import { t } from '../utils/util-i18n.js';

const LIST_LIMIT = 30;

async function _postJson(url, body) {
    const ctx = SillyTavern.getContext();
    const res = await fetch(url, {
        method: 'POST',
        headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res.json();
}

async function _listSessionFiles() {
    const { report, token } = await _postJson('/api/data-maid/report');
    _postJson('/api/data-maid/finalize', { token }).catch(() => {});
    return (report?.files || []).map(f => f.name).filter(n => SESSION_FILE_RE.test(n));
}

async function _collectReferencedFiles() {
    const chats = await _postJson('/api/chats/recent', { metadata: true });
    if (!Array.isArray(chats)) throw new Error('Unexpected chat list response');

    const ctx = SillyTavern.getContext();
    const refs = new Set();
    const add = meta => { if (meta?.st_copilot?.file_id) refs.add(meta.st_copilot.file_id); };
    chats.forEach(c => {
        add(c.chat_metadata);
        // Pre-v4 file named after the chat; initChatBucket still migrates from it.
        if (c.file_id) refs.add(`copilot_sess_${String(c.file_id).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
    });
    (ctx.groups || []).forEach(g => add(g.chat_metadata));
    add(ctx.chatMetadata);
    const current = getCurrentSessionFileId();
    if (current) refs.add(current);
    return refs;
}

async function _mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
}

export async function scanOrphanSessionFiles() {
    const [files, refs] = await Promise.all([_listSessionFiles(), _collectReferencedFiles()]);
    const orphans = files.filter(n => !refs.has(n));

    const inspected = await _mapLimit(orphans, 6, async name => {
        const payload = await loadSessionFile(name);
        if (payload === null) return { name, messages: 0 };
        if (payload === false) return { name, messages: -1, chat: '' };
        const messages = (payload.bucket?.sessions || []).reduce((n, s) => n + (s.messages?.length || 0), 0);
        return { name, messages, chat: payload.chat_id_reference || '' };
    });

    return {
        total: files.length,
        referenced: files.length - orphans.length,
        empty: inspected.filter(f => f.messages === 0).map(f => f.name),
        withContent: inspected.filter(f => f.messages !== 0),
    };
}

async function _deleteAll(names) {
    const results = await _mapLimit(names, 6, deleteSessionFile);
    return results.filter(Boolean).length;
}

function _contentListHtml(items) {
    const rows = items.slice(0, LIST_LIMIT).map(f => {
        const count = f.messages < 0 ? t`unreadable` : t`${f.messages} msgs`;
        return `<div style="display:flex;justify-content:space-between;gap:8px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(f.chat || f.name)}</span><span style="flex-shrink:0;opacity:.7">${escHtml(count)}</span></div>`;
    }).join('');
    const more = items.length > LIST_LIMIT ? `<div style="opacity:.7">${escHtml(t`…and ${items.length - LIST_LIMIT} more`)}</div>` : '';
    return `<div style="max-height:40vh;overflow:auto;margin-top:8px;font-size:12px">${rows}${more}</div>`;
}

export async function runOrphanCleanup() {
    toastr.info(t`Scanning Copilot session files…`, EXT_DISPLAY);
    let scan;
    try {
        scan = await scanOrphanSessionFiles();
    } catch (e) {
        _dbgAdd('STORAGE_CLEANUP_SCAN_FAILED', { error: e?.message || String(e) });
        toastr.error(t`Scan failed: ${e.message}`, EXT_DISPLAY);
        return;
    }
    _dbgAdd('STORAGE_CLEANUP_SCAN', { total: scan.total, referenced: scan.referenced, empty: scan.empty.length, withContent: scan.withContent.length });

    if (!scan.empty.length && !scan.withContent.length) {
        toastr.success(t`No orphaned session files. (${scan.total} files, all in use)`, EXT_DISPLAY);
        return;
    }

    let deleted = 0;

    if (scan.empty.length) {
        const ok = await showCustomDialog({
            type: 'confirm',
            title: t`Clean Up Session Files`,
            message: t`Found ${scan.empty.length} empty session files that no chat uses. Delete them?`,
        });
        if (ok) deleted += await _deleteAll(scan.empty);
    }

    if (scan.withContent.length) {
        const ok = await showCustomDialog({
            type: 'confirm',
            title: t`Orphaned Sessions With Messages`,
            htmlMessage: escHtml(t`${scan.withContent.length} session files still contain messages, but no chat points to them anymore (deleted chats or old branches). Delete them too? This cannot be undone.`) + _contentListHtml(scan.withContent),
            delayConfirm: 3,
        });
        if (ok) deleted += await _deleteAll(scan.withContent.map(f => f.name));
    }

    _dbgAdd('STORAGE_CLEANUP_DONE', { deleted });
    if (deleted) toastr.success(t`Deleted ${deleted} session files.`, EXT_DISPLAY);
}
