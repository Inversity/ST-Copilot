import { EXT_DISPLAY, I, THEME_PRESETS } from '../constants.js';
import { getSettings, getCurrentSession, saveSessionsToMetadata } from '../session.js';
import { applyCustomTheme, bringWindowToFront } from '../ui/ui-window.js';
import { showCustomDialog, escHtml } from '../utils/util-dom.js';
import { openTextDiffModal } from '../utils/util-diff.js';
import { t, translate } from '../utils/util-i18n.js';
import {
    getPromptManagerState, applyPromptChanges, updateCurrentPreset,
    previewPromptChange, applyPromptChange, stripPromptChangesBlock, reconstructPromptChangesBlock,
} from './feature-prompt-engine.js';

// Full-screen editor for the prompts SillyTavern sends for roleplay (Chat Completion
// Prompt Manager, or the Text Completion system prompt). Edits go into ST's live settings
// and settings.json, exactly like ST's own Prompt Manager; "Update preset file" also
// writes them into the preset, like ST's "Update current preset".

let _selectedId = null;
let _dirty = null;       // pending { content, name, role } for the selected prompt, or null
let _saveFn = null;

async function _confirmDiscard() {
    if (!_dirty) return true;
    return showCustomDialog({
        type: 'confirm',
        title: translate('Unsaved Changes'),
        message: translate('Discard the unsaved changes to this prompt?'),
    });
}

function _roleBadge(entry) {
    if (entry.marker) return `<span class="scp-pm-badge scp-pm-badge-slot">${translate('slot')}</span>`;
    return `<span class="scp-pm-badge">${escHtml(entry.role)}</span>`;
}

function _renderList() {
    const listEl = document.getElementById('scp-pm-list');
    const presetEl = document.getElementById('scp-pm-preset');
    if (!listEl) return;
    const state = getPromptManagerState();
    if (presetEl) presetEl.textContent = state.presetName ? (state.mode === 'cc' ? t`Preset: ${state.presetName}` : t`System prompt: ${state.presetName}`) : '';
    listEl.innerHTML = '';

    for (const entry of state.entries) {
        const row = document.createElement('div');
        row.className = `scp-char-row scp-pm-row${entry.enabled ? '' : ' scp-pm-disabled'}${entry.marker ? ' scp-pm-marker' : ''}`;
        row.dataset.id = entry.id;
        row.classList.toggle('selected', entry.id === _selectedId);

        const name = document.createElement('span');
        name.className = 'scp-char-row-name';
        name.textContent = entry.name;
        row.appendChild(name);
        row.insertAdjacentHTML('beforeend', _roleBadge(entry));

        // Same on/off as ST's Prompt Manager toggle; applies immediately.
        const cb = document.createElement('div');
        cb.className = `scp-char-row-cb${entry.enabled ? ' checked' : ''}`;
        cb.title = translate('Send this prompt');
        cb.addEventListener('click', e => {
            e.stopPropagation();
            applyPromptChanges({ [entry.id]: { enabled: !entry.enabled } });
            _renderList();
        });
        row.appendChild(cb);

        row.addEventListener('click', async () => {
            if (entry.id === _selectedId) return;
            if (!(await _confirmDiscard())) return;
            _selectedId = entry.id;
            _dirty = null;
            _renderList();
            _renderDetail();
        });
        listEl.appendChild(row);
    }

    if (!state.entries.length) {
        listEl.innerHTML = `<div class="scp-char-list-empty">${translate('No prompts found for the current API.')}</div>`;
    }
}

