// ST-Copilot performance bench. Paste into the browser console on a SillyTavern tab.
// Not loaded by the extension (manifest.json only loads index.js and style.css).
//
// Needs Chrome 123+ (long-animation-frame). Each scenario records:
//   - long animation frames (LoAF): count, total/blocking time, forced style+layout,
//     and script time split into ST-Copilot vs everything else, plus per owner
//     (each extension by folder, ST core, other)
//   - interactions (event timing, >= 16ms): worst and p75 duration
//   - frame pacing via requestAnimationFrame: p50/p95 frame time, frames over 20ms
//
// Usage:
//   await scpBench.idle()                  // 10s, touch nothing
//   await scpBench.settings(5)             // open/close Copilot settings 5x (automated)
//   await scpBench.typing()                // types ~60 chars into the Copilot input (automated)
//   await scpBench.stGenerate()            // ST streams one main-chat reply, then deletes it
//   await scpBench.copilotSend()           // Copilot streams one reply (window must be open)
//   scpBench.start('switch');  ...act...  scpBench.stop()   // anything manual
//   scpBench.row()                         // last result, flattened; scpBench.table() to compare
//
// Load it from the extension folder instead of pasting:
//   document.head.append(Object.assign(document.createElement('script'),
//     { src: '/scripts/extensions/third-party/ST-Copilot/tools/perf-bench.js?' + Date.now() }))
//
// Compare runs with the Copilot window open vs closed, and Performance Mode on vs off.

