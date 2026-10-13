// Screenshots every Copilot screen from a running SillyTavern, for the UI map (docs/ui-map)
// and the README. It logs in as the test user and refuses to run as anyone else, so only
// synthetic data (tools/bench-fixtures.mjs) ends up in the images.
//
//   node tools/ui-screens.mjs [--st http://localhost:8001] [--user fresh-user-test]
//                             [--out docs/screens] [--only id,id] [--chrome <path>] [--cards 1]
//
// Each screen is opened through the UI the way a person would (clicks, not internal calls),
// so a capture that fails usually means the screen or its selector changed: update the
// step here and the matching node in docs/ui-inventory.json together.
// Proposal cards (--cards 1) need a reply that contains edit blocks: run the mock with
// `--reply-file tools/ui-screens-reply.md` and select the "Bench Mock" connection profile.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
    return acc;
}, []));
const ST = (args.st || 'http://localhost:8001').replace(/\/+$/, '');
const USER = args.user || 'fresh-user-test';
const OUT = args.out || 'docs/screens';
const ONLY = args.only ? new Set(args.only.split(',')) : null;
const CHROME = args.chrome || process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const VIEW = { width: 1280, height: 900, deviceScaleFactor: 1.5 };

fs.mkdirSync(OUT, { recursive: true });
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-screens-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profileDir, defaultViewport: VIEW, args: ['--no-first-run'] });
const page = await browser.newPage();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const captured = [];
const failed = [];
// Script errors while the screens are opened: a capture run doubles as a console check.
const pageErrors = [];
page.on('pageerror', e => {
    const frame = String(e.stack || '').split('\n').find(l => /^\s+at /.test(l))?.trim().replace(ST, '') || '';
    pageErrors.push(e.message.split('\n')[0] + (frame ? ` (${frame})` : ''));
});
page.on('console', m => {
    if (m.type() !== 'error' || /Failed to load resource/.test(m.text())) return;
    const at = m.location()?.url ? ` (${m.location().url.replace(ST, '')}:${m.location().lineNumber ?? '?'})` : '';
    pageErrors.push(m.text().split('\n')[0] + at);
});

async function login() {
    await page.goto(`${ST}/login`, { waitUntil: 'networkidle2' });
    const status = await page.evaluate(async handle => {
        const { token } = await (await fetch('/csrf-token')).json();
        const res = await fetch('/api/users/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
            body: JSON.stringify({ handle }),
        });
        return res.status;
    }, USER);
    if (status !== 200) throw new Error(`login as ${USER} failed: HTTP ${status}`);
    await page.goto(`${ST}/`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => window.SillyTavern?.getContext?.()?.characters?.length > 0 && document.getElementById('scp-window'), { timeout: 90000 });
    const me = await page.evaluate(async () => (await (await fetch('/api/users/me', { headers: SillyTavern.getContext().getRequestHeaders() })).json()).handle);
    if (me !== USER) throw new Error(`logged in as "${me}", not "${USER}": refusing to capture`);
    await sleep(1500);
}

const click = async sel => { await page.waitForSelector(sel, { visible: true, timeout: 8000 }); await page.click(sel); await sleep(350); };
const clickText = async (sel, text) => {
    const ok = await page.evaluate((s, t) => {
        const el = [...document.querySelectorAll(s)].find(e => e.textContent.trim() === t && e.offsetParent);
        el?.click();
        return !!el;
    }, sel, text);
    if (!ok) throw new Error(`no visible ${sel} reading "${text}"`);
    await sleep(350);
};
const press = async key => { await page.keyboard.press(key); await sleep(250); };