function _renderDetail() {
    const main = document.getElementById('scp-pm-main');
    if (!main) return;
    const entry = getPromptManagerState().entries.find(e => e.id === _selectedId);
    main.innerHTML = '';
    _dirty = null;
    _saveFn = null;
    if (!entry) {
        main.innerHTML = `<div class="scp-char-empty-state"><div class="scp-empty-icon"><i class="fa-solid fa-scroll"></i></div><div>${translate('Select a prompt to edit')}</div></div>`;
        return;
    }

    const pane = document.createElement('div');
    pane.className = 'scp-char-pane scp-pm-pane';

    if (entry.marker) {
        pane.innerHTML = `
            <div class="scp-pm-title-row"><span class="scp-pm-title">${escHtml(entry.name)}</span>${_roleBadge(entry)}</div>
            <div class="scp-pm-note">${translate('This is a slot SillyTavern fills in at send time (card fields, chat history, lorebook entries). Its content is not editable here; use the checkbox in the list to turn it on or off.')}</div>`;
        main.appendChild(pane);
        return;
    }

    const top = document.createElement('div');
    top.className = 'scp-pm-top';
    top.innerHTML = `
        <input type="text" class="scp-char-field-input scp-pm-name" ${entry.id === 'sysprompt' ? 'disabled' : ''}>
        <select class="scp-sp-select scp-pm-role" ${entry.id === 'sysprompt' ? 'disabled' : ''}>
            <option value="system">system</option><option value="user">user</option><option value="assistant">assistant</option>
        </select>
        <span class="scp-char-field-tokens scp-pm-tokens"></span>
        <button class="scp-action-btn scp-char-banner-save-btn scp-pm-save" disabled style="opacity:.4">${I.check}<span>${translate('Save')}</span></button>
        <button class="scp-action-btn scp-pm-revert" disabled style="opacity:.4">${I.x}<span>${translate('Revert')}</span></button>`;
    pane.appendChild(top);

    const ta = document.createElement('textarea');
    ta.className = 'scp-char-field-textarea scp-pm-content';
    ta.spellcheck = false;
    pane.appendChild(ta);
    main.appendChild(pane);

    const nameEl = top.querySelector('.scp-pm-name');
    const roleEl = top.querySelector('.scp-pm-role');
    const tokEl = top.querySelector('.scp-pm-tokens');
    const saveBtn = top.querySelector('.scp-pm-save');
    const revertBtn = top.querySelector('.scp-pm-revert');
    nameEl.value = entry.name;
    roleEl.value = entry.role;
    ta.value = entry.content;

    const countTokens = async text => {
        try {
            const n = await (await import('../api.js')).estimateTokens(text);
            if (tokEl.isConnected) tokEl.textContent = `[~${n} tkns]`;
        } catch (_) { /* token count is cosmetic */ }
    };
    countTokens(entry.content);

    let tokTimer = null;
    const onEdit = () => {
        const changed = ta.value !== entry.content || nameEl.value !== entry.name || roleEl.value !== entry.role;
        _dirty = changed ? { content: ta.value, name: nameEl.value, role: roleEl.value } : null;
        for (const b of [saveBtn, revertBtn]) { b.disabled = !changed; b.style.opacity = changed ? '1' : '0.4'; }
        clearTimeout(tokTimer);
        tokTimer = setTimeout(() => countTokens(ta.value), 600);
    };
    ta.addEventListener('input', onEdit);
    nameEl.addEventListener('input', onEdit);
    roleEl.addEventListener('change', onEdit);

    _saveFn = () => {
        if (!_dirty) return true;
        applyPromptChanges({ [entry.id]: _dirty });
        _dirty = null;
        toastr.success(translate('Prompt saved to SillyTavern settings. Use "Update preset file" to also store it in the preset.'), EXT_DISPLAY, { timeOut: 6000 });
        _renderList();
        _renderDetail();
        return true;
    };
    saveBtn.addEventListener('click', () => _saveFn());
    revertBtn.addEventListener('click', () => { _dirty = null; _renderDetail(); });
}

// ─── Proposal card for AI-proposed prompt edits ─────────────────────────────

const ACTION_LABELS = { replace: '✎ Replace', overwrite: '↺ Overwrite', append: '⬇ Append', prepend: '⬆ Prepend', toggle: '⏻ Toggle' };

