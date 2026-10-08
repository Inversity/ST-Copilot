export const EXT_NAME = 'st_copilot';
export const EXT_DISPLAY = 'ST-Copilot';
export const WIN_ID = 'scp-window';
export const ICON_ID = 'scp-dock-icon';
export const MODAL_ID = 'scp-ctx-modal';
export const ICON_STORAGE_KEY = 'scp-icon-position';
export const EMBEDDED_BOOK_KEY = '__char_embedded__';

export const DEFAULT_SYSTEM_PROMPT = `<role>
You are ST-Copilot, an assistant built into SillyTavern. You help the person using SillyTavern with anything related to SillyTavern or AI roleplay.

Who is who:
- Human: the person talking to you in this Copilot window. Your replies are addressed to them.
- {{user}}: the Human's persona inside the roleplay.
- {{char}}: the character(s) or setting played by the roleplay AI.
- You are not {{char}} and not part of the story; you work alongside it.
</role>

<scope>
You can help with, among other things:
- The story: brainstorming, plot directions, twists, pacing, character motivations, continuity and lore questions, summaries, and writer's block.
- Writing: drafting or rewriting messages, replies for {{user}}, greetings, example dialogue, scenes, and prose in whatever voice or style the Human asks for.
- Character cards, personas, lorebooks (World Info), and Author's Notes: designing, writing, reviewing, and fixing them.
- SillyTavern itself: presets, samplers, context and instruct templates, system prompts, prompt engineering, macros, regex scripts, STscript and Quick Replies, extensions, APIs, backends and model choice, and troubleshooting.
If a request falls outside these areas, help anyway if you can.
</scope>

<guidelines>
- Ground your answers in the provided context (chat history, character information, lorebooks, persona). If something you need is missing, say so or look it up with your tools instead of guessing.
- By default, talk to the Human out of character. When they ask for in-character writing, write it directly and match the story's established voice, tense, and formatting.
- Offer options rather than forcing one direction, unless the Human asks for a single answer.
- For SillyTavern features and settings, be concrete: where the setting lives and what to change. SillyTavern changes often; if you are unsure how something works in the Human's version, say so.
- This is fiction written by an adult. Engage with mature or dark themes as a matter of craft, without moralizing or adding disclaimers to fictional content.
- Use Markdown when it helps readability. Make answers as long as the request needs and no longer.
</guidelines>`;

export const DEFAULT_LB_MANAGE_PROMPT = `<context>
A lorebook (World Info) stores facts about the world, characters, places, items, and lore. When an entry's trigger keywords appear in the chat, SillyTavern inserts that entry's content into the roleplay AI's prompt. Constant entries are always inserted.
</context>

<how_it_works>
To change a lorebook, end your reply with a \`lorebook-changes\` block. The Human reviews each proposed change before it is applied. After they decide, the block is removed from the conversation history to save tokens, so do not repeat or recreate earlier blocks.
</how_it_works>

<writing_entries>
Unless the Human or the existing lorebook uses a different style:
- Keep entries dense and factual; every token is injected into the prompt.
- Start the content with the subject's name (e.g. "Castle Varn is..."), so the entry makes sense on its own.
- Use specific, distinctive trigger keywords (names, unique nouns). Avoid common words that would fire constantly.
- When inventing names, avoid overused AI names (e.g. Elara, Kael, Lyra) and fit them to the setting's culture.
</writing_entries>

<outlet_entries>
Outlet entries are not triggered by keywords. Their content is inserted wherever an outlet::outlet_name macro (wrapped in double curly braces) appears, for example inside another entry or a card field. The macro is written that way here because a literal one would be expanded before you see it.
- To create one, use "add" with "outlet":true and "outlet_name":"your_outlet_name".
- To convert an existing entry, use "edit" with "outlet":true and "outlet_name":"your_outlet_name".
Existing outlet entries are listed under "Outlet Entries" in the lorebook context, if there are any.
</outlet_entries>

<actions>
- add / delete: create or remove an entry.
- prepend / append: add text to the start or end of an entry's content.
- patch: change part of an entry. Each anchor is "first few words || last few words" of the exact passage to replace, copied from the entry. Everything from the first words through the last words is replaced.
  Example: to replace "The ancient castle was built in 1240 by a grumpy dwarf.", use the anchor "The ancient castle || a grumpy dwarf."
- edit: rewrite the whole entry. For small changes to long entries, prefer patch.
Use worldName exactly as listed below, and the uid shown in the context for existing entries.
</actions>

<output_format>
Active lorebooks: {{active_lorebooks}}

Briefly explain your changes to the Human, then end your reply with the block:
{{lorebook_output}}
</output_format>`;

export const DEFAULT_CHAR_EDIT_DIRECTIVE = `<context>
SillyTavern character cards define a character (or a setting) through fields such as description, personality, scenario, first message, and example dialogue. Here you can edit the active character cards, the Human's persona (\`user_persona\`, when it is in the field list), and propose new characters.
</context>

<how_it_works>
End your reply with a \`character-changes\` block to edit cards, or a \`character-create\` block to propose a new character. The Human reviews each change before it is applied. After they decide, the block is removed from the conversation history, so do not repeat or recreate earlier blocks.
</how_it_works>

<macros>
Cards get shared and reused, so inside field text write \`{{char}}\` for the card's own character and \`{{user}}\` for the Human's persona instead of their names. Keep real names for everyone else: NPCs, places, and other characters in a group chat. The \`char="..."\` attribute and the \`name\` field always use the real name.
</macros>

<style>
When editing an existing card, match its current format and voice (plain prose, W++, XML-style tags, lists, first or third person, and so on) unless the Human asks for a change. For a new card, or a field with no established style, these defaults work well:
- tags: a few broad, common tags for genre, archetype, and tone, e.g. "Fantasy", "Villain", "Slow Burn".
- description: the factual core (appearance, personality, background, relationships), organized to be easy to scan, e.g. with headings or XML-style sections. Give traits texture ("loyal to a fault; would starve for them") rather than bare adjectives. For a world or RPG card rather than a single character, say so at the start, e.g. "{{char}} is not a character but a setting."
- personality: show the voice, for example a short interview where {{char}} answers questions in character, with dialogue in quotes and actions in *asterisks*.
- scenario: the premise and circumstances that hold for the whole roleplay, not one scene's temporary state.
- first_mes: the opening scene. Write {{char}}'s words and actions; do not decide what {{user}} says, does, thinks, or feels. End on something {{user}} can respond to.
- mes_example: short examples of {{char}}'s speech and body language across different moods. Start each example with <START> on its own line. Leave out {{user}} lines unless the Human wants them.
</style>

<routing>
Active characters appear as \`<character name="ExactName">\` blocks inside \`<character_information>\`. Every tag in a \`character-changes\` block needs a \`char="ExactName"\` attribute with that exact name, even in a solo chat. Use one tag per character per field; never combine edits for two characters in one tag.
</routing>

<edit_actions>
- overwrite: replace the whole field.
- prepend / append_text: add text to the start or end of the field.
- replace: change part of a field. On the line after \`<<<<<<< ANCHOR\`, write "first few words || last few words" of the exact passage to replace, copied from the field. Everything from the first words through the last words is replaced by the text after \`=======\`.
  Example: to replace "The quick brown fox jumps over the lazy dog.", use the anchor "The quick brown || the lazy dog."
- append: alternate_greetings only; adds a new greeting. To change an existing greeting, use overwrite, replace, prepend, or append_text with index="N".
</edit_actions>

<output_format>
Editable fields: {{char_edit_fields}}.

Edit format:
{{char_edit_format}}

New character format:
{{char_create_format}}
</output_format>`;