// Screenshot of one element (plus padding). `tall` lifts the height limits of the element
// and its scrolling body so a long pane is captured whole instead of its first screen; its
// overlay is pinned to the top so the pane grows downward, and long textareas are capped.
async function shot(id, sel, { pad = 8, tall = null } = {}) {
    if (ONLY && !ONLY.has(id)) return;
    try {
        if (tall) {
            const h = await page.evaluate((s, body) => {
                const el = document.querySelector(s);
                const b = el.querySelector(body) || el;
                const keep = (x, css) => { if (!x) return; x.dataset.scpShotStyle ??= x.getAttribute('style') || ''; Object.assign(x.style, css); };
                for (const x of [el, ...el.querySelectorAll(body)]) keep(x, { maxHeight: 'none', height: 'auto', overflow: 'visible' });
                keep(el.parentElement, { alignItems: 'flex-start', paddingTop: '16px' });
                el.querySelectorAll('textarea').forEach(t => keep(t, { height: '110px', maxHeight: '110px', minHeight: '0', overflow: 'hidden' }));
                window.scrollTo(0, 0);
                return Math.ceil(el.getBoundingClientRect().bottom);
            }, sel, tall);
            await page.setViewport({ ...VIEW, height: Math.max(VIEW.height, h + 80) });
            await sleep(300);
        }
        const el = await page.waitForSelector(sel, { visible: true, timeout: 8000 });
        const box = await el.boundingBox();
        const vp = page.viewport();
        const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
        const file = path.join(OUT, `${id}.jpg`);
        await page.screenshot({ path: file, type: 'jpeg', quality: 86, clip: { x, y, width: Math.min(box.width + pad * 2, vp.width - x), height: Math.min(box.height + pad * 2, vp.height - y) } });
        captured.push({ id, file: file.replace(/\\/g, '/'), width: Math.round(box.width), height: Math.round(box.height) });
    } catch (e) {
        failed.push({ id, error: e.message.split('\n')[0] });
    } finally {
        if (tall) {
            await page.evaluate(() => document.querySelectorAll('[data-scp-shot-style]').forEach(x => { x.setAttribute('style', x.dataset.scpShotStyle); delete x.dataset.scpShotStyle; }));
            await page.setViewport(VIEW);
            await sleep(200);
        }
    }
}

// Runs one capture step; a failure is recorded and the next step starts from a clean page.
async function step(name, fn) {
    try { await fn(); } catch (e) {
        failed.push({ id: name, error: e.message.split('\n')[0] });
        await page.keyboard.press('Escape').catch(() => {});
    }
}

await login();

await step('setup', async () => {
    await page.evaluate(async () => {
        const ctx = SillyTavern.getContext();
        const id = ctx.characters.findIndex(c => c.name === 'Bench Ranger');
        if (id >= 0 && ctx.characterId !== id) await ctx.selectCharacterById(id);
    });
    await sleep(2500);
});

// Hides SillyTavern's chat behind the translucent Copilot window, so the captures show
// Copilot alone; restored before the SillyTavern screens.
const stBackdrop = on => page.evaluate(hide => {
    for (const id of ['sheld', 'bg1', 'bg_custom']) {
        const el = document.getElementById(id);
        if (el) el.style.visibility = hide ? 'hidden' : '';
    }
    document.body.style.background = hide ? '#15151a' : '';
}, on);
// DOM click for SillyTavern's own buttons, which can sit under Copilot's window.
const domClick = async sel => { await page.evaluate(s => document.querySelector(s)?.click(), sel); await sleep(500); };

// ── SillyTavern entry points ──
await step('st-wand', async () => {
    await domClick('#extensionsMenuButton');
    await shot('st-wand-menu', '#extensionsMenu');
    await domClick('#scp-wand-btn');
    await sleep(600);
});
await step('st-drawer', async () => {
    // The Extensions panel remembers whether it was open: open it only if it is closed.
    const isOpen = () => page.evaluate(() => !!document.querySelector('.st-copilot-settings')?.offsetParent);
    if (!await isOpen()) await domClick('#extensions-settings-button .drawer-toggle');
    await sleep(600);
    await page.evaluate(() => {
        const root = document.querySelector('.st-copilot-settings');
        root.querySelectorAll('.inline-drawer-content').forEach(c => { c.style.display = 'block'; });
        root.scrollIntoView();
    });
    await sleep(500);
    await shot('st-drawer', '.st-copilot-settings', { tall: '.inline-drawer-content' });
    await page.evaluate(() => document.querySelectorAll('.st-copilot-settings .inline-drawer-content').forEach(c => { c.style.display = ''; }));
    await domClick('#extensions-settings-button .drawer-toggle');
});