// Keeps only still-pending changes in the message, so a re-render can't resurrect an
// applied or rejected one. When none are left, the block becomes a one-line tally that
// also tells the model next turn what happened.
function _syncProposalMessage(msgId, changes, states) {
    const session = getCurrentSession();
    const msg = session?.messages.find(m => m.id === msgId);
    if (!msg) return;
    const pending = changes.filter((_, i) => states[i] === 'pending');
    const base = stripPromptChangesBlock(msg.content);
    if (pending.length) {
        msg.content = `${base}\n\n${reconstructPromptChangesBlock(pending)}`;
    } else {
        const tally = msg._promptEditTally || { applied: 0, rejected: 0 };
        msg.content = `${base}\n\n*Prompt edits: ${tally.applied} applied, ${tally.rejected} rejected.*`;
    }
    if (msg.swipes) msg.swipes[msg.swipeIndex || 0] = { ...msg.swipes[msg.swipeIndex || 0], content: msg.content };
    saveSessionsToMetadata();
}

function _refreshManagerIfOpen() {
    const overlay = document.getElementById('scp-pm-overlay');
    if (overlay && overlay.style.display !== 'none' && !_dirty) { _renderList(); _renderDetail(); }
}

export function renderPromptProposalCard(changes, msgEl) {
    const msgId = msgEl.dataset.id;
    msgEl.querySelectorAll('.scp-pm-proposal-card').forEach(c => c.remove());
    const states = changes.map(() => 'pending');

    const card = document.createElement('div');
    card.className = 'scp-lb-proposal-card scp-pm-proposal-card';
    card.dataset.for = msgId;
    card.style.margin = '8px 0 0 0';

    const header = document.createElement('div');
    header.className = 'scp-lb-proposal-header';
    const count = document.createElement('span');
    count.className = 'scp-lb-proposal-count';
    const updateCount = () => { count.textContent = t`${states.filter(s => s === 'pending').length} pending`; };
    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0';
    headerLeft.innerHTML = `<span class="scp-lb-proposal-icon" style="color:var(--scp-accent);display:flex"><i class="fa-solid fa-scroll"></i></span><span class="scp-lb-proposal-title">${escHtml(translate('Proposed Prompt Edits'))}</span>`;
    headerLeft.appendChild(count);
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'scp-lb-proposal-dismiss';
    dismissBtn.innerHTML = I.x;
    dismissBtn.title = translate('Reject all remaining');
    header.appendChild(headerLeft);
    header.appendChild(dismissBtn);
    card.appendChild(header);

    const list = document.createElement('div');
    list.className = 'scp-lb-proposal-list';
    card.appendChild(list);

    const tally = () => {
        const msg = getCurrentSession()?.messages.find(m => m.id === msgId);
        if (msg && !msg._promptEditTally) msg._promptEditTally = { applied: 0, rejected: 0 };
        return msg?._promptEditTally || { applied: 0, rejected: 0 };
    };
    const finish = (i, state, itemEl) => {
        states[i] = state;
        tally()[state] += 1;
        itemEl.classList.add(state === 'applied' ? 'scp-lb-item-applied' : 'scp-lb-item-rejected');
        itemEl.querySelectorAll('button').forEach(b => { b.disabled = true; });
        _syncProposalMessage(msgId, changes, states);
        updateCount();
        if (!states.includes('pending')) setTimeout(() => card.remove(), 600);
    };

    const items = changes.map((change, i) => {
        const pv = previewPromptChange(change);
        const item = document.createElement('div');
        item.className = 'scp-lb-proposal-item scp-lb-proposal-edit';
        const hdr = document.createElement('div');
        hdr.className = 'scp-lb-proposal-item-header';
        const meta = document.createElement('div');
        meta.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;flex-wrap:wrap;min-width:0';
        const what = change.action === 'toggle' ? ` → ${change.enabled ? 'on' : 'off'}` : '';
        meta.innerHTML = `<span class="scp-lb-proposal-action">${escHtml(ACTION_LABELS[change.action] || change.action)}</span><span class="scp-lb-proposal-name">${escHtml((pv.entry?.name || change.id) + what)}</span>`;
        if (!pv.ok) {
            item.style.borderLeftColor = 'var(--scp-danger)';
            const warn = document.createElement('div');
            warn.style.cssText = 'font-size:10px;color:var(--scp-danger);margin-top:4px;flex-basis:100%';
            warn.textContent = `⚠ ${pv.reason}`;
            meta.appendChild(warn);
        }

        const btns = document.createElement('div');
        btns.className = 'scp-lb-proposal-item-btns';
        if (pv.ok && change.action !== 'toggle') {
            const diffBtn = document.createElement('button');
            diffBtn.className = 'scp-lb-proposal-diff-btn';
            diffBtn.title = translate('View diff');
            diffBtn.innerHTML = I.diff;
            diffBtn.addEventListener('click', e => {
                e.stopPropagation();
                const now = previewPromptChange(change);
                if (now.ok) openTextDiffModal(t`Diff: ${now.entry.name}`, now.before, now.after);
            });
            btns.appendChild(diffBtn);
        }
        const applyBtn = document.createElement('button');
        applyBtn.className = 'scp-lb-proposal-item-apply';
        applyBtn.textContent = '✓';
        applyBtn.title = pv.ok ? translate('Apply') : pv.reason;
        applyBtn.disabled = !pv.ok;
        applyBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (states[i] !== 'pending') return;
            // Re-checked at click time: an earlier accepted edit may have changed the text.
            const r = applyPromptChange(change);
            if (!r.ok) { toastr.warning(r.reason, EXT_DISPLAY); return; }
            finish(i, 'applied', item);
            _refreshManagerIfOpen();
        });
        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'scp-lb-proposal-item-reject';
        rejectBtn.textContent = '✕';
        rejectBtn.title = translate('Reject');
        rejectBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (states[i] === 'pending') finish(i, 'rejected', item);
        });
        btns.appendChild(applyBtn);
        btns.appendChild(rejectBtn);
        hdr.appendChild(meta);
        hdr.appendChild(btns);
        item.appendChild(hdr);
        list.appendChild(item);
        return item;
    });

    dismissBtn.addEventListener('click', () => {
        states.forEach((s, i) => { if (s === 'pending') finish(i, 'rejected', items[i]); });
    });

    updateCount();
    const bodyEl = msgEl.querySelector('.scp-msg-body');
    if (bodyEl) bodyEl.insertBefore(card, bodyEl.querySelector('.scp-swipe-bar'));
    else msgEl.after(card);
}