export const DEFAULT_CHAT_EDIT_DIRECTIVE = `<context>
You can edit the main roleplay chat. Messages in \`<roleplay_context>\` appear as \`<msg index="N" role="user|assistant">\`; use those index numbers.
</context>

<how_it_works>
End your reply with a \`chat-changes\` block. The Human reviews it before anything is applied. Afterwards the block is removed from the conversation history, so do not repeat or recreate earlier blocks.
</how_it_works>

<actions>
Target messages with \`msg_index\`, \`msg_range\` ([first, last]), or \`msg_indices\` ([a, b, ...]).
- add: insert a new message at msg_index.
- delete: remove a message.
- prepend / append: add text to the start or end of a message.
- overwrite: replace a message's entire text.
- replace: change part of a message. Each anchor is "first few words || last few words" of the exact passage, copied from the message. Everything from the first words through the last words is replaced.
- bulk_replace: replace every exact occurrence of a word or phrase (case-sensitive, whole words) across the targeted messages.
- regex: pattern-based replacement using JavaScript regex syntax ("/pattern/flags").
- hide / unhide: hide messages from the roleplay AI without deleting them, or show them again.
- rename_chat: rename the current chat.
</actions>

<output_format>
{{chat_edit_format}}

Messages currently in your context: {{active_chat_ids}}
</output_format>`;

export const LB_FORMAT_BLOCK = `\`\`\`lorebook-changes
{"changes":[
  {"action":"add","worldName":"BookName","name":"EntryName","triggers":["keyword"],"content":"Entry content","constant":false},
  {"action":"add","worldName":"BookName","name":"OutletEntry","content":"Outlet content here","outlet":true,"outlet_name":"my_outlet_name"},
  {"action":"delete","worldName":"BookName","uid":123,"name":"EntryName"},
  {"action":"prepend","worldName":"BookName","uid":123,"content":"Text to add at the start"},
  {"action":"append","worldName":"BookName","uid":123,"content":"Text to add at the end"},
  {"action":"edit","worldName":"BookName","uid":123,"name":"NewName","triggers":["newKw"],"content":"New content","constant":false},
  {"action":"patch","worldName":"BookName","uid":123,"triggers":null,"patches":[{"anchor":"first || last","replace":"replacement"}]}
]}
\`\`\`

Triggers field:
- Omit it or set it to null to keep the current triggers (usual for patch, append, and partial edits).
- Provide an array to set new triggers.`;

export const CHAR_EDIT_FORMAT_BLOCK = `\`\`\`character-changes
<replace char="ExactName" field="FIELD_NAME">
<<<<<<< ANCHOR
first || last
=======
replacement text
>>>>>>> REPLACE
</replace>
<overwrite char="ExactName" field="FIELD_NAME">Complete replacement content for this field</overwrite>
<prepend char="ExactName" field="FIELD_NAME">Text to insert at the very beginning of the field</prepend>
<append_text char="ExactName" field="FIELD_NAME">Text to append at the very end of the field</append_text>

<!-- ALTERNATE GREETINGS -->
<append char="ExactName" field="alternate_greetings">A new greeting, added as a new entry</append>
<overwrite char="ExactName" field="alternate_greetings" index="1">Complete rewrite of the existing greeting with id="1"</overwrite>
<replace char="ExactName" field="alternate_greetings" index="2">
<<<<<<< ANCHOR
first || last
=======
replacement text
>>>>>>> REPLACE
</replace>
\`\`\``;

export const CHAR_CREATE_FORMAT_BLOCK = `\`\`\`character-create
{
  "name_suggestion": "Character Name",
  "tags": "tag1, tag2",
  "description": "Full character description",
  "personality": "Personality summary",
  "scenario": "Scenario / setting",
  "first_mes": "Opening message",
  "mes_example": "<START>\\n*{{char}} glances up.* \\"Oh. It's you.\\""
}
\`\`\``;

export const CHAT_EDIT_FORMAT_BLOCK = `\`\`\`chat-changes
{"changes":[
  {"action":"rename_chat","name":"New Chat Display Name"},
  {"action":"prepend","msg_index":6,"content":"Text to add at the start. "},
  {"action":"append","msg_index":6,"content":" Text to add at the end."},
  {"action":"add","msg_index":7,"role":"assistant","content":"Brand new message text"},
  {"action":"delete","msg_index":12},
  {"action":"hide","msg_range":[8,10]},
  {"action":"unhide","msg_index":11},
  {"action":"bulk_replace","msg_range":[0,10],"replacements":[{"anchor":"old text","replace":"new text"}]},
  {"action":"regex","msg_index":13,"regex":"/(hello)/gi","replace":"hi $1"},
  {"action":"overwrite","msg_index":6,"content":"New text"},
  {"action":"replace","msg_index":5,"patches":[{"anchor":"first || last","replace":"new"}]}
]}
\`\`\``;

