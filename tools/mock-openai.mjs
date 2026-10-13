// Minimal OpenAI-compatible endpoint for benchmarks: streams synthetic text at a fixed rate
// so every run streams the same thing. No keys, no network beyond localhost.
//
//   node tools/mock-openai.mjs [--port 5005] [--tps 40] [--tokens 600] [--reasoning 0] [--md 1]
//
// In SillyTavern: Chat Completion > Custom (OpenAI-compatible), URL http://127.0.0.1:5005/v1,
// model "mock-model". --tps is chunks per second (one ~4-char token per chunk);
// --reasoning N streams N reasoning tokens first as delta.reasoning_content.
// Text Completion > Generic (OpenAI-compatible) at http://127.0.0.1:5005 uses /v1/completions;
// each request logs the start of its prompt, temperature and stop strings.

import fs from 'node:fs';
import http from 'node:http';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
    return acc;
}, []));
const PORT = Number(args.port || 5005);
const TPS = Number(args.tps || 40);
const TOKENS = Number(args.tokens || 600);
const REASONING = Number(args.reasoning || 0);
const MD = args.md === '1';
// --tool 1: a reply that calls get_char_info and then keeps writing (as models do when nothing
// stops them), until the request carries tool results; then plain text. Logs when the client
// closes a stream before it finished, which is how a tool-call cut-off shows up here.
const TOOL = args.tool === '1';
// --reply-file <path>: every reply streams this file's text (re-read per request), e.g.
// tools/ui-screens-reply.md, which proposes one edit of each kind for the UI screenshots.
const REPLY_FILE = args['reply-file'] || '';
const TOOL_CALL ='Greeting 1 is only a preview, so I will read it first.\n```tool_call\n{"name": "get_char_info", "input": {"fields": ["alternate_greetings"], "greeting_ids": [1]}}\n```\n\n';

const WORDS = ('the lantern road bends north past the ford where the ferryman waits and the river runs ' +
    'high with spring rain so we take the ridge path instead keeping the map dry under oilcloth ' +
    'while the wind picks up and the light fades toward evening').split(' ');
// --md 1: the same words arranged as a structured reply (headings, lists, tables, code),
// cut into ~4-character chunks, so renderers see block boundaries mid-stream.
const markdown = n => {
    const prose = text(n).join('');
    const sentences = prose.split(/(?<=\.)\s+/);
    const blocks = [];
    for (let i = 0; i < sentences.length; i += 6) {
        const part = sentences.slice(i, i + 6);
        switch ((i / 6) % 5) {
            case 0: blocks.push(`## Section ${i / 6 + 1}\n\n${part.join(' ')}`); break;
            case 1: blocks.push(part.map(s => `- **${s.split(' ')[0]}** ${s}`).join('\n')); break;
            case 2: blocks.push(['| Item | Note |', '|---|---|', ...part.map((s, j) => `| ${j + 1} | ${s} |`)].join('\n')); break;
            case 3: blocks.push('```js\n' + part.map((s, j) => `const line${j} = ${JSON.stringify(s)};`).join('\n') + '\n```'); break;
            default: blocks.push(part.join(' '));
        }
    }
    return blocks.join('\n\n').match(/[\s\S]{1,4}/g) || [];
};

const text = n => {
    const out = [];
    for (let i = 0; i < n; i++) {
        let w = WORDS[(i * 7 + 3) % WORDS.length];
        if (i % 18 === 0) w = w[0].toUpperCase() + w.slice(1);
        out.push(w + (i % 18 === 17 ? '.' : '') + (i % 72 === 71 ? '\n\n' : ' '));
    }
    return out;
};

const send = (res, code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
};

