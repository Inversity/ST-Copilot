export const state = {
    generating: false,
    copilotActive: false,
    configDirty: false,
    themeDirty: false,
    activeToolCalls: [],
    // Model and connection profile of the generation in flight; stamped onto each reply/swipe.
    genMeta: null,
    // Final request bodies as they left (newest first, max 5), for the Context modal's Last sent tab.
    requestLog: [],
    // Idle watch of the stream in flight ({ touch, stop }), see startStreamIdleWatch in api.js.
    streamIdle: null,
    searchQuery: '',
    searchMatches: [],
    searchIdx: -1,
    searchOpen: false,
    searchWholeWord: false,
    searchHotkeyHandler: null,
    pendingAttachments: [],
    lbActiveBook: null,
    lbSearchQuery: '',
    lbEntryDetailEntry: null,
    lbEntryDetailBook: null,
    lastChatLen: -1,
    userScrolledUp: false,
    savedScrollTop: 0,
    abortController: null,
    htmlBlockCounter: 0,
    htmlBlockRegistry: new Map(),
    tokenCountCache: new Map(),
    tokenCountPromises: new Map()
};

export const DBG_STATE = {
    log: [],
    MAX: 3000,
    sessionStart: new Date().toISOString(),
    snapshot: null,
    diffTid: null
};

export const DBG_SKIP = new Set([
    'customTheme','savedThemes','sessions','starredMessages',
    'stats','quickPromptSets','customSounds','completionSoundData',
    'quickPrompts','profiles','promptPresets','altGreetingIndices',
    'windowBgUrl','customBackgrounds','memories'
]);