export const DEFAULT_MEMORY_PROMPT = `<memory_logic>
You have a persistent memory for facts about the Human as a user of this tool: their preferences, working style, formatting rules, and standing instructions for how you should respond. Story content (plot, lore, what characters do) does not belong here; it lives in the chat and the lorebooks.

Scopes:
- global: applies everywhere (e.g. "Human prefers British English spelling").
- character: applies only with the current {{char}} (e.g. "Human wants verbose prose for this character").
- chat: applies only in this roleplay chat (e.g. "Human is steering this story toward horror").
- session: applies only in this Copilot session (e.g. "Human wants very short answers for now").
</memory_logic>

<output_requirement>
When you learn something new of this kind, end your reply with a \`memory-update\` block, and don't mention the block in your text. Otherwise, leave it out. To change or remove an existing memory, use "edit" or "delete" with its exact scope and key. Start every value with the word "Human".

Current memories:
{{current_memories}}

Format:
{{memory_format}}
</output_requirement>`;
export const MEMORY_FORMAT_BLOCK = `\`\`\`memory-update\n[\n  {"action":"add","scope":"global|character|chat|session","key":"CategoryName","value":"Fact to remember"},\n  {"action":"edit","scope":"exact_existing_scope","key":"exact_existing_key","value":"Updated fact"},\n  {"action":"delete","scope":"exact_existing_scope","key":"exact_existing_key"}\n]\n\`\`\``;

export const DEFAULT_TOOLS_PROMPT = `You can call tools to look things up before answering. If you need information that isn't in your context (older chat messages, lorebook entries, character fields), use a tool instead of guessing or assuming it doesn't exist.

To call a tool, output a \`tool_call\` block. The result is returned to you, and then you continue your answer to the Human. You can call several tools in a row.

<available_tools>
{{tools_list}}
</available_tools>

<output_format>
{{tool_call_format}}
</output_format>`;

export const TOOL_CALL_FORMAT_BLOCK = `\`\`\`tool_call\n{"name": "tool_name","input": {"parameter_name": "value"}}\n\`\`\``;

// promptHash() of every built-in prompt default ever shipped (including the current ones).
// A saved prompt matching one of these is an unmodified default, so it is reset to ''
// ("use the built-in default") on load and picks up future prompt improvements.
// When changing a default prompt, add the hash of the new text here.
export const KNOWN_DEFAULT_PROMPT_HASHES = [
    '1l9b3r7kzx2',
    'bb2qakzoja',
    'ym035m7jmz',
    '1s0fp0314df',
    '16388q9bxl5',
    'vz2t7x3byv',
    'xamxqsot5s',
    '2c8xjhg6zfe',
    '145w5wziayi',
    '1fs42habtyf',
    '259x3c8eseu',
    'rqernhk9o6',
    '8wjmde2h6j',
    '13klcj97vlw',
    '2fkihst55dg',
    '2fuassazza1',
    'su8up8c5k1',
    '2l2esktr0d',
    '53wp5xir4t',
    '25nremk75a0',
    '1y9moecpem1',
    '16gdqk8vvt4',
    '1k207jzb11b',
    '2cacx10c968',
    'etqekviamh',
    '14nkx4tsu9o',
    '13nsbj0qdab',
    'm8a14r9497',
    '16zfn93ijyf',
    'q508r5jjrd',
];

    // ─── Changelog Data ──────────────────────────────────────────────────────────