// ── Copilot window ──
await step('window', async () => {
    await stBackdrop(true);
    await page.evaluate(() => {
        const w = document.getElementById('scp-window');
        if (getComputedStyle(w).display === 'none') document.getElementById('scp-wand-btn')?.click();
        Object.assign(w.style, { left: '24px', top: '24px', width: '560px', height: '840px' });
    });
    await sleep(800);
    await shot('window', '#scp-window', { pad: 0 });
});
await step('window-parts', async () => {
    await shot('window-header', '#scp-window .scp-header', { pad: 0 });
    await shot('window-toolbar', '#scp-window .scp-toolbar', { pad: 0 });
    // :last-of-type matches by tag, not class, so mark the last message of each role instead.
    await page.evaluate(() => {
        for (const role of ['assistant', 'user']) {
            const all = document.querySelectorAll(`#scp-messages .scp-msg-${role}`);
            all[all.length - 1]?.setAttribute('data-scp-shot', role);
        }
    });
    for (const role of ['assistant', 'user']) {
        await page.hover(`[data-scp-shot="${role}"] .scp-msg-body`);
        await sleep(400);
        await shot(`message-${role}`, `[data-scp-shot="${role}"]`, { pad: 4 });
    }
    // A tool card from an earlier reply in the session (any tool round leaves one).
    await page.evaluate(() => {
        const all = document.querySelectorAll('#scp-messages .scp-tool-call-item');
        all[all.length - 1]?.setAttribute('data-scp-shot', 'tool');
        all[all.length - 1]?.scrollIntoView({ block: 'center' });
    });
    await sleep(300);
    await shot('tool-call', '[data-scp-shot="tool"]', { pad: 4 });
});
await step('session-menu', async () => {
    await click('#scp-sess-trigger');
    await shot('session-menu', '#scp-window', { pad: 0 });
    await click('#scp-new-sess-btn');
    await shot('session-new-dialog', '.scp-dialog-overlay .scp-dialog-box');
    await click('.scp-dialog-overlay .scp-dialog-cancel');
});
await step('main-menu', async () => {
    await click('#scp-menu-trigger');
    await shot('main-menu', '#scp-window', { pad: 0 });
    await press('Escape');
    await page.mouse.click(900, 860);
});
await step('search', async () => {
    await click('#scp-search-btn');
    await page.type('#scp-search-input', 'lantern');
    await sleep(500);
    await shot('search', '#scp-window', { pad: 0 });
    await click('#scp-search-close');
});
await step('quick-prompts', async () => {
    await click('#scp-qp-toggle-btn');
    await shot('quick-prompts-bar', '#scp-window', { pad: 0 });
    await click('#scp-qp-toggle-btn');
});
await step('starred', async () => {
    await click('#scp-fav-btn');
    await shot('starred-panel', '#scp-window', { pad: 0 });
    await click('#scp-fav-close');
});
await step('inspector', async () => {
    await click('#scp-inspect-btn');
    await sleep(800);
    await shot('inspector-formatted', '#scp-ctx-modal .scp-modal');
    await click('#scp-ctx-modal .scp-modal-tab[data-tab="json"]');
    await shot('inspector-json', '#scp-ctx-modal .scp-modal');
    await click('#scp-ctx-modal .scp-modal-tab[data-tab="sent"]');
    await shot('inspector-sent', '#scp-ctx-modal .scp-modal');
    await click('#scp-modal-close');
});
await step('picker', async () => {
    await click('#scp-pick-btn');
    await sleep(600);
    await shot('chat-picker', '#scp-picker-overlay .scp-modal');
    await click('#scp-picker-close');
});

// ── Settings overlay ──
const TABS = ['global', 'interface', 'prompts', 'session', 'memory', 'tools', 'stats'];
await step('settings', async () => {
    await click('#scp-ext-settings-btn');
    for (const tab of TABS) {
        await click(`.scp-sp-tab[data-sptab="${tab}"]`);
        await shot(`settings-${tab}`, '#scp-settings-overlay .scp-settings-panel', { tall: '.scp-sp-body' });
    }
    await click('.scp-sp-tab[data-sptab="interface"]');
    await click('#scp-sp-open-changelog');
    await sleep(400);
    await shot('whats-new', '#scp-changelog-modal .scp-modal');
    await click('#scp-changelog-close');
    await domClick('#scp-sp-close');
});