export function openPromptManager() {
    const overlay = document.getElementById('scp-pm-overlay');
    if (!overlay) return;
    if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
    applyCustomTheme(getSettings().customTheme || THEME_PRESETS.default);
    const entries = getPromptManagerState().entries;
    if (!entries.some(e => e.id === _selectedId)) _selectedId = entries.find(e => !e.marker)?.id || null;
    _renderList();
    _renderDetail();
    overlay.style.display = 'flex';
    bringWindowToFront();
}

export async function closePromptManager() {
    const overlay = document.getElementById('scp-pm-overlay');
    if (!overlay) return;
    if (!(await _confirmDiscard())) return;
    _dirty = null;
    overlay.style.display = 'none';
}

export function setupPromptManagerListeners() {
    const overlay = document.getElementById('scp-pm-overlay');
    if (!overlay) return;
    let downTarget = null;
    overlay.addEventListener('mousedown', e => { downTarget = e.target; });
    overlay.addEventListener('click', e => { if (e.target === overlay && downTarget === overlay) closePromptManager(); });
    document.getElementById('scp-pm-close')?.addEventListener('click', () => closePromptManager());
    document.getElementById('scp-pm-update-preset')?.addEventListener('click', async () => {
        if (_dirty && _saveFn) _saveFn();
        const { presetName } = getPromptManagerState();
        const ok = await showCustomDialog({
            type: 'confirm',
            title: translate('Update preset file'),
            message: t`Write the current SillyTavern settings into the preset "${presetName}"? This is the same as SillyTavern's "Update current preset" and includes any other unsaved preset changes.`,
        });
        if (!ok) return;
        try {
            await updateCurrentPreset();
            toastr.success(t`Preset "${presetName}" updated.`, EXT_DISPLAY);
        } catch (e) {
            toastr.error(t`Could not update the preset: ${e.message}`, EXT_DISPLAY);
        }
    });
}