export const CHANGELOG = [
    {
        version: '2.9.1',
        date: '9/23/2026',
        announce: true,
        notes: [
            '<strong>Rewritten Prompts</strong> — Copilot now helps with anything SillyTavern or roleplay related (presets, prompts, extensions, troubleshooting) and can write in-character prose when asked. Module prompts are clearer and no longer contradict each other. Unmodified default prompts update automatically; customized prompts are kept.',
            '<strong>Character Edit Fixes</strong> — Fixed edits failing to apply: block-name mismatch, names being auto-replaced with {{char}} (which broke anchors, group routing and words like "rose"), and malformed patches overwriting whole fields.',
            '<strong>Group Chat Safety</strong> — Edits for one group member can no longer overwrite the card open in the character editor, and unknown member names are skipped instead of hitting the first member.',
            '<strong>Session Persistence</strong> — Fixed Copilot sessions appearing empty after switching characters, caused by overlapping session loads.',
            '<strong>Chat Edit Fixes</strong> — Message indices are now correct in chats shorter than the context depth; bulk replace matches whole words exactly; regex edits work across multiple messages.',
            '<strong>Other</strong> — Non-Latin (Cyrillic, CJK, etc.) text now works with anchors; cards missing a field can now be edited.'
        ],
    },
    {
        version: '2.9.0',
        date: '7/2/2026',
        announce: false,
        notes: [
            '<strong>Character Manager</strong> — New interface to edit character fields and configure per-character context inclusion rules.',
            '<strong>Group Chat Editing</strong> — Enabled the ability for Copilot to identify and edit individual characters within group sessions.',
            '<strong>New Tools Menu</strong> — Replaced the tools panel with a burger menu for streamlined access to Lorebook and Character managers.',
            '<strong>Local Layouts</strong> — Window dimensions and positions are now stored in the browser instead of the server.',
            '<strong>UI Fixes</strong> — Resolved Z-index issues with the "New Session" window and fixed chat auto-scrolling jumping upwards.',
            '<strong>Bug Fixes</strong> — Patched various issues in Proposed Changes, along with general API and interface stability improvements.'
        ],
    },
    {
        version: '2.8.3',
        date: '6/20/2026',
        announce: false,
        notes: [
            '<strong>Search Enhancements</strong> — Search tools now support multiple queries simultaneously for better information retrieval.',
            '<strong>Session Reliability</strong> — Resolved critical bugs affecting the deletion and management of Copilot sessions.',
            '<strong>Lorebook UI</strong> — Restored lorebook source icons and fixed a bug where "Proposed Changes" would reappear after application.',
            '<strong>World Info Drawer</strong> — Fixed various extension bugs (Special thanks to @Haruny for the debugging and fixes).',
            '<strong>UI/UX Polishing</strong> — Addressed several layout inconsistencies and minor interface bugs.'
        ],
    },
    {
        version: '2.8.2',
        date: '6/16/2026',
        announce: false,
        notes: [
            '<strong>Character Management</strong> — Copilot can now access and modify Name, Main Prompt Override, and Post-History Instructions.',
            '<strong>Lorebook API</strong> — Added <code>get_lorebooks</code> tool and upgraded <code>search_lorebook_entries</code> with <code>is_constant</code> and <code>is_outlet</code> parameters.',
            '<strong>Dynamic Outlets</strong> — Enabled AI autonomy for creating and modifying Lorebook Outlets (requires Lorebook Prompt reset to default).',
            '<strong>Chat Management</strong> — Added support for renaming the current chat via Proposed Chat Changes.',
            '<strong>Stability & Tokens</strong> — Fixed critical session deletion bugs, improved token counting accuracy, and optimized save-lock logic.'
        ],
    },
    {
        version: '2.8.1',
        date: '6/15/2026',
        announce: false,
        notes: [
            '<strong>World Info Outlets</strong> — Added full support for the <code>{{outlet::name}}</code> macro syntax for dynamic content injection.',
            '<strong>UI Navigation</strong> — Repositioned tab buttons in the settings panel for improved accessibility and user flow.',
            '<strong>Stability</strong> — Fixed various minor regressions and internal logic bugs.'
        ],
    },
    {
        version: '2.8.0',
        date: '6/11/2026',
        announce: false,
        notes: [
            '<strong>Tools & Agency</strong> — Copilot can now independently gather information using the new Tools system.',
            '<strong>Persistent Memory</strong> — Introduced cross-session memory with Global, Character, Chat, and Session scoping.',
            '<strong>Smart Anchor Detection</strong> — New Tokenized Sliding Window Levenshtein algorithm for flawless "Proposed Changes" application.',
            '<strong>UI & Customization</strong> — Redesigned Stats window, refreshed Settings interface, and added font size controls.',
            '<strong>Extensions & Context</strong> — Added support for all swipes in context. Also for Summaryception, and Aspect:Evolutia extensions.',
            '<strong>Optimization</strong> — All internal prompts are now more token-efficient; fixed DevTools UI bugs and connection profile issues.'
        ],
    },
    {
        version: '2.7.2',
        date: '5/29/2026',
        announce: false,
        notes: [
            '<strong>Shortcuts Overlay</strong> — Introduced a dedicated "Shortcuts" configuration window in the settings panel.',
            '<strong>Context-Aware Search</strong> — Refined the search shortcut to trigger exclusively when the Copilot window is active.',
            '<strong>Character Factory Fixes</strong> — Resolved several bugs affecting character creation and metadata initialization.',
            '<strong>Asset Optimization</strong> — Overhauled background storage logic for better performance and reduced storage overhead.'
        ],
    },
    {
        version: '2.7.1',
        date: '5/28/2026',
        announce: false,
        notes: [
            '<strong>Character Tagging</strong> — Added the ability to modify the "tags" field for already existing characters.',
            '<strong>Low Performance Mode</strong> — Introduced a new toggle to optimize resource usage on lower-end hardware.',
            '<strong>Session Stability</strong> — Completely overhauled the session saving system to prevent spontaneous session loss and data corruption.',
            '<strong>General Optimization</strong> — Improved core logic for better performance and overall stability of ST-Copilot. Fixed AI Generation errors.'
        ],
    },
    {
        version: '2.7.0',
        date: '5/27/2026',
        announce: false,
        notes: [
            '<strong>Proposed Chat Edits</strong> — Bulk-modify, delete, or hide message ranges using natural language instructions.',
            '<strong>File Attachments & Vision</strong> — Support for text/image uploads with vision model integration and an internal previewer.',
            '<strong>Message Swiping</strong> — Regenerate Copilot responses and navigate through multiple swipe iterations.',
            '<strong>Multimedia Backgrounds</strong> — Custom image/video backgrounds (local or URL) with adjustable dimming.',
            '<strong>Character Creator</strong> — Added "tags" field support and optimized generation prompts for AI-assisted creation.',
            '<strong>Configuration Sync</strong> — AI settings are now linked to Configuration Profiles and Session Overrides.',
            '<strong>UX Enhancements</strong> — Added "Always Off" Lorebook state, sender-based group selection in context picker, and focus-aware notification sounds.',
            '<strong>UI & Maintenance</strong> — Improved "Save" button feedback, better theme support for lists, and optimized generation logic.'
        ],
    },
    {
        version: '2.5.1',
        date: '5/22/2026',
        announce: false,
        notes: [
            '<strong>Continue Message</strong> — Added a "Continue" button to extend the last Copilot generation.',
            '<strong>Debug Export</strong> — Introduced a downloadable debug log in settings for easier troubleshooting (refreshes on page load).',
            '<strong>Smooth Streaming</strong> — Fixed chat scrolling behavior, allowing users to scroll up during active message streaming.',
            '<strong>Bug Fixes</strong> — Potential fix for the "profile not found" error and minor stability improvements.'
        ],
    },
    {
        version: '2.5.0',
        date: '5/20/2026',
        announce: false,
        notes: [
            '<strong>Character Card Manager</strong> — You can now create new characters entirely from scratch or edit existing card fields directly within the extension.',
            '<strong>Massive Token Optimization</strong> — "Proposed Changes" now uses a smart search-and-replace method, reducing token consumption by over 80% (Huge thanks to Steel-skull for the PR!).',
            '<strong>Robust Parsing</strong> — The system now successfully finds and applies "proposed changes" blocks even if the AI makes formatting mistakes.',
            '<strong>Session Management</strong> — Added the ability to export and import sessions. Under-the-hood session saving has also been rewritten to be much more efficient.',
            '<strong>UI, Sounds & Polish</strong> — Added a generation-complete sound notification, soothing window wobble physics, smooth chart animations in Stats, and new Streaming modes (Auto, Force On, Force Off).',
            '<strong>Lorebook Updates</strong> — Added a "constant" parameter for proposed changes and moved toggles to the main Settings. ⚠️ <em>Important: Please reset your Lorebook AI Edit prompt to default!</em>',
            '<strong>Mobile & Fixes</strong> — The Enter key on mobile keyboards now correctly inserts line breaks instead of sending messages. Fixed mobile UI headers, resolved duplicate user message bugs, and redesigned system message outputs.'
        ],
    },    
    {
        version: '2.3.0',
        date: '5/10/2026',
        announce: false,
        notes: [
            '<strong>Stream Support</strong> — Added streaming support so you can see generations in real-time.',
            '<strong>Reasoning Blocks</strong> — Added support for displaying Reasoning blocks',
            '<strong>Regex Support</strong> — Clean up formatting and fluff from chat messages included in the context.',
            '<strong>Preset Customization</strong> — Modify QuickPrompts and SystemPrompts presets directly (SystemPrompts handled via session override).',
            '<strong>Favorite Messages</strong> — You can now mark specific messages as Favorites.',
            '<strong>In-app Changelog</strong> — Added a Changelog window to easily track new updates.',
            '<strong>Fixes & Polish</strong> — Synced chat context picker numbering with ST (0 to N), fixed Lorebook context persistence after disconnection, and improved the default Lorebook edit prompt.'
        ],
    },
    {
        version: '2.0.0',
        date: '5/03/2026',
        announce: false,
        notes: [
            '<strong>Messages Payload</strong> — Handpick specific messages from the chat history and feed them directly to the AI.',
            '<strong>Quick Prompts</strong> — Fully customizable prompt buttons with emoji icons.',
            '<strong>Ghost Mode</strong> — Copilot can now become semi-transparent and completely click-through.',
            '<strong>Expanded Context Awareness</strong> — Context now includes Character Note, Example of Dialogue, and respects settings overrides.',
            '<strong>Temporary Sessions</strong> — Create sessions that automatically delete themselves when you switch.',
            '<strong>Usage Stats</strong> — A new interactive Statistics window to track your metrics.',
            '<strong>UI & QoL Enhancements</strong> — Save edited messages without regenerating, mobile responsive improvements, HTML support, and clean connecting lines for lists.'
        ],
    },
    {
        version: '1.9.0',
        date: '4/28/2026',
        announce: false,
        notes: [
            '<strong>Integrated Settings Window</strong> — Dedicated settings UI for seamless adjustments.',
            '<strong>Session-Specific Configuration</strong> — Override global settings for individual sessions.',
            '<strong>Dynamic Context Scaling</strong> — The CTX slider dynamically adjusts its range based on chat length.',
            '<strong>Advanced In-Chat Search</strong> — Quickly locate specific information using (Ctrl + F).',
            '<strong>Theme Portability</strong> — Import and Export custom themes as JSON. Added the new "Dark Sky" preset.'
        ],
    },
    {
        version: '1.7.2',
        date: '4/27/2026',
        announce: false,
        notes: [
            '<strong>Comfortable Color Picker</strong> — Choose colors natively without leaving the app.',
            '<strong>Default Colors</strong> — Individually reset specific colors to the original theme defaults.',
            '<strong>Resizable edit window</strong> — You can now manually resize the "content" window in the Lorebook Manager.'
        ],
    },
    {
        version: '1.7.1',
        date: '4/26/2026',
        announce: false,
        notes: [
            '<strong>Expandable Entry Descriptions</strong> — Click to expand chat entry descriptions.',
            '<strong>Lorebook Dropdowns</strong> — Individual Lorebook selection dropdowns for each entry proposal.',
            '<strong>Data Protection</strong> — Added unsaved changes warnings when switching profiles.',
            '<strong>New Macro</strong> — Added support for {{active_lorebooks}}.'
        ],
    },
    {
        version: '1.7.0',
        date: '4/26/2026',
        announce: false,
        notes: [
            '<strong>AI Lorebook Management</strong> — Copilot AI now actively assists in world-building (AI-Edit).',
            '<strong>Interactive Proposals</strong> — AI generates Proposal Cards to review, edit, or reject changes via a Diff View modal.',
            '<strong>Lorebook Manager UI</strong> — Added manual overrides, Auto-Keywords, and Active Indicators.',
            '<strong>String Trimming</strong> — Automatically remove specific tags (like &lt;think&gt; blocks) from AI responses.',
            '<strong>Persistent Icon</strong> — Option to keep the floating dock icon visible at all times.'
        ],
    }
];

        
    // ─── Theme Presets ──────────────────────────────────────────────────────────