(() => {
    const COPILOT = /ST-Copilot/i;
    const pct = (arr, p) => {
        if (!arr.length) return 0;
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
    };
    const r1 = n => Math.round(n * 10) / 10;
    // Who a script belongs to: "ext:<folder>" for extensions (third-party or built-in),
    // "st-core" for the rest of /scripts and /lib, "other" for anything else (inline, eval).
    const ownerOf = url => {
        if (!url) return 'other';
        const path = (() => { try { return new URL(url, location.href).pathname; } catch (_) { return url; } })();
        const ext = path.match(/\/scripts\/extensions\/(?:third-party\/)?([^/]+)\//);
        if (ext) return `ext:${decodeURIComponent(ext[1])}`;
        if (/^\/(scripts|lib)\/|^\/script\.js$|^\/lib\.js$/.test(path)) return 'st-core';
        return 'other';
    };
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    let run = null;

    function onLoaf(list) {
        if (!run) return;
        for (const f of list.getEntries()) run.loafs.push(f);
    }
    function onEvent(list) {
        if (!run) return;
        for (const e of list.getEntries()) if (e.interactionId) run.events.push(e);
    }
    const loafObs = new PerformanceObserver(onLoaf);
    const evObs = new PerformanceObserver(onEvent);
    try { loafObs.observe({ type: 'long-animation-frame', buffered: false }); }
    catch (e) { console.warn('[scpBench] long-animation-frame unsupported; need Chrome 123+'); }
    try { evObs.observe({ type: 'event', durationThreshold: 16, buffered: false }); }
    catch (e) { console.warn('[scpBench] event timing unsupported'); }

    // Each run owns its loop: a frame callback from a finished run must not keep sampling
    // into the next one, or two loops interleave and the frame times halve.
    function rafLoop(owner) {
        if (run !== owner) return;
        const now = performance.now();
        if (owner.lastRaf) owner.frames.push(now - owner.lastRaf);
        owner.lastRaf = now;
        requestAnimationFrame(() => rafLoop(owner));
    }

    function start(label) {
        if (run) stop();
        run = { label, t0: performance.now(), loafs: [], events: [], frames: [], lastRaf: 0 };
        const owner = run;
        requestAnimationFrame(() => rafLoop(owner));
        console.log(`[scpBench] recording "${label}"`);
    }

    function stop() {
        if (!run) return null;
        // Pull anything the observers have queued but not yet delivered.
        onLoaf({ getEntries: () => loafObs.takeRecords() });
        onEvent({ getEntries: () => evObs.takeRecords() });
        const r = run; run = null;
        const secs = (performance.now() - r.t0) / 1000;

        let loafMs = 0, blockMs = 0, forcedMs = 0, copilotScriptMs = 0, otherScriptMs = 0, renderMs = 0;
        const bySource = {};
        const byOwner = {};
        for (const f of r.loafs) {
            loafMs += f.duration;
            blockMs += f.blockingDuration || 0;
            if (f.renderStart) renderMs += (f.startTime + f.duration) - f.renderStart;
            for (const s of f.scripts || []) {
                forcedMs += s.forcedStyleAndLayoutDuration || 0;
                const isCp = COPILOT.test(s.sourceURL || '');
                if (isCp) copilotScriptMs += s.duration; else otherScriptMs += s.duration;
                const key = `${isCp ? 'COPILOT ' : ''}${(s.sourceURL || '?').split('/').slice(-2).join('/')} :: ${s.invoker || s.invokerType || '?'}`;
                const b = bySource[key] ||= { ms: 0, forcedMs: 0, n: 0 };
                b.ms += s.duration; b.forcedMs += s.forcedStyleAndLayoutDuration || 0; b.n++;
                const o = byOwner[ownerOf(s.sourceURL)] ||= { ms: 0, forcedMs: 0, n: 0 };
                o.ms += s.duration; o.forcedMs += s.forcedStyleAndLayoutDuration || 0; o.n++;
            }
        }
        const evDur = r.events.map(e => e.duration);
        const summary = {
            label: r.label,
            secs: r1(secs),
            loafs: r.loafs.length,
            loafMs: Math.round(loafMs),
            blockingMs: Math.round(blockMs),
            renderMs: Math.round(renderMs),
            forcedLayoutMs: Math.round(forcedMs),
            copilotScriptMs: Math.round(copilotScriptMs),
            otherScriptMs: Math.round(otherScriptMs),
            interactions: evDur.length,
            worstInteractionMs: Math.round(Math.max(0, ...evDur)),
            p75InteractionMs: Math.round(pct(evDur, 75)),
            frameP50: r1(pct(r.frames, 50)),
            frameP95: r1(pct(r.frames, 95)),
            framesOver20ms: r.frames.filter(f => f > 20).length,
            frames: r.frames.length,
        };
        const top = Object.entries(bySource).sort((a, b) => b[1].ms - a[1].ms).slice(0, 8)
            .map(([k, v]) => ({ script: k, ms: Math.round(v.ms), forcedMs: Math.round(v.forcedMs), n: v.n }));
        const owners = Object.entries(byOwner).sort((a, b) => b[1].ms - a[1].ms)
            .map(([k, v]) => ({ owner: k, ms: Math.round(v.ms), forcedMs: Math.round(v.forcedMs), n: v.n }));
        api.results.push({ ...summary, top, owners });
        console.log(`[scpBench] "${r.label}"`);
        console.table([summary]);
        if (owners.length) console.table(owners);
        if (top.length) console.table(top);
        return summary;
    }

    async function idle(secs = 10) {
        start(`idle ${secs}s`);
        await sleep(secs * 1000);
        return stop();
    }

    async function settings(times = 5) {
        const openBtn = document.getElementById('scp-ext-settings-btn');
        if (!openBtn) { console.warn('[scpBench] open the Copilot window first (settings button lives in it)'); return null; }
        start(`settings open/close x${times}`);
        for (let i = 0; i < times; i++) {
            openBtn.click();
            await sleep(800);  // let the open animation and lazy imports finish
            document.getElementById('scp-sp-close')?.click();
            await sleep(400);
        }
        return stop();
    }

    async function typing(text = 'How does the second act set up the betrayal in the final scene?', delay = 60) {
        const input = document.getElementById('scp-input');
        if (!input || input.offsetParent === null) { console.warn('[scpBench] open the Copilot window first'); return null; }
        const before = input.value;
        start(`typing ${text.length} chars`);
        input.focus();
        for (const ch of text) {
            input.value += ch;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(delay);
        }
        await sleep(1500);  // let the debounced token count finish
        const s = stop();
        input.value = before;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return s;
    }

    // Asks SillyTavern itself for a reply (main chat), records until it finishes, then
    // deletes the reply so repeated runs keep the chat the same size.
    async function stGenerate(label = 'st-stream', timeoutMs = 60000) {
        const ctx = SillyTavern.getContext();
        const before = ctx.chat.length;
        const done = new Promise(r => {
            const h = () => { ctx.eventSource.removeListener(ctx.eventTypes.GENERATION_ENDED, h); r(); };
            ctx.eventSource.on(ctx.eventTypes.GENERATION_ENDED, h);
            setTimeout(r, timeoutMs);
        });
        start(label);
        ctx.generate('normal');
        await done;
        await sleep(500);
        const s = stop();
        if (SillyTavern.getContext().chat.length > before) await SillyTavern.getContext().deleteLastMessage();
        return s;
    }

    // Sends one Copilot message and records until Copilot stops generating.
    async function copilotSend(text = 'Summarize the open threads so far.', label = 'copilot-stream', timeoutMs = 60000) {
        const input = document.getElementById('scp-input');
        const send = document.getElementById('scp-send-btn');
        if (!input || !send || input.offsetParent === null) { console.warn('[scpBench] open the Copilot window first'); return null; }
        const busy = () => send.disabled;  // setGeneratingState() disables send while generating
        start(label);
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        send.click();
        const t0 = performance.now();
        while (!busy() && performance.now() - t0 < 5000) await sleep(50);
        while (busy() && performance.now() - t0 < timeoutMs) await sleep(100);
        await sleep(800);
        return stop();
    }

    // The last result, flattened for quick reading (top owners only).
    function row(i = -1) {
        const { top, owners, ...s } = api.results.at(i) || {};
        return { ...s, owners: (owners || []).slice(0, 5) };
    }

    function table() {
        console.table(api.results.map(({ top, owners, ...s }) => s));
    }

    const api = { start, stop, idle, settings, typing, stGenerate, copilotSend, row, table, results: [] };
    window.scpBench = api;
    console.log('[scpBench] ready: scpBench.idle(), .settings(), .typing(), .start(label)/.stop(), .table()');
})();
