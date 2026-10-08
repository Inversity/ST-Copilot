# Changelog

This fork continues [ST-Copilot](https://github.com/Supker/ST-Copilot) by QQ-Corporation / Supker, whose last release was 2.9.0 (2026-07-02). Versions before 3.0.0 are upstream's and are listed in the extension's "What's New" panel.

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