export const THEME_PRESETS = {
        default: {
            label: 'Dark Sky',
            bg: 'rgba(0,0,0,0.85)', blur: 'blur(14px)',
            text: '#e2e2e6', textMuted: 'rgb(176,176,176)',
            accent: 'rgb(191,191,191)', accentDim: 'rgba(209,209,209,0.4)',
            accentBg: 'rgba(112,112,112,0.08)',
            headerBg: 'rgba(255,255,255,0.04)', toolbarBg: 'rgba(0,0,0,0.25)',
            msgUserBg: 'rgba(214,214,214,0.1)', msgAiBg: 'rgba(214,214,214,0.03)',
            inputBg: 'rgba(0,0,0,0.30)', codeBg: 'rgba(0,0,0,0.35)',
            radius: '10px', danger: '#ff5c5c', success: '#4caf7d',
            shadow: '0 24px 64px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.09)', font: '',
        },
        blue_ocean : {
            label: 'Blue Ocean',
            bg: 'rgba(18,18,22,0.94)', blur: 'blur(14px)',
            text: '#e2e2e6', textMuted: '#72728a',
            accent: '#7c6dfa', accentDim: 'rgba(124,109,250,0.45)',
            accentBg: 'rgba(124,109,250,0.12)',
            headerBg: 'rgba(255,255,255,0.04)', toolbarBg: 'rgba(0,0,0,0.25)',
            msgUserBg: 'rgba(124,109,250,0.10)', msgAiBg: 'rgba(255,255,255,0.03)',
            inputBg: 'rgba(0,0,0,0.30)', codeBg: 'rgba(0,0,0,0.35)',
            radius: '10px', danger: '#ff5c5c', success: '#4caf7d',
            shadow: '0 24px 64px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.09)', font: '',
        },
        onyx_ivory: {
            label: 'Onyx & Ivory',
            bg: 'rgba(17,17,17,0.96)', blur: 'blur(16px)',
            text: '#f4ede4', textMuted: '#b8a898',
            accent: '#d4c4b0', accentDim: 'rgba(212,196,176,0.4)',
            accentBg: 'rgba(212,196,176,0.08)',
            headerBg: 'rgba(244,237,228,0.04)', toolbarBg: 'rgba(0,0,0,0.3)',
            msgUserBg: 'rgba(244,237,228,0.07)', msgAiBg: 'rgba(255,255,255,0.02)',
            inputBg: 'rgba(0,0,0,0.35)', codeBg: 'rgba(0,0,0,0.45)',
            radius: '10px', danger: '#e05c5c', success: '#6ab88a',
            shadow: '0 28px 70px rgba(0,0,0,0.7), 0 4px 18px rgba(0,0,0,0.5)',
            border: '1px solid rgba(244,237,228,0.1)', font: '',
        },
        violet_sun: {
            label: 'Violet & Sun',
            bg: 'rgba(20,8,42,0.97)', blur: 'blur(18px)',
            text: '#f0e8ff', textMuted: '#9a80c0',
            accent: '#ffd60a', accentDim: 'rgba(255,214,10,0.45)',
            accentBg: 'rgba(255,214,10,0.1)',
            headerBg: 'rgba(90,24,154,0.15)', toolbarBg: 'rgba(0,0,0,0.3)',
            msgUserBg: 'rgba(255,214,10,0.07)', msgAiBg: 'rgba(90,24,154,0.06)',
            inputBg: 'rgba(0,0,0,0.4)', codeBg: 'rgba(0,0,0,0.5)',
            radius: '10px', danger: '#ff5c5c', success: '#4caf7d',
            shadow: '0 24px 64px rgba(0,0,0,0.75), 0 0 40px rgba(90,24,154,0.15)',
            border: '1px solid rgba(90,24,154,0.3)', font: '',
        },
        forest_gold: {
            label: 'Forest & Gold',
            bg: 'rgba(2,16,10,0.97)', blur: 'blur(12px)',
            text: '#e8dfc8', textMuted: '#8a9e80',
            accent: '#d4a373', accentDim: 'rgba(212,163,115,0.45)',
            accentBg: 'rgba(212,163,115,0.1)',
            headerBg: 'rgba(212,163,115,0.06)', toolbarBg: 'rgba(0,0,0,0.35)',
            msgUserBg: 'rgba(212,163,115,0.08)', msgAiBg: 'rgba(255,255,255,0.02)',
            inputBg: 'rgba(0,0,0,0.4)', codeBg: 'rgba(0,0,0,0.5)',
            radius: '8px', danger: '#e05c5c', success: '#69a458',
            shadow: '0 24px 64px rgba(0,0,0,0.8), 0 0 30px rgba(2,48,32,0.4)',
            border: '1px solid rgba(212,163,115,0.15)', font: '',
        },
        crimson_cream: {
            label: 'Crimson & Cream',
            bg: 'rgba(28,4,4,0.97)', blur: 'blur(14px)',
            text: '#fff3e0', textMuted: '#c09070',
            accent: '#e85555', accentDim: 'rgba(214,40,40,0.45)',
            accentBg: 'rgba(214,40,40,0.1)',
            headerBg: 'rgba(214,40,40,0.07)', toolbarBg: 'rgba(0,0,0,0.32)',
            msgUserBg: 'rgba(214,40,40,0.08)', msgAiBg: 'rgba(255,243,224,0.02)',
            inputBg: 'rgba(0,0,0,0.38)', codeBg: 'rgba(0,0,0,0.48)',
            radius: '10px', danger: '#ff5c5c', success: '#6ab88a',
            shadow: '0 24px 64px rgba(0,0,0,0.75), 0 0 30px rgba(214,40,40,0.08)',
            border: '1px solid rgba(214,40,40,0.2)', font: '',
        },
        teal_midnight: {
            label: 'Teal & Midnight',
            bg: 'rgba(10,12,24,0.97)', blur: 'blur(16px)',
            text: '#d8f0ee', textMuted: '#5a8a88',
            accent: '#2ec4b6', accentDim: 'rgba(46,196,182,0.4)',
            accentBg: 'rgba(46,196,182,0.1)',
            headerBg: 'rgba(46,196,182,0.06)', toolbarBg: 'rgba(0,0,0,0.3)',
            msgUserBg: 'rgba(46,196,182,0.08)', msgAiBg: 'rgba(255,255,255,0.02)',
            inputBg: 'rgba(0,0,0,0.38)', codeBg: 'rgba(0,0,0,0.48)',
            radius: '10px', danger: '#ff5c5c', success: '#2ec4b6',
            shadow: '0 24px 64px rgba(0,0,0,0.75), 0 0 40px rgba(26,26,46,0.5)',
            border: '1px solid rgba(46,196,182,0.15)', font: '',
        },
        ember_sand: {
            label: 'Ember & Sand',
            bg: 'rgba(22,10,4,0.97)', blur: 'blur(14px)',
            text: '#f5ebe0', textMuted: '#b08060',
            accent: '#ff6f3c', accentDim: 'rgba(255,111,60,0.4)',
            accentBg: 'rgba(255,111,60,0.1)',
            headerBg: 'rgba(255,111,60,0.06)', toolbarBg: 'rgba(0,0,0,0.32)',
            msgUserBg: 'rgba(255,111,60,0.08)', msgAiBg: 'rgba(245,235,224,0.02)',
            inputBg: 'rgba(0,0,0,0.36)', codeBg: 'rgba(0,0,0,0.46)',
            radius: '10px', danger: '#ff5c5c', success: '#6ab88a',
            shadow: '0 24px 64px rgba(0,0,0,0.75), 0 0 30px rgba(255,111,60,0.06)',
            border: '1px solid rgba(255,111,60,0.18)', font: '',
        },
        sage_mist: {
            label: 'Sage & Mist',
            bg: 'rgba(10,18,14,0.96)', blur: 'blur(16px)',
            text: '#e7edeb', textMuted: '#7a9a88',
            accent: '#69a481', accentDim: 'rgba(105,164,129,0.4)',
            accentBg: 'rgba(105,164,129,0.1)',
            headerBg: 'rgba(105,164,129,0.05)', toolbarBg: 'rgba(0,0,0,0.28)',
            msgUserBg: 'rgba(105,164,129,0.08)', msgAiBg: 'rgba(231,237,235,0.02)',
            inputBg: 'rgba(0,0,0,0.32)', codeBg: 'rgba(0,0,0,0.42)',
            radius: '12px', danger: '#e05c5c', success: '#69a481',
            shadow: '0 24px 64px rgba(0,0,0,0.65), 0 0 30px rgba(10,18,14,0.4)',
            border: '1px solid rgba(105,164,129,0.15)', font: '',
        },
        glass: {
            label: 'Glass',
            bg: 'rgba(40,40,55,0.55)', blur: 'blur(22px) saturate(1.6)',
            text: '#f0efff', textMuted: '#9898b8',
            accent: '#a78bfa', accentDim: 'rgba(167,139,250,0.5)',
            accentBg: 'rgba(167,139,250,0.14)',
            headerBg: 'rgba(255,255,255,0.07)', toolbarBg: 'rgba(255,255,255,0.05)',
            msgUserBg: 'rgba(167,139,250,0.10)', msgAiBg: 'rgba(255,255,255,0.05)',
            inputBg: 'rgba(0,0,0,0.25)', codeBg: 'rgba(0,0,0,0.30)',
            radius: '12px', danger: '#ff5c5c', success: '#4caf7d',
            shadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset',
            border: '1px solid rgba(255,255,255,0.18)', font: '',
        },
        hacker: {
            label: 'Hacker',
            bg: 'rgba(6,14,6,0.97)', blur: 'blur(0px)',
            text: '#88ee88', textMuted: '#3a6640',
            accent: '#00ff88', accentDim: 'rgba(0,255,136,0.45)',
            accentBg: 'rgba(0,255,136,0.08)',
            headerBg: 'rgba(0,255,136,0.06)', toolbarBg: 'rgba(0,0,0,0.6)',
            msgUserBg: 'rgba(0,255,136,0.05)', msgAiBg: 'rgba(0,0,0,0.4)',
            inputBg: 'rgba(0,0,0,0.55)', codeBg: 'rgba(0,0,0,0.7)',
            radius: '4px', danger: '#ff4444', success: '#00ff88',
            shadow: '0 0 30px rgba(0,255,136,0.08), 0 16px 48px rgba(0,0,0,0.8)',
            border: '1px solid #00c77044', font: "'Consolas','Courier New',monospace",
        },
        native: {
            label: 'Native ST',
            bg: 'var(--SmartThemeBlurTrans, rgba(20,20,24,0.92))', blur: 'var(--smartThemeBlur, blur(12px))',
            text: 'var(--SmartThemeBodyColorText, #e2e2e6)', textMuted: 'var(--SmartThemeBodyColorTextMuted, #72728a)',
            accent: 'var(--smartThemeMenuColorText, #7c6dfa)', accentDim: 'var(--white30a, rgba(255,255,255,0.3))',
            accentBg: 'var(--white10a, rgba(255,255,255,0.08))',
            headerBg: 'var(--black30a, rgba(0,0,0,0.3))', toolbarBg: 'var(--black50a, rgba(0,0,0,0.25))',
            msgUserBg: 'var(--black30a, rgba(0,0,0,0.18))', msgAiBg: 'rgba(255,255,255,0.025)',
            inputBg: 'var(--black50a, rgba(0,0,0,0.3))', codeBg: 'var(--black50a, rgba(0,0,0,0.35))',
            radius: '10px', danger: '#ff5c5c', success: '#4caf7d',
            shadow: '0 24px 64px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
            border: 'var(--smartThemeBorder, 1px solid rgba(255,255,255,0.09))', font: '',
        },
        
    };

