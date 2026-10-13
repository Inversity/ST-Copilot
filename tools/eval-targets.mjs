// Planted targets for the Copilot tool eval (bench-fixtures.mjs --eval 1 writes them into the
// synthetic data; eval-score.mjs checks proposals against them). Every planted string is unique
// in the generated data unless stated otherwise.

export const EVAL = {
    // Twelve alternate greetings, each opening at its own place. Greetings 1-3 are sent in full;
    // 4-12 are only listed (or, before the change, not shown at all).
    greetingPlaces: ['the north gate', 'Orrin Ford', 'the Sunken Mill', 'Tallow Keep', 'Marrow Bridge', 'Cindervale',
        'Quillhollow', 'Vellum Pass', 'the Saltreach', 'Harrowgate', 'the Lantern Road', 'Brackenmoor'],
    greetingsInContext: [0, 1, 2],  // 0-based, as stored in settings.altGreetingIndices

    // In the middle of the description.
    descriptionNeedle: 'Ranger once mapped the Saltreach marshes in a single season.',
    // Twice in the description, on purpose.
    duplicatePhrase: 'Never cross the ford after dark.',

    // Deep inside one long assistant message, past every preview cut-off.
    chatNeedle: "The ferryman's lantern was painted cobalt blue.",
    chatNeedleMinOffset: 1500,

    // A lorebook entry whose keyword never appears in the chat, so it is never sent as context.
    loreNeedleEntry: 'Hollowmere Well',
    loreNeedleKey: 'Hollowmere',
    loreNeedle: 'The well runs dry every third winter.',
    outletEntry: 'Gate Rules',          // position 7 (outlet)
    examplesTopEntry: 'Example Tone',   // position 5 (top of example messages), not an outlet
};