// Legacy text completion: a prompt string in, choices[0].text out, streamed as SSE.
function completeText(res, body, toks, started) {
    const prompt = String(body.prompt ?? '');
    console.log(`${new Date().toISOString()} text ${body.stream ? 'stream' : 'block'} model=${body.model} promptChars=${prompt.length} temperature=${body.temperature} max_tokens=${body.max_tokens} stop=${JSON.stringify(body.stop || [])}`);
    console.log(`  prompt start: ${JSON.stringify(prompt.slice(0, 240))}`);
    console.log(`  prompt end:   ${JSON.stringify(prompt.slice(-160))}`);
    const chunk = (t, finish = null) => ({ id: `cmpl-bench-${started}`, object: 'text_completion', created: Math.floor(started / 1000), model: 'mock-model', choices: [{ index: 0, text: t, finish_reason: finish }] });
    if (!body.stream) return send(res, 200, { ...chunk(toks.join(''), 'stop'), usage: { prompt_tokens: 0, completion_tokens: toks.length, total_tokens: toks.length } });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    let i = 0;
    const timer = setInterval(() => {
        if (res.destroyed) return clearInterval(timer);
        const due = Math.min(toks.length, Math.floor((Date.now() - started) / 1000 * TPS) + 1);
        if (i < toks.length) { for (; i < due; i++) res.write(`data: ${JSON.stringify(chunk(toks[i]))}\n\n`); return; }
        clearInterval(timer);
        res.write(`data: ${JSON.stringify(chunk('', 'stop'))}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    }, Math.max(10, 1000 / TPS));
    res.on('close', () => clearInterval(timer));
}

http.createServer((req, res) => {
    const url = req.url.replace(/^\/v1/, '');
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }); return res.end(); }
    if (req.method === 'GET' && url.startsWith('/models')) {
        return send(res, 200, { object: 'list', data: [{ id: 'mock-model', object: 'model', owned_by: 'bench' }] });
    }
    const isText = url.startsWith('/completions');
    if (req.method !== 'POST' || !(isText || url.startsWith('/chat/completions'))) return send(res, 404, { error: 'not found' });

    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
        let body = {};
        try { body = JSON.parse(raw || '{}'); } catch (_) { /* bad JSON: treat as non-streaming defaults */ }
        const id = `chatcmpl-bench-${Date.now()}`;
        const reasoningToks = text(REASONING);
        let contentToks = (MD ? markdown : text)(Math.min(TOKENS, body.max_tokens || TOKENS));
        if (REPLY_FILE) contentToks = fs.readFileSync(REPLY_FILE, 'utf8').match(/[\s\S]{1,4}/g) || [];
        if (TOOL) {
            const hasResults = JSON.stringify(body.messages || body.prompt || '').includes('<tool_results>');
            contentToks = hasResults
                ? ('ROUND-TWO with the results. ' + contentToks.join('')).match(/[\s\S]{1,4}/g)
                : (TOOL_CALL + 'PREMATURE-REVIEW written without the results: ' + contentToks.join('')).match(/[\s\S]{1,4}/g);
        }
        const started = Date.now();
        if (isText) return completeText(res, body, contentToks, started);
        console.log(`${new Date().toISOString()} ${body.stream ? 'stream' : 'block'} model=${body.model} msgs=${body.messages?.length ?? 0} promptChars=${JSON.stringify(body.messages || []).length} max_tokens=${body.max_tokens}`);

        if (!body.stream) {
            return send(res, 200, {
                id, object: 'chat.completion', created: Math.floor(started / 1000), model: 'mock-model',
                choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: contentToks.join(''), ...(REASONING ? { reasoning_content: reasoningToks.join('') } : {}) } }],
                usage: { prompt_tokens: 0, completion_tokens: contentToks.length, total_tokens: contentToks.length },
            });
        }

        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
        const queue = [...reasoningToks.map(t => ({ reasoning_content: t })), ...contentToks.map(t => ({ content: t }))];
        let i = 0;
        // Timers on Windows tick no faster than ~15 ms, so send every chunk that is due by
        // elapsed time instead of one per tick; otherwise high --tps rates are silently capped.
        const timer = setInterval(() => {
            if (res.destroyed) return clearInterval(timer);
            const due = Math.min(queue.length, Math.floor((Date.now() - started) / 1000 * TPS) + 1);
            if (i < queue.length) {
                for (; i < due; i++) {
                    const delta = i === 0 ? { role: 'assistant', ...queue[i] } : queue[i];
                    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(started / 1000), model: 'mock-model', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
                }
                return;
            }
            clearInterval(timer);
            res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(started / 1000), model: 'mock-model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        }, Math.max(10, 1000 / TPS));
        // res, not req: req 'close' fires once the request body is read, which would cancel at once.
        res.on('close', () => {
            clearInterval(timer);
            if (i < queue.length) console.log(`  client closed the stream after ${i}/${queue.length} chunks`);
        });
    });
}).listen(PORT, '127.0.0.1', () => console.log(`mock-openai on http://127.0.0.1:${PORT}/v1  tps=${TPS} tokens=${TOKENS} reasoning=${REASONING}`));
