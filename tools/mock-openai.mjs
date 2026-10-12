// Minimal OpenAI-compatible endpoint for benchmarks: streams synthetic text at a fixed rate
// so every run streams the same thing. No keys, no network beyond localhost.
//
//   node tools/mock-openai.mjs [--port 5005] [--tps 40] [--tokens 600] [--reasoning 0]
//
// In SillyTavern: Chat Completion > Custom (OpenAI-compatible), URL http://127.0.0.1:5005/v1,
// model "mock-model". --tps is chunks per second (one ~4-char token per chunk);
// --reasoning N streams N reasoning tokens first as delta.reasoning_content.

import http from 'node:http';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
    return acc;
}, []));
const PORT = Number(args.port || 5005);
const TPS = Number(args.tps || 40);
const TOKENS = Number(args.tokens || 600);
const REASONING = Number(args.reasoning || 0);

const WORDS = ('the lantern road bends north past the ford where the ferryman waits and the river runs ' +
    'high with spring rain so we take the ridge path instead keeping the map dry under oilcloth ' +
    'while the wind picks up and the light fades toward evening').split(' ');
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

http.createServer((req, res) => {
    const url = req.url.replace(/^\/v1/, '');
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }); return res.end(); }
    if (req.method === 'GET' && url.startsWith('/models')) {
        return send(res, 200, { object: 'list', data: [{ id: 'mock-model', object: 'model', owned_by: 'bench' }] });
    }
    if (req.method !== 'POST' || !url.startsWith('/chat/completions')) return send(res, 404, { error: 'not found' });

    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
        let body = {};
        try { body = JSON.parse(raw || '{}'); } catch (_) { /* bad JSON: treat as non-streaming defaults */ }
        const id = `chatcmpl-bench-${Date.now()}`;
        const reasoningToks = text(REASONING);
        const contentToks = text(Math.min(TOKENS, body.max_tokens || TOKENS));
        const started = Date.now();
        console.log(`${new Date().toISOString()} ${body.stream ? 'stream' : 'block'} msgs=${body.messages?.length ?? 0} promptChars=${JSON.stringify(body.messages || []).length}`);

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
        const timer = setInterval(() => {
            if (res.destroyed) return clearInterval(timer);
            if (i < queue.length) {
                const delta = i === 0 ? { role: 'assistant', ...queue[i] } : queue[i];
                res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(started / 1000), model: 'mock-model', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
                i++;
                return;
            }
            clearInterval(timer);
            res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(started / 1000), model: 'mock-model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        }, 1000 / TPS);
        // res, not req: req 'close' fires once the request body is read, which would cancel at once.
        res.on('close', () => clearInterval(timer));
    });
}).listen(PORT, '127.0.0.1', () => console.log(`mock-openai on http://127.0.0.1:${PORT}/v1  tps=${TPS} tokens=${TOKENS} reasoning=${REASONING}`));
