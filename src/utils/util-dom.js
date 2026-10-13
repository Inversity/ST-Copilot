import { EXT_DISPLAY } from '../constants.js';
import { translate } from './util-i18n.js';

// Restores an element's last size (per browser) and saves it when the user resizes it.
// A size convenience only: missing or blocked storage just means the default size.
export function rememberElementSize(el, key) {
    if (!el || el.dataset.sizeMemory) return;
    el.dataset.sizeMemory = '1';
    try {
        const v = JSON.parse(localStorage.getItem(key) || 'null');
        if (v?.w && v?.h) { el.style.width = `${v.w}px`; el.style.height = `${v.h}px`; }
    } catch (_) { /* storage unavailable */ }
    if (typeof ResizeObserver === 'undefined') return;
    let timer = null;
    new ResizeObserver(() => {
        if (el.offsetParent === null) return;  // hidden: nothing to record
        clearTimeout(timer);
        timer = setTimeout(() => {
            try { localStorage.setItem(key, JSON.stringify({ w: Math.round(el.offsetWidth), h: Math.round(el.offsetHeight) })); } catch (_) { /* storage unavailable */ }
        }, 300);
    }).observe(el);
}

// SillyTavern's display settings, which Copilot follows. ST marks them on <body>: "no-blur" for
// No Blur, "reduced-motion" for Reduced Motion (also on when the OS asks for reduced motion).
export const stNoBlur = () => document.body.classList.contains('no-blur');
export const stReducedMotion = () => document.body.classList.contains('reduced-motion');
export const scrollBehavior = () => (stReducedMotion() ? 'auto' : 'smooth');

export function escHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;width:1px;height:1px;';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand('copy'); toastr.success(translate('Copied'), EXT_DISPLAY); }
    catch (e) { toastr.error(translate('Copy failed'), EXT_DISPLAY); }
    ta.remove();
}

export function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
            .then(() => toastr.success(translate('Copied'), EXT_DISPLAY))
            .catch(() => fallbackCopy(text));
    } else { fallbackCopy(text); }
}