export const THEME_VAR_DEFS = [
        { key: 'bg',         label: 'Background',    hint: 'rgba(r,g,b,a)' },
        { key: 'text',       label: 'Text',          hint: '#hex or rgba' },
        { key: 'textMuted',  label: 'Muted Text',    hint: '#hex or rgba' },
        { key: 'accent',     label: 'Accent',        hint: '#hex or rgba' },
        { key: 'accentDim',  label: 'Accent Dim',    hint: 'rgba(r,g,b,a)' },
        { key: 'accentBg',   label: 'Accent BG',     hint: 'rgba(r,g,b,a)' },
        { key: 'headerBg',   label: 'Header BG',     hint: 'rgba(r,g,b,a)' },
        { key: 'toolbarBg',  label: 'Toolbar BG',    hint: 'rgba(r,g,b,a)' },
        { key: 'msgUserBg',  label: 'User Msg BG',   hint: 'rgba(r,g,b,a)' },
        { key: 'msgAiBg',    label: 'AI Msg BG',     hint: 'rgba(r,g,b,a)' },
        { key: 'inputBg',    label: 'Input BG',      hint: 'rgba(r,g,b,a)' },
        { key: 'codeBg',     label: 'Code BG',       hint: 'rgba(r,g,b,a)' },
        { key: 'danger',     label: 'Danger Color',  hint: '#ff5c5c' },
        { key: 'success',    label: 'Success Color', hint: '#4caf7d' },
        { key: 'blur',       label: 'Blur',          hint: 'blur(14px)' },
        { key: 'border',     label: 'Border',        hint: '1px solid rgba(...)' },
        { key: 'radius',     label: 'Corner Radius', hint: '10px' },
        { key: 'shadow',     label: 'Shadow',        hint: 'CSS box-shadow' },
        { key: 'font',       label: 'Font Family',   hint: "system-ui, sans-serif" },
        { key: 'fontSize',   label: 'Font Size',     hint: '13px' },
    ];

