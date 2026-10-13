// In-page runner for the Copilot tool eval. Load it in the SillyTavern tab (test user only):
//   document.head.append(Object.assign(document.createElement('script'),
//     { src: '/scripts/extensions/third-party/ST-Copilot/tools/eval-runner.js?' + Date.now() }))
// then: scpEval.run(['g_unsent', ...], 'after')   // runs in the background
//       scpEval.status()                            // progress and per-scenario results
// Each scenario gets a fresh Copilot session named eval:<id>:<phase>; replies are scored offline
// by tools/eval-score.mjs. Nothing is applied: proposal cards are left untouched.

(() => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const state = { running: false, phase: null, queue: [], done: [], current: null, errors: [] };

    async function newSession(name) {
        document.getElementById('scp-new-sess-btn').click();
        await sleep(600);
        const d = [...document.querySelectorAll('.scp-dialog-overlay')].at(-1);
        d.querySelector('.scp-dialog-input').value = name;
        d.querySelector('.scp-dialog-ok').click();
        await sleep(1000);
    }

    // Generation error dialogs are closed and recorded so the next scenario starts clean.
    function closeErrorDialog() {
        const dlg = [...document.querySelectorAll('.scp-dialog-overlay, .scp-modal-overlay')].find(el => getComputedStyle(el).display !== 'none' && /Generation Error/.test(el.textContent));
        if (!dlg) return null;
        const text = dlg.textContent.replace(/\s+/g, ' ').slice(0, 300);
        (dlg.querySelector('.scp-dialog-ok, .scp-dialog-btn, button') || {}).click?.();
        return text;
    }

    const memoryCount = () => Object.keys(SillyTavern.getContext().extensionSettings.st_copilot?.memories || {}).length;

    async function runOne(scenario, phase) {
        const t0 = performance.now();
        await newSession(`eval:${scenario.id}:${phase}`);
        const memBefore = memoryCount();
        const input = document.getElementById('scp-input');
        const send = document.getElementById('scp-send-btn');
        input.value = scenario.prompt;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        send.click();
        while (!send.disabled && performance.now() - t0 < 5000) await sleep(100);
        // Tool rounds keep the send button disabled until the whole reply is done.
        while (send.disabled && performance.now() - t0 < 240000) await sleep(500);
        await sleep(1500);  // let the session save (debounced) happen
        const error = closeErrorDialog();
        return {
            id: scenario.id, phase, secs: Math.round((performance.now() - t0) / 100) / 10,
            timedOut: send.disabled, error,
            ...(scenario.id === 'memory' ? { memoryAdded: memoryCount() > memBefore } : {}),
        };
    }

    async function run(ids, phase) {
        if (state.running) return 'already running';
        const { SCENARIOS } = await import('/scripts/extensions/third-party/ST-Copilot/tools/eval-scenarios.mjs?' + Date.now());
        state.running = true; state.phase = phase; state.queue = ids.slice(); state.errors = [];
        (async () => {
            try {
                for (const id of ids) {
                    const s = SCENARIOS.find(x => x.id === id);
                    if (!s) { state.errors.push(`unknown scenario ${id}`); continue; }
                    state.current = id;
                    state.done.push(await runOne(s, phase));
                    state.queue.shift();
                }
            } catch (e) { state.errors.push(String(e)); }
            state.current = null; state.running = false;
        })();
        return `started ${ids.length} scenario(s), phase ${phase}`;
    }

    window.scpEval = { run, status: () => JSON.parse(JSON.stringify(state)) };
})();
