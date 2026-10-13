import { test } from 'node:test';
import assert from 'node:assert/strict';
import { showCustomDialog } from '../src/utils/util-dom.js';

const POPUP_TYPE = { TEXT: 1, CONFIRM: 2, INPUT: 3 };
const POPUP_RESULT = { AFFIRMATIVE: 1, NEGATIVE: 0, CANCELLED: null };
const classList = () => { const s = new Set(); return { add: c => s.add(c), toggle: (c, on) => (on ? s.add(c) : s.delete(c)), has: c => s.has(c) }; };

// A Popup double: show() resolves with `answer`; the last instance is kept for inspection.
function withPopup(answer) {
    let last = null;
    class Popup {
        constructor(content, type, inputValue, options) {
            Object.assign(this, { content, type, inputValue, options });
            this.dlg = { classList: classList() };
            this.okButton = { classList: classList(), textContent: options.okButton || 'OK' };
            last = this;
        }
        async show() { return typeof answer === 'function' ? answer(this) : answer; }
    }
    globalThis.__stContext = { Popup, POPUP_TYPE, POPUP_RESULT };
    return () => last;
}

test('alert, confirm and prompt resolve as the old dialog did', async () => {
    let last = withPopup(POPUP_RESULT.AFFIRMATIVE);
    assert.equal(await showCustomDialog({ title: 'Saved', message: 'a < b' }), true);
    assert.equal(last().type, POPUP_TYPE.TEXT);
    assert.equal(last().content, '<h3>Saved</h3><div>a &lt; b</div>');
    assert.ok(last().dlg.classList.has('scp-popup'));

    withPopup(POPUP_RESULT.CANCELLED);
    assert.equal(await showCustomDialog({ type: 'confirm', title: 'Delete?' }), false);
    withPopup(POPUP_RESULT.NEGATIVE);
    assert.equal(await showCustomDialog({ type: 'confirm', title: 'Delete?' }), false);

    last = withPopup('New name');
    assert.equal(await showCustomDialog({ type: 'prompt', title: 'Rename', defaultValue: 'Old', placeholder: 'Name' }), 'New name');
    assert.equal(last().type, POPUP_TYPE.INPUT);
    assert.equal(last().inputValue, 'Old');
    assert.equal(last().options.placeholder, 'Name');
    withPopup(null);
    assert.equal(await showCustomDialog({ type: 'prompt' }), null);
    withPopup(false);
    assert.equal(await showCustomDialog({ type: 'prompt' }), null);
});

test('htmlMessage is passed as HTML, message is escaped', async () => {
    const last = withPopup(POPUP_RESULT.AFFIRMATIVE);
    await showCustomDialog({ type: 'confirm', htmlMessage: '<b>Sure?</b>' });
    assert.equal(last().content, '<b>Sure?</b>');
});

test('delayConfirm keeps OK from closing until the countdown ends', async () => {
    const last = withPopup(POPUP_RESULT.AFFIRMATIVE);
    await showCustomDialog({ type: 'confirm', title: 'Wipe', delayConfirm: 3 });
    const p = last();
    p.options.onOpen(p);
    assert.ok(p.okButton.classList.has('disabled'));
    assert.match(p.okButton.textContent, /\(3\)$/);
    p.result = POPUP_RESULT.AFFIRMATIVE;
    assert.equal(p.options.onClosing(p), false, 'OK refused during the countdown');
    p.result = POPUP_RESULT.CANCELLED;
    assert.equal(p.options.onClosing(p), true, 'cancel always closes');
    p.options.onClose(p);
});