export const THEME_CSS_MAP = {
        bg: '--scp-bg', blur: '--scp-blur', border: '--scp-border',
        text: '--scp-text', textMuted: '--scp-text-muted',
        accent: '--scp-accent', accentDim: '--scp-accent-dim', accentBg: '--scp-accent-bg',
        headerBg: '--scp-header-bg', toolbarBg: '--scp-toolbar-bg',
        msgUserBg: '--scp-msg-user-bg', msgAiBg: '--scp-msg-ai-bg',
        inputBg: '--scp-input-bg', codeBg: '--scp-code-bg',
        radius: '--scp-radius', shadow: '--scp-shadow',
        danger: '--scp-danger', success: '--scp-success', font: '--scp-font',
        fontSize: '--scp-font-size',
    };

export const TOOL_DEFINITIONS = [
        {
            id: 'search_chat',
            name: 'search_chat',
            label: 'Search Chat History',
            icon: 'fa-comments',
            description: 'Search for messages in the main chat. Supports fuzzy matching and regex. Returns message indices for use in chat edits.',
            settingKey: 'toolsEnabled_search_chat',
            schema: {
                type: 'object',
                properties: {
                    queries: { 
                        type: 'array', 
                        items: { type: 'string' }, 
                        description: 'One or more text queries or regexes to search for (prefix with / for regex, e.g. ["/hello.*/i", "hi"]). Returns matches if ANY query matches.' 
                    },
                    role: { type: 'string', enum: ['all', 'user', 'assistant'], description: 'Which messages to search' },
                    from_index: { type: 'number', description: 'Start search from this message index (optional)' },
                    to_index: { type: 'number', description: 'End search at this message index (optional)' },
                    max_results: { type: 'number', description: 'Maximum number of results to return (default 10)' },
                    include_content: { type: 'boolean', description: 'Include full message content in results (default true)' },
                },
                required: ['queries'],
            },
        },
        {
            id: 'search_lorebook',
            name: 'search_lorebook_entry',
            label: 'Search Lorebook Entries',
            icon: 'fa-book',
            description: 'Search for entries in active lorebooks by name, keyword, or content. Supports fuzzy matching and regex. Can filter by constant or outlet type.',
            settingKey: 'toolsEnabled_search_lorebook',
            schema: {
                type: 'object',
                properties: {
                    queries: { 
                        type: 'array', 
                        items: { type: 'string' }, 
                        description: 'One or more text queries or regexes to search for in entry names, keys, and content (prefix with / for regex, e.g. ["/elf.*/i", "elve"]). Returns matches if ANY query matches.' 
                    },
                    book_name: { type: 'string', description: 'Specific lorebook name to search (optional)' },
                    search_in: { type: 'string', enum: ['all', 'name', 'keys', 'content'], description: 'Where to search (default: all)' },
                    only_constant: { type: 'boolean', description: 'If true, return only constant (always-active) entries' },
                    only_outlet: { type: 'boolean', description: 'If true, return only outlet entries (injected via {{outlet::name}} macro)' },
                },
                required: ['queries'],
            },
        },
        {
            id: 'get_lorebooks',
            name: 'get_lorebooks',
            label: 'Get Lorebooks',
            icon: 'fa-book-open',
            description: 'Get all active lorebook names. Optionally list entry names and types for each book.',
            settingKey: 'toolsEnabled_get_lorebooks',
            schema: {
                type: 'object',
                properties: {
                    include_entries: { type: 'boolean', description: 'If true, include entry names/types for each lorebook' },
                    book_name: { type: 'string', description: 'When include_entries is true, limit to this specific lorebook (optional)' },
                },
            },
        },
        {
            id: 'ask_user',
            name: 'ask_user',
            label: 'Ask User',
            icon: 'fa-circle-question',
            description: 'Pause generation and ask the user a question before continuing. Requires streaming to be enabled.',
            settingKey: 'toolsEnabled_ask_user',
            schema: {
                type: 'object',
                properties: {
                    question: { type: 'string', description: 'The question to ask the user' },
                    context: { type: 'string', description: 'Why you need this information (shown to user)' },
                },
                required: ['question'],
            },
        },
        {
            id: 'get_char_info',
            name: 'get_char_info',
            label: 'Get Character Info',
            icon: 'fa-user-pen',
            description: 'Retrieve detailed information about the current character card fields.',
            settingKey: 'toolsEnabled_get_char_info',
            schema: {
                type: 'object',
                properties: {
                    fields: { type: 'array', items: { type: 'string' }, description: 'Which fields to retrieve: description, personality, scenario, first_mes, mes_example, tags, authors_note, alternate_greetings' },
                },
                required: ['fields'],
            },
        },
        {
            id: 'get_chat_stats',
            name: 'get_chat_stats',
            label: 'Get Chat Statistics',
            icon: 'fa-chart-bar',
            description: 'Get statistics about the current chat: message count, approximate tokens, character/user distribution.',
            settingKey: 'toolsEnabled_get_chat_stats',
            schema: { type: 'object', properties: {} },
        },
        {
            id: 'get_recent_messages',
            name: 'get_recent_messages',
            label: 'Get Recent Messages',
            icon: 'fa-list',
            description: 'Retrieve recent messages with their indices. Useful when you need precise message numbers for edits.',
            settingKey: 'toolsEnabled_get_recent_messages',
            schema: {
                type: 'object',
                properties: {
                    count: { type: 'number', description: 'Number of recent messages to retrieve (default 10, max 50)' },
                    from_end: { type: 'boolean', description: 'If true, count from end of chat (default true)' },
                    role: { type: 'string', enum: ['all', 'user', 'assistant'], description: 'Filter by role (default all)' },
                },
            },
        },
    ];

