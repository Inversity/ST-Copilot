import { applySearchReplaceToField } from './util-text.js';
import { t, translate } from './util-i18n.js';

// One anchor patch ({ search | anchor, replace }), honoring the Human's "Change all" choice
// (patch.all). Previews, validation and apply all go through here so they agree.
export function applyPatch(text, patch) {
    return applySearchReplaceToField(text, patch.search || patch.anchor || '', patch.replace || '', { all: !!patch.all });
}

// Applies patches in order. On the first failure returns { ok: false, reason, ambiguous }, where
// `ambiguous` ({ patch, count }) is set when a plain anchor occurs word for word in several places,
// so the card can offer "Change all".
export function applyPatches(text, patches, where = '') {
    let current = text;
    for (const patch of patches || []) {
        const r = applyPatch(current, patch);
        if (!r.matched) {
            const anchor = (patch.search || patch.anchor || '').slice(0, 50);
            const loc = where ? ` in ${where}` : '';
            if (r.occurrences > 1) return { ok: false, text, ambiguous: { patch, count: r.occurrences }, reason: t`"${anchor}" appears ${r.occurrences} times${loc}` };
            return { ok: false, text, reason: r.reason === 'ambiguous' ? t`"${anchor}" fits more than one place${loc}` : t`"${anchor}" not found${loc}` };
        }
        current = r.result;
    }
    return { ok: true, text: current };
}

// Adds a "Change all N" button to a card's warning line; choosing it marks the patch and lets
// the card validate again.
export function offerChangeAll(warnEl, ambiguous, onChosen) {
    if (!warnEl || !ambiguous) return;
    const btn = document.createElement('button');
    btn.className = 'scp-anchor-all-btn';
    btn.textContent = t`Change all ${ambiguous.count}`;
    btn.title = translate('Apply this change to every identical occurrence (check the diff first)');
    btn.addEventListener('click', e => {
        e.stopPropagation();
        ambiguous.patch.all = true;
        onChosen();
    });
    warnEl.appendChild(btn);
}