// ── Managers ──
await step('lorebook-manager', async () => {
    await click('#scp-menu-trigger');
    await click('#scp-menu-lb-item');
    await sleep(1200);
    await shot('lorebook-manager', '#scp-lb-overlay .scp-lb-panel');
    await click('#scp-lb-book-list .scp-lb-book-item');
    await sleep(900);
    await shot('lorebook-entries', '#scp-lb-overlay .scp-lb-panel');
    await page.evaluate(() => document.querySelector('#scp-lb-entries > :not(.scp-lb-empty-state)')?.click());
    await sleep(700);
    await shot('lorebook-entry-detail', '#scp-lb-overlay .scp-lb-panel');
    await click('#scp-lb-close');
});
await step('character-manager', async () => {
    await click('#scp-menu-trigger');
    await click('#scp-menu-char-item');
    await sleep(1000);
    const pick = name => page.evaluate(n => [...document.querySelectorAll('#scp-char-list > *')].find(e => e.textContent.includes(n))?.click(), name);
    await pick(USER);
    await sleep(700);
    await shot('character-manager-persona', '#scp-char-overlay .scp-char-panel');
    await pick('Bench Ranger');
    await sleep(900);
    await shot('character-manager', '#scp-char-overlay .scp-char-panel');
    await shot('character-manager-full', '#scp-char-overlay .scp-char-panel', { tall: '.scp-char-body, .scp-char-main' });
    await clickText('.scp-char-tab', 'Overrides');
    await shot('character-manager-overrides', '#scp-char-overlay .scp-char-panel');
    await click('#scp-char-close');
});
await step('prompt-manager', async () => {
    await click('#scp-menu-trigger');
    await click('#scp-menu-pm-item');
    await sleep(1000);
    await shot('prompt-manager', '#scp-pm-overlay .scp-char-panel');
    await page.evaluate(() => [...document.querySelectorAll('#scp-pm-list > *')].find(e => !/slot/i.test(e.textContent))?.click());
    await sleep(700);
    await shot('prompt-manager-edit', '#scp-pm-overlay .scp-char-panel');
    await click('#scp-pm-close');
});

// ── Window states ──
await step('ghost', async () => {
    await click('#scp-ghost-btn');
    await sleep(500);
    await shot('ghost-mode', '#scp-window', { pad: 0 });
    await page.evaluate(() => document.getElementById('scp-ghost-btn').click());
    await sleep(400);
});
await step('dock', async () => {
    await click('#scp-min-btn');
    await sleep(600);
    await shot('dock-icon', '#scp-dock-icon', { pad: 24 });
    await click('#scp-dock-icon');
    await sleep(600);
});

// ── Proposal cards (need the mock reply, see the header) ──
await step('cards', async () => {
    // Sends a real Copilot message through the active connection: opt in, and check that the
    // connection is the mock so it costs nothing.
    if (!('cards' in args)) return;
    const profile = await page.evaluate(() => {
        const cm = SillyTavern.getContext().extensionSettings.connectionManager;
        return cm?.profiles?.find(p => p.id === cm.selectedProfile)?.name || '';
    });
    if (!/mock/i.test(profile)) throw new Error(`connection profile is "${profile}", not the mock: not sending`);
    await page.evaluate(() => {
        const ta = document.getElementById('scp-input');
        ta.value = 'UI screens: propose one of each edit.';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('scp-send-btn').click();
    });
    await page.waitForFunction(() => document.getElementById('scp-thinking-bar')?.style.display === 'none' && document.querySelector('.scp-lb-proposal-card'), { timeout: 60000 });
    await sleep(800);
    const cards = [
        ['card-lorebook', '.scp-lb-proposal-card:not(.scp-char-proposal-card):not(.scp-chat-proposal-card):not(.scp-pm-proposal-card):not(.scp-char-creation-card)'],
        ['card-character', '.scp-char-proposal-card'],
        ['card-character-create', '.scp-char-creation-card'],
        ['card-chat', '.scp-chat-proposal-card'],
        ['card-prompt', '.scp-pm-proposal-card'],
    ];
    for (const [id, sel] of cards) {
        await page.evaluate((s, i) => {
            const all = document.querySelectorAll(`#scp-messages ${s}`);
            const el = all[all.length - 1];
            el?.setAttribute('data-scp-shot', i);
            el?.scrollIntoView({ block: 'center' });
        }, sel, id);
        await sleep(300);
        await shot(id, `[data-scp-shot="${id}"]`, { pad: 4 });
    }
});

await browser.close();
fs.rmSync(profileDir, { recursive: true, force: true });
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ captured: new Date().toISOString(), st: ST, user: USER, screens: captured }, null, 2));
console.log(`captured ${captured.length} screens into ${OUT}`);
if (failed.length) { console.log('failed:'); for (const f of failed) console.log(`  ${f.id}: ${f.error}`); }
if (pageErrors.length) { console.log('page errors:'); for (const e of [...new Set(pageErrors)]) console.log(`  ${e}`); }