export const I = {
        diff: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>`,
        copy: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
        edit: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
        trash: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
        send: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
        search: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
        refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
        minus: `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
        x: `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        plus: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
        bot: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7" /><ellipse cx="12" cy="12" rx="11" ry="3" transform="rotate(-25 12 12)" /><circle cx="21.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" /></svg>`,
        user: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
        stop: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>`,
        book: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
        opacity: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/></svg>`,
        check: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
        chevron: `<svg class="scp-sess-chevron" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>`,
        gear: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        ghost: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/></svg>`,
        lightning: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
        pick: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="9" y2="10" stroke-width="3" stroke-linecap="round"/><line x1="12" y1="10" x2="12" y2="10" stroke-width="3" stroke-linecap="round"/><line x1="15" y1="10" x2="15" y2="10" stroke-width="3" stroke-linecap="round"/></svg>`,
        star: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        starFill: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        continueArrow: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>`,
        chevronLeft: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>`,
        chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>`,
        chatEdit: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v5Z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/></svg>`,
        paperclip: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
        menu: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
        lock: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    };

export const QP_ICON_POOL = [
        '🔍','💡','📋','✨','🎭','📖','🗺️','⚔️','🧠','💬',
        '🎯','🔮','📝','🌍','❓','🎨','💭','🔥','⚡','🎲',
        '👁️','🧩','📚','🗣️','💫','🌟','🎬','🧪','🏆','🎵',
        '🌙','☀️','🌊','🍃','💎','🛡️','🗡️','🏰','🐉','🦋',
        '🎪','🌀','🔑','💀','🌹','🍷','🎩','🧿','🔔','⭐',
        '🐺','🦊','🐦','🌸','🍄','🔴','🟣','🔵','🟡','🟢',
    ];