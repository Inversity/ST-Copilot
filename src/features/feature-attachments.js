import { state } from '../state.js';
import { _fileToDataUrl, escHtml, showCustomDialog } from '../utils/util-dom.js';
import { _dbgAdd } from '../utils/util-debug.js';
import { _getCaptionViaExtension } from '../integrations/integ-captioning.js';
import { getSettings, getCurrentSession } from '../session.js';
import { EXT_DISPLAY } from '../constants.js';
import { t, translate } from '../utils/util-i18n.js';

import { updateMsgCount } from '../ui/ui-chat.js';

export function _attachmentId() { 
    return `att_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; 
}

// Download a remote image URL into a File, so it can be captioned or inlined like a picked file.
// Client-side fetch of third-party images is often blocked by CORS; the caller decides what to
// do on failure (send the URL through, or a "could not load" placeholder).
export async function _fetchUrlAsFile(url) {
    try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) return null;
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) return null;
        const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'image') || 'image';
        return new File([blob], name, { type: blob.type });
    } catch (e) { return null; }
}

export async function _processAttachmentsBeforeSend(atts, isPreview = false) {
    const s = getSettings();
    const mode = s.imageAnalysisMode || 'direct';
    const remoteMode = s.remoteImageMode || 'url';
    const processed = [];
    for (const a of atts) {
        if (!a.isImage) {
            let text = a.textContent;
            if (!text && a.file) {
                try { text = await a.file.text(); } catch(e) { text = '(binary data or read error)'; }
            }
            processed.push({ ...a, sendAsText: true, textContent: text });
            continue;
        }
        if (!a.isRemote) {
            if (mode === 'caption') {
                if (isPreview) {
                    processed.push({ ...a, sendAsText: true, textContent: `[Image "${a.name}" (caption will be generated on send)]` });
                } else {
                    let cap = await _getCaptionViaExtension(a.file).catch((e)=>{
                        console.warn("[ST-Copilot] Captioning error:", e);
                        _dbgAdd('IMAGE_CAPTIONING_SERVICE_MISSING', { name: a.name });
                        return '';
                    });
                    if (!cap) toastr.warning(t`Captioning failed for ${a.name}`, EXT_DISPLAY);
                    processed.push({
                        ...a,
                        sendAsText: true,
                        textContent: cap ? `[Image "${a.name}" caption: ${cap}]` : `[Image "${a.name}" (captioning failed)]`
                    });
                }
            } else {
                processed.push({ ...a });
            }
            continue;
        }
        // Remote (URL) image attachments.
        if (mode === 'caption') {
            if (isPreview) {
                processed.push({ ...a, sendAsText: true, textContent: `[Image "${a.name}" (caption will be generated on send)]` });
            } else {
                const file = a.file || await _fetchUrlAsFile(a.dataUrl);
                let cap = '';
                if (file) {
                    cap = await _getCaptionViaExtension(file).catch((e)=>{
                        console.warn("[ST-Copilot] Captioning error:", e);
                        _dbgAdd('IMAGE_CAPTIONING_SERVICE_MISSING', { name: a.name });
                        return '';
                    });
                }
                if (!cap) toastr.warning(t`Captioning failed for ${a.name}`, EXT_DISPLAY);
                processed.push({
                    ...a,
                    sendAsText: true,
                    textContent: cap ? `[Image "${a.name}" caption: ${cap}]` : `[Image "${a.name}" (captioning failed)]`
                });
            }
        } else if (remoteMode === 'inline') {
            // Send as base64: download once and cache the data URL on the attachment, so later
            // requests (attachments are re-sent with every message) do not download it again.
            if (a.inlineDataUrl) { processed.push({ ...a }); continue; }
            if (isPreview) { processed.push({ ...a }); continue; }
            const file = a.file || await _fetchUrlAsFile(a.dataUrl);
            const dataUrl = file ? await _fileToDataUrl(file).catch(() => null) : null;
            if (dataUrl) {
                processed.push({ ...a, inlineDataUrl: dataUrl });
            } else {
                toastr.warning(t`Could not download ${a.name}; sending its URL instead`, EXT_DISPLAY);
                processed.push({ ...a });
            }
        } else {
            // 'url': pass the remote URL through; the API provider downloads it.
            processed.push({ ...a });
        }
    }
    return processed;
}

export function _mergeContent(baseText, atts) {
    if (!atts || !atts.length) return baseText;
    // Text files are labeled with their name (they used to be pasted in bare, so neither the
    // model nor the Context view could tell file text from typed text). Image captions are
    // already labeled.
    const textParts = atts.filter(a => a.textContent).map(a => (a.isImage && a.sendAsText)
        ? a.textContent
        : `[Attached file "${a.name}"]\n${a.textContent}\n[End of "${a.name}"]`);
    const textPrefix = textParts.join('\n\n');
    
    let combinedText = '';
    if (textPrefix && baseText) combinedText = `${textPrefix}\n\n${baseText}`;
    else if (textPrefix) combinedText = textPrefix;
    else combinedText = baseText;
    
    // Remote attachments keep their URL in dataUrl; inlineDataUrl replaces it once downloaded.
    const imgBlocks = atts.filter(a => a.isImage && !a.sendAsText).map(a => ({ type: 'image_url', image_url: { url: a.inlineDataUrl || a.dataUrl } }));
    
    if (imgBlocks.length > 0) {
        return [...imgBlocks, { type: 'text', text: combinedText }];
    }
    return combinedText;
}

export function _renderAttachmentPreviews() {
    let previewBar = document.getElementById('scp-attachment-bar');
    const inputRow = document.querySelector('.scp-input-row');
    if (!inputRow) return;

    if (!state.pendingAttachments.length) {
        previewBar?.remove();
        return;
    }

    if (!previewBar) {
        previewBar = document.createElement('div');
        previewBar.id = 'scp-attachment-bar';
        previewBar.className = 'scp-attachment-bar';
        inputRow.parentNode.insertBefore(previewBar, inputRow);
    }
    previewBar.innerHTML = '';

    for (const att of state.pendingAttachments) {
        const item = document.createElement('div');
        item.className = 'scp-att-item';
        item.dataset.id = att.id;

        if (att.isImage) {
            const img = document.createElement('img');
            img.src = att.dataUrl;
            img.className = 'scp-att-thumb';
            img.title = att.name;
            // A remote image can 403 or vanish later: fall back to the link icon, not a broken img.
            img.addEventListener('error', () => {
                img.replaceWith(_attLinkIcon(att.name));
            });
            img.addEventListener('click', () => _openImageLightbox(att));
            item.appendChild(img);
        } else {
            const icon = document.createElement('div');
            icon.className = 'scp-att-icon';
            icon.innerHTML = `<i class="fa-solid fa-file"></i>`;
            icon.title = att.name;
            item.appendChild(icon);
            const lbl = document.createElement('div');
            lbl.className = 'scp-att-label';
            lbl.textContent = att.name.length > 14 ? att.name.slice(0, 12) + '…' : att.name;
            item.appendChild(lbl);
            item.addEventListener('click', () => _openTextLightbox(att));
        }

        const removeBtn = document.createElement('button');
        removeBtn.className = 'scp-att-remove';
        removeBtn.innerHTML = '×';
        removeBtn.title = translate('Remove');
        removeBtn.addEventListener('click', e => {
            e.stopPropagation();
            _dbgAdd('ATTACHMENT_REMOVE', { id: att.id });
            state.pendingAttachments = state.pendingAttachments.filter(a => a.id !== att.id);
            _renderAttachmentPreviews();
            updateMsgCount(getCurrentSession());
        });
        item.appendChild(removeBtn);
        previewBar.appendChild(item);
    }
}

let _lightboxEl = null;
let _lightboxScale = 1;

export function _openImageLightbox(att) {
    _dbgAdd('ATTACHMENT_LIGHTBOX_OPEN', { isImage: true });

    if (_lightboxEl) _lightboxEl.remove();
    _lightboxScale = 1;

    const overlay = document.createElement('div');
    overlay.className = 'scp-lightbox';
    _lightboxEl = overlay;

    const img = document.createElement('img');
    img.src = att.dataUrl;
    img.className = 'scp-lightbox-img';
    img.style.transform = `scale(1)`;
    img.style.transformOrigin = '50% 50%';

    overlay.appendChild(img);
    document.body.appendChild(overlay);

    img.addEventListener('click', e => {
        if (_lightboxScale >= 3) { _lightboxScale = 1; }
        else { _lightboxScale = Math.min(3, _lightboxScale + 1); }
        const rect = img.getBoundingClientRect();
        const ox = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
        const oy = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
        img.style.transformOrigin = `${ox}% ${oy}%`;
        img.style.transform = `scale(${_lightboxScale})`;
        img.style.cursor = _lightboxScale > 1 ? 'zoom-out' : 'zoom-in';
    });
    overlay.addEventListener('click', e => {
        if (e.target === overlay) { overlay.remove(); _lightboxEl = null; }
    });
    document.addEventListener('keydown', function onEsc(e) {
        if (e.key === 'Escape') { overlay.remove(); _lightboxEl = null; document.removeEventListener('keydown', onEsc); }
    });
}

export async function _openTextLightbox(att) {
    _dbgAdd('ATTACHMENT_LIGHTBOX_OPEN', { isImage: false });

    if (_lightboxEl) _lightboxEl.remove();
    const overlay = document.createElement('div');
    overlay.className = 'scp-lightbox';
    _lightboxEl = overlay;
    const pre = document.createElement('pre');
    pre.className = 'scp-lightbox-text';
    
    let text = att.textContent;
    if (!text && att.file) {
        try { text = await att.file.text(); att.textContent = text; } 
        catch(e) { text = 'Error reading file.'; }
    }
    pre.textContent = text || 'Loading...';
    
    overlay.appendChild(pre);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); _lightboxEl = null; }});
    document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { overlay.remove(); _lightboxEl = null; document.removeEventListener('keydown', onEsc); }});
}

export async function _addAttachments(files) {
    for (const file of files) {
        const isImage = file.type.startsWith('image/');
        let dataUrl = null;
        if (isImage) {
            dataUrl = await _fileToDataUrl(file).catch(() => null);
            if (!dataUrl) continue;
        }
        
        state.pendingAttachments.push({
            id: _attachmentId(),
            name: file.name, type: file.type, mimeType: file.type,
            dataUrl, isImage, file, textContent: null,
        });

        _dbgAdd('ATTACHMENT_ADD', { name: file.name, type: file.type, size: file.size });
    }
    _renderAttachmentPreviews();
    updateMsgCount(getCurrentSession());
}

// A link icon with the file name, for a remote image that could not load (403, vanished, CORS).
function _attLinkIcon(name) {
    const icon = document.createElement('div');
    icon.className = 'scp-att-icon scp-att-broken';
    icon.innerHTML = `<i class="fa-solid fa-link"></i>`;
    icon.title = name;
    const lbl = document.createElement('div');
    lbl.className = 'scp-att-label';
    lbl.textContent = (name || '').length > 14 ? (name || '').slice(0, 12) + '…' : (name || '');
    const wrap = document.createElement('div');
    wrap.className = 'scp-att-link';
    wrap.appendChild(icon);
    wrap.appendChild(lbl);
    return wrap;
}

// Attach an image by URL: it is sent to the API as an image_url pointing at the URL
// (Settings > Interface > File Attachments > Remote Image Send), so no base64 travels.
export async function _addUrlAttachment(url) {
    url = (url || '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
        toastr.warning(translate('Only http(s) image URLs can be attached.'), EXT_DISPLAY);
        return;
    }
    state.pendingAttachments.push({
        id: _attachmentId(),
        name: decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'image') || 'image',
        type: 'image/remote', mimeType: 'image/*',
        dataUrl: url, isImage: true, isRemote: true,
        file: null, textContent: null, inlineDataUrl: null,
    });
    _dbgAdd('ATTACHMENT_ADD_URL', { url });
    _renderAttachmentPreviews();
    updateMsgCount(getCurrentSession());
}

export function _setupAttachButton() {
    const btn = document.getElementById('scp-attach-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.multiple = true;
        inp.accept = 'image/*,text/*,.pdf,.json,.txt,.md,.csv,.log,.js,.py,.html,.css';
        inp.onchange = () => { 
            if (inp.files?.length) {
                const file = inp.files[0];
                if (file.size > 25 * 1024 * 1024) _dbgAdd('ATTACHMENT_SIZE_EXCEEDED', { name: file.name, size: file.size });
                _addAttachments(Array.from(inp.files)); 
            }
        };
        inp.click();
    });
    // Right-click the paperclip attaches an image URL instead of a file.
    btn.addEventListener('contextmenu', e => {
        e.preventDefault();
        showCustomDialog({
            type: 'prompt',
            title: 'Attach image URL',
            message: 'Address of an image to send to the model:',
            placeholder: 'https://example.com/picture.png',
        }).then(val => { if (val) _addUrlAttachment(val); });
    });
}