# Changelog

This fork continues [ST-Copilot](https://github.com/Supker/ST-Copilot) by QQ-Corporation / Supker, whose last release was 2.9.0 (2026-07-02). Versions before 3.0.0 are upstream's and are listed in the extension's "What's New" panel.

## 3.1.1 (2026-10-13)

- **Prompt edit cards work like the other proposal cards.** Each change shows its text (click to expand), can be edited before applying, and the card has Apply All and Reject All. Apply All applies the changes one by one and leaves any whose text no longer fits the prompt pending, with the reason.
- **New Session** opens in SillyTavern's own popup, like Copilot's other dialogs; "Temporary" is a checkbox in it.
- The diff view has its own template and a translatable title.

## 3.1.0 (2026-10-13)

Settings now live in one place, and it is clear which setting wins.

- **The Extensions panel entry is a launcher.** It keeps Enable ST-Copilot, Always show floating icon, Open Copilot and a new Open Copilot Settings button. Everything else is only in Copilot's own Settings window (the gear button), which had all of it already; the second copy in the Extensions panel had drifted from it (missing options, different wording).
- **"Set by" tags for character fields.** Which card fields Copilot sees is decided in three layers: a character's own override (Character Manager > Overrides) beats this session's override, which beats the global setting. Settings now shows a tag such as "set by this session: off" or "set by Bench Ranger: off" where a stronger layer decides, and each field in the Character Manager says "set here", "from this session" or "from global settings".
- **Seven more session overrides**: auto-expand macros, hidden messages, Summaryception, Aspect: Evolutia, Prompt Manager AI edits, persistent memory and tool calls. Turning tools or memory on or off for one session now works everywhere those settings are read.
- **Prompt presets in the AI tab** for the system prompt and the three edit prompts (they were only in the Session tab).
- **"Inject memory into AI context"** is in the Memory tab (it was only in the Extensions panel).
- **Sessions and files**: Clear All Sessions, Clean Up Orphan Files and Download Debug Log moved from Interface to the bottom of the Session tab.
- Fixed: in the Character Manager's Overrides tab, a field without its own override showed the global setting even when this session's override decided it.

## 3.0.9 (2026-10-13)

Fixes from a review of every screen (the UI map in `docs/`).

- **Clearer names.** The context slider is "Depth" in the toolbar and "Chat Depth" in Settings (it was "Ctx" and "Main Chat Depth"). "Reasoning Trim Strings" is "Remove From Replies", which is what it does. The lorebook scan setting says what it counts: your Copilot messages scanned for lorebook keys. "Clear All Sessions" says it clears this chat's sessions. Stats show full names (Quick Prompts, Lorebook Changes, 12 Months). The tool round reads "Tool round 2 (max 6)" instead of "Round 2/6".
- **Character edit cards** label a new alternate greeting "+ New greeting", so it no longer looks like "⬇ Append" (text added to the end of a field).
- **The extension is "ST-Copilot" everywhere**, including SillyTavern's Manage Extensions list (it said "Copilot (ST)").
- The session list is headed "Sessions for this chat"; the persona in the Character Manager says where its context switch lives.
- Fixed: in the Extensions panel, clicking the "Apply Regex Scripts to context" text did not toggle its checkbox. Max Response Tokens showed 2048 as its default; it is 8048.
- Five settings nothing used any more are removed from saved settings. More of the interface is translatable, and the Korean translation follows the renamed text.

## 3.0.8 (2026-10-13)

- **The thinking timer counts every tool round.** In a reply that used tools, the "Thinking for…" label froze at the first round's time, however long later rounds thought, and the saved reply kept only that first time. It now adds each round's thinking to the total, live and in the saved reply.

## 3.0.7 (2026-10-13)

- **Accepted character edits stick.** SillyTavern replaces its copy of a character every time it saves one, so a proposal card could end up holding an outdated copy. Accepting an edit then wrote the file but not SillyTavern's copy: the Alternate Greetings popup, the Character Manager and Copilot itself kept showing the old text, and SillyTavern's next save of that character (an edit in its character panel, closing the greetings popup) wrote the old text back. Copilot now looks the character up again each time it reads or writes a field.
- **A reply that calls a tool stops at the call.** Models often kept writing after a tool call, answering before they had the result, and the next round then wrote the whole answer again (the "Round 2/6" repeat). Copilot now ends that round at its tool call: streaming stops there, and the next round continues with the result instead of starting over. The tools prompt also asks for lookups before answering and for several reads in one call.

## 3.0.6 (2026-10-13)

- **Lorebook entries now follow SillyTavern's World Info.** Copilot used its own keyword scan, which disagreed with SillyTavern on most activation rules (secondary keys, case and whole-word settings, scan depth, recursion, probability, groups, budget) and could put almost a whole lorebook into Copilot's prompt. Copilot now sees the entries SillyTavern itself activated for the roleplay, plus entries your own Copilot messages activate under the same rules. Each entry says why it is there, so Copilot can tell you which ones the roleplay really uses, and the Lorebook Manager marks them "active in ST". The "Main chat keytriggers scan depth" setting is gone: SillyTavern's own depth applies.
- **Text completion works with "Default".** On a text-completion API, Copilot applied the preset by name and sent the conversation as plain text. When the name did not resolve, the request failed with no reply. It now uses your live settings and your instruct template, as connection profiles already did.
- **Copilot follows SillyTavern's No Blur and Reduced Motion.** With Reduced Motion on, Copilot's animations, window wobble and smooth scrolling stop; with No Blur on, its background goes nearly opaque. Performance Mode is still there.
- **Dialogs use SillyTavern's popups**: its look, translations, keyboard and mobile layout. Destructive confirmations keep their countdown.
- Fixed: adding a new lorebook to a character as an extra book did nothing; the character list did not refresh after Copilot created or renamed a character. Both came from SillyTavern globals that no longer exist; Copilot now reads SillyTavern through its API.

## 3.0.5 (2026-10-12)

- **"Change all N" for repeated text.** When a proposed change targets text that appears word for word in several places (asking to change a sentence that occurs twice), the proposal card says how many times it appears and offers **Change all N**. The diff shows every occurrence before you apply. Without that choice nothing changes, as before. This was the last failing scenario in the 3.0.4 eval.
- **Copilot can read your generation settings, regex scripts and quick replies** (read-only): API, model, preset, samplers, context and response length; global, character and preset regex scripts; quick reply sets and their STscript. All three read through SillyTavern's own APIs and never include keys.
- Proposal previews, validation and applying now share one path for anchored edits, so what the card shows is what gets applied.

## 3.0.4 (2026-10-12)

- **Copilot can read what it edits.** Its read tools only returned previews (messages cut at 500-600 characters, lorebook entries at 200, no way to read a whole entry), so edits deep in a long message or entry were guessed and failed. New tools: **Read Messages** (main-chat messages in full) and **Get Lorebook Entry** (full content plus keys and settings). Previews now say they are cut short and name the tool for the full text, and the instructions say never to overwrite from a preview.
- **Alternate greetings:** the context gives the total count and lists greetings not sent in full by number with their opening words, so numbers are never guessed and any one can be read in full (`get_char_info` takes `greeting_ids`). The instructions say greeting numbers match SillyTavern's "Alternate Greeting #N", and that swipe N+1 of the first message is greeting N.
- **Outlet entries** are detected correctly in the tools (position 7). They tested position 5, "top of example messages", which once led Copilot to name the wrong entry and then answer that there were no outlets.
- Edit instructions ask for anchors that match one place only.
- Measured with a live eval (Opus 4.6, synthetic data, new `tools/eval-*`): editing a phrase deep in a long message and patching a lorebook entry outside the context both failed on 3.0.3 and pass now; 12 of 13 scenarios pass. Still failing: changing a sentence that appears twice, which the matcher refuses as ambiguous.

## 3.0.3 (2026-10-12)

- **Long replies stream smoothly.** Each frame used to re-parse and rebuild the whole reply, so streaming slowed down as a reply grew. Finished paragraphs are now rendered once and kept; only the paragraph being written is redrawn, with output identical to a full render (checked by a test over every intermediate state of many generated replies). On a ~28 KB reply, slow frames went from 30% to under 2%.
- **Copilot follows SillyTavern's Smooth Streaming setting.** With Smooth Streaming on, Copilot replies appear at the same pace as SillyTavern's own, using its speed and "No think" options. As in SillyTavern, there is no pacing while the window is not focused. Stop shows the rest of the reply at once.
- Benchmark mock: structured markdown replies, and accurate high streaming rates on Windows.

## 3.0.2 (2026-10-12)

- **Long sessions stay smooth.** Only the newest 50 Copilot messages are rendered; "Show older messages" adds 50 more without moving the view, and search and starred-message jumps still cover the whole session. Every rendered message used to be laid out again on each frame while a reply streamed. On a 300-message session, slow frames while streaming went from 55% to 3%, and typing in the input stopped stuttering.
- **Default connection follows SillyTavern's live connection.** A model or endpoint changed in SillyTavern applies to Copilot at once; it no longer waits until the connection profile is saved and reconnected. The request is built with SillyTavern's own settings and payload builder. "Specific Profile" still uses the saved profile.
- **Default connection without a profile works.** With no Connection Manager profile selected, Copilot could not find SillyTavern's API (streaming always failed) and the fallback returned an empty reply with no error. It also applied the preset by name, which could point at a different API than SillyTavern's.
- **Benchmark tools** in `tools/`: a performance bench (long frames per extension, frame pacing, interaction latency), seeded synthetic test data, and a mock streaming endpoint.
- Tested against SillyTavern 1.19.0 (`staging` at `ad29cbda6`).

## 3.0.1 (2026-10-08)

- **Swipes run tool calls.** A swipe that called a tool (reading prompts, card fields, lorebook entries) used to stop there with a tool card that never ran. Swipes now use the same tool loop as new replies, and each swipe keeps its own tool cards.
- **Reasoning timer** no longer stops at the first stray newline. Some providers send one before the reply, which froze the timer ("Thought for 10s") and left the reply area blank while the model kept thinking. Reasoning that resumes after the reply starts is counted too.
- **Stream render errors are logged** to the console and the debug log (`STREAM_RENDER_ERROR`) instead of freezing the reply silently.
- A finished reasoning block is no longer re-rendered on every frame.

## 3.0.0 (2026-10-08)

First release of the fork. It merges the useful work from other forks, fixes the bugs behind unreliable card edits, and adds a Prompt Manager.

### Merged from other forks

- **Prompt rewrite, character-edit fixes, session fixes** (from [Cheesedozer](https://github.com/Cheesedozer/ST-Copilot)):
  - Rewritten system and module prompts, with contradictions and invalid JSON examples fixed.
  - Removed the automatic name-to-`{{char}}` rewriting, which broke anchors, group routing and ordinary words.
  - A malformed patch no longer falls back to overwriting the whole field.
  - In group chats, edits to one member can't overwrite another card through ST's autosave.
  - Fixed Copilot sessions appearing empty after switching characters (overlapping session loads).
  - Fixed chat-edit indices in short chats; `bulk_replace` matches whole words exactly.
  - Unit tests (`npm test`).
- **Session file cleanup, lorebook targeting, i18n** (from [keepsanity](https://github.com/keepsanity/ST-Copilot)):
  - Session files are created only when a session has content (one month of normal use had left about 470 empty files in `user/files`).
  - New "Clean Up Orphan Files" tool.
  - Lorebook edits no longer land on the wrong entry when entry names overlap.
  - UI localized through SillyTavern's i18n (Korean included); the settings drawer follows the ST theme.
- **Streaming performance** (upstream PR #19 by [tommusicmeister-rgb](https://github.com/tommusicmeister-rgb)): at most one render per animation frame while streaming. It used to re-render the whole reply on every chunk and rebuild an iframe for every HTML block, which froze the tab and killed backgrounded tabs.

### Card edits that work

- **`get_char_info` returned alternate greetings as a bare list.** Edits take a 1-based `index`, models count lists from 0, and edits landed on the neighboring greeting. Each greeting now carries its `id`.
- **`get_char_info` returned text with macros expanded** (`{{char}}` came back as the character's name), so anchors copied from it never matched the stored text. It now returns the stored text.
- **Anchors fail safe.** The matcher used to fuzzy-match at 72% similarity and patch the first or best hit, so a "safe" replace could edit the wrong greeting. Now:
  - exact text found twice is refused as ambiguous;
  - curly quotes, dashes, the ellipsis glyph and extra whitespace are normalized before any fuzzy matching;
  - fuzzy matching needs 90% and is refused when a second spot scores close;
  - `first || last` anchors need exactly one start and one end;
  - `...` in prose is no longer treated as a separator.
- **The Alternate Greetings popup refreshes after an edit.** It called a function that doesn't exist in ST, so the popup stayed stale, and typing in it wrote the old text back.

### Prompt Manager (new)

- **Prompt Manager window** (menu > Prompt Manager): your active preset's prompts in send order.
  - Toggle prompts on and off; edit name, role and content with a token count.
  - Saves to ST's settings, the same way ST's own Prompt Manager does. "Update preset file" writes the preset, like ST's "Update current preset".
  - Text Completion: edits the Advanced Formatting system prompt.
- **AI prompt edits** (Settings > AI > Prompt Manager AI Edits, off by default):
  - Copilot reads prompts with a new `get_prompts` tool. It lists them first and pulls content only on request.
  - It proposes `replace` / `overwrite` / `append` / `prepend` / `toggle` changes.
  - You review each one with a diff before applying it. Anchors are fail-safe and re-checked at apply time.
- **"Include my ST roleplay prompt"** (was "Include ST System Prompt") now sends your Prompt Manager prompts in order, with slots marked. The old option read a value ST never exposes, so it sent nothing.

### Character Manager

- Opens as a full-screen modal. Inside the Copilot window it was positioned and clipped by the window.
- Edit, add and delete alternate greetings.

### Chat and swipes

- **Model label per reply and swipe** (time, model, connection profile). It shows from the first streamed chunk and follows swipes.
- **Delete swipe:** removes only the swipe on screen.
- **Reasoning block:**
  - The timer stops when the reply starts. It used to keep counting, because the frozen time was stored on a stream chunk that the next chunk replaced.
  - It stays visible and readable while the reply streams, including on swipes.
  - Finished replies show "Thought for Ns".
- **Edit reasoning:** a Reasoning box appears when you edit a reply that has reasoning. Saving keeps the swipe's model and timing.
- **Saving an edited Copilot reply no longer deletes the messages after it.** "Save & Resend" on your own message still rewinds on purpose.
- The swipe controls stay centered with the delete button present.

### Settings

- **Split into AI and Interface tabs.** The configuration profile leads the AI tab and governs everything in it.
- **Model override:** pick a different model for a connection profile without changing the profile.
  - The model list loads from the provider.
  - The override is sent through ST's `overridePayload`, so provider, key, URL and preset still come from the profile.
  - It is cleared automatically if the profile switches to another provider.
- Settings and Context windows resize from the corner and remember their size.
- The Tools prompt box shows the built-in default instead of an empty box.

### Context view

- **Every part of the payload is named:**
  - Copilot setup;
  - roleplay chat (message range);
  - the auto reply;
  - your messages and Copilot's;
  - action results;
  - unsent input.
- **My Roleplay Prompt** is listed prompt by prompt, with jump links.
- **Token estimates:** total, per part, per section, per prompt.
- **Resizable sidebar** that scrolls.
- **Last sent tab:** the request bodies that actually went out, after ST added model and sampler settings. Keys are redacted and inline images shortened.
- **Attachments are visible:** text files are labeled by filename; images show as thumbnails.

### Other fixes

- SillyTavern-Tooltips tooltips draw above the Copilot window.
