# Benchmark tools

Developer tools for measuring ST-Copilot's (and any extension's) runtime cost inside
SillyTavern. SillyTavern never loads anything in this folder; `manifest.json` only loads
`index.js` and `style.css`.

## perf-bench.js

Records long animation frames (with script time attributed per extension, ST core and
other), interaction latency and frame pacing while a scenario runs. Needs Chrome 123+.

Load it in the SillyTavern tab's console:

```js
document.head.append(Object.assign(document.createElement('script'),
    { src: '/scripts/extensions/third-party/ST-Copilot/tools/perf-bench.js?' + Date.now() }))
```

Then:

| Call | Scenario |
|---|---|
| `await scpBench.idle()` | 10 s without touching anything |
| `await scpBench.settings(5)` | open and close Copilot settings 5 times |
| `await scpBench.typing()` | type about 60 characters into the Copilot input |
| `await scpBench.stGenerate()` | SillyTavern streams one main-chat reply, then deletes it |
| `await scpBench.copilotSend()` | Copilot streams one reply |
| `scpBench.start('label')` ... `scpBench.stop()` | anything done by hand (chat switches, scrolling) |
| `scpBench.row()` / `scpBench.table()` | last result / every result so far |

Keep the tab visible and in front while a scenario runs: Chrome stops frame callbacks in
hidden tabs, which makes frame numbers meaningless. Close dialogs first, and pause any
always-animating overlay that is not part of the test.

## bench-fixtures.mjs

Writes a synthetic character card, a long chat, a linked lorebook and a long Copilot
history into a SillyTavern user folder. All text is generated filler from a fixed seed, so
runs are repeatable and no real chat is ever needed.

```
node tools/bench-fixtures.mjs --st C:\path\to\SillyTavern --user <test-user> [--kb 720] [--entries 60] [--cp-sessions 4] [--cp-msgs 300]
```

Close every SillyTavern tab logged in as that user first: a SillyTavern page saves its
whole settings and chat state when it unloads, which overwrites files changed under it.

## mock-openai.mjs

An OpenAI-compatible endpoint on localhost that streams synthetic text at a fixed rate,
so streaming runs cost nothing and stream the same thing every time.

```
node tools/mock-openai.mjs [--port 5005] [--tps 40] [--tokens 600] [--reasoning 0]
```

In SillyTavern: Chat Completion, source Custom (OpenAI-compatible), URL
`http://127.0.0.1:5005/v1`, model `mock-model`. Save it as a Connection Manager profile
so Copilot uses the same path real setups do.