export function autoResize(el) { 
    el.style.height = 'auto'; 
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`; 
}

// Alert, confirm and prompt dialogs on SillyTavern's Popup: its theme, translations, focus
// handling and mobile layout. Resolves like before: alert and confirm to true/false, prompt to
// the text or null. delayConfirm keeps OK disabled for that many seconds; the popup is tagged
// scp-popup so Copilot's own click and key handlers treat it as part of Copilot.
export async function showCustomDialog({ type = 'alert', title = '', message = '', htmlMessage = '', defaultValue = '', placeholder = '', delayConfirm = 0 }) {
    const ctx = SillyTavern.getContext();
    if (typeof ctx.Popup !== 'function') return _showOwnDialog({ type, title, message, htmlMessage, defaultValue, placeholder, delayConfirm });
    const { POPUP_TYPE, POPUP_RESULT } = ctx;
    const isPrompt = type === 'prompt';
    const isConfirm = type === 'confirm';
    const body = message ? `<div>${escHtml(translate(message))}</div>` : (htmlMessage || '');
    const content = `${title ? `<h3>${escHtml(translate(title))}</h3>` : ''}${body}`;

    let remaining = isConfirm ? delayConfirm : 0;
    let timer = null;
    const popup = new ctx.Popup(content, isPrompt ? POPUP_TYPE.INPUT : isConfirm ? POPUP_TYPE.CONFIRM : POPUP_TYPE.TEXT, defaultValue, {
        okButton: isConfirm ? translate('Confirm') : (isPrompt ? translate('OK') : null),
        cancelButton: isConfirm || isPrompt ? translate('Cancel') : null,
        placeholder: placeholder || null,
        onOpen: (p) => {
            if (remaining <= 0) return;
            const label = p.okButton.textContent;
            const tick = () => {
                p.okButton.classList.toggle('disabled', remaining > 0);
                p.okButton.textContent = remaining > 0 ? `${label} (${remaining})` : label;
            };
            tick();
            timer = setInterval(() => { remaining--; tick(); if (remaining <= 0) clearInterval(timer); }, 1000);
        },
        // Enter or a click on OK during the countdown does not close it.
        onClosing: (p) => !(remaining > 0 && p.result === POPUP_RESULT.AFFIRMATIVE),
        onClose: () => clearInterval(timer),
    });
    popup.dlg.classList.add('scp-popup');
    if (isConfirm) popup.okButton.classList.add('redWarningBG');
    const value = await popup.show();
    if (isPrompt) return typeof value === 'string' ? value : null;
    return value === POPUP_RESULT.AFFIRMATIVE;
}

// Copilot's own dialog, for a SillyTavern without Popup on its context.
function _showOwnDialog({ type = 'alert', title = '', message = '', htmlMessage = '', defaultValue = '', placeholder = '', delayConfirm = 0 }) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'scp-dialog-overlay';
        overlay.style.zIndex = '2147483050';
        const isPrompt = type === 'prompt';
        const isConfirm = type === 'confirm';
        overlay.innerHTML = `
            <div class="scp-dialog-box">
                ${title ? `<div class="scp-dialog-title">${escHtml(title)}</div>` : ''}
                ${message ? `<div class="scp-dialog-msg">${escHtml(message)}</div>` : (htmlMessage ? `<div class="scp-dialog-msg">${htmlMessage}</div>` : '')}
                ${isPrompt ? `<input type="text" class="scp-dialog-input" value="${escHtml(defaultValue)}" placeholder="${escHtml(placeholder)}">` : ''}
                <div class="scp-dialog-btns">
                    ${(isPrompt || isConfirm) ? `<button class="scp-dialog-btn scp-dialog-cancel" data-i18n="Cancel">Cancel</button>` : ''}
                    <button class="scp-dialog-btn scp-dialog-ok${isConfirm ? ' danger' : ''}">${isConfirm ? 'Confirm' : 'OK'}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const input = overlay.querySelector('.scp-dialog-input');
        const okBtn = overlay.querySelector('.scp-dialog-ok');
        const cancelBtn = overlay.querySelector('.scp-dialog-cancel');
        
        let timerIntv = null;
        let currentDelay = delayConfirm;
        const origOkText = okBtn.textContent;

        const close = val => { 
            if (timerIntv) clearInterval(timerIntv);
            overlay.classList.remove('visible'); 
            setTimeout(() => overlay.remove(), 150); 
            resolve(val); 
        };

        if (isConfirm && currentDelay > 0) {
            okBtn.disabled = true;
            okBtn.style.opacity = '0.5';
            okBtn.style.cursor = 'not-allowed';
            okBtn.textContent = `${origOkText} (${currentDelay})`;
            timerIntv = setInterval(() => {
                currentDelay--;
                if (currentDelay <= 0) {
                    clearInterval(timerIntv);
                    timerIntv = null;
                    okBtn.disabled = false;
                    okBtn.style.opacity = '1';
                    okBtn.style.cursor = '';
                    okBtn.textContent = origOkText;
                    if (!input) okBtn.focus();
                } else {
                    okBtn.textContent = `${origOkText} (${currentDelay})`;
                }
            }, 1000);
        }

        if (input) { input.focus(); input.select(); } else if (currentDelay <= 0) { setTimeout(() => okBtn.focus(), 50); }
        
        okBtn.addEventListener('click', () => { if (!okBtn.disabled) close(isPrompt ? input.value : true); });
        cancelBtn?.addEventListener('click', () => close(isPrompt ? null : false));
        let _dlgMouseDownTarget = null;
        overlay.addEventListener('mousedown', e => { _dlgMouseDownTarget = e.target; });
        overlay.addEventListener('click', e => { if (e.target === overlay && _dlgMouseDownTarget === overlay) close(isPrompt ? null : false); });
        const keyHandler = e => {
            if (e.key === 'Enter') { e.preventDefault(); if (!okBtn.disabled) close(isPrompt ? input.value : true); }
            if (e.key === 'Escape') close(isPrompt ? null : false);
        };
        (input || overlay).addEventListener('keydown', keyHandler);
        requestAnimationFrame(() => overlay.classList.add('visible'));
    });
}

export async function _fileToDataUrl(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => {
            rej(new Error('Read failed'));
        };
        r.readAsDataURL(file);
    });
}