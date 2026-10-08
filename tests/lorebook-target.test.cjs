const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const fixture = () => ({
    CLX6: { entries: {
        8: { uid: 8, comment: "Dorian's shift", content: 'Original shift', key: [] },
        21: { uid: 21, comment: 'Dorian', content: 'Original character', key: [] },
        22: { uid: 22, comment: 'Daphne with Clara and Dorian', content: 'Relationships', key: [] },
    } },
});

// Exercise the shipped bundle too, without loading the app or touching user data.
function extract(file, name, nextName) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const start = source.indexOf('async function ' + name + '(');
    const end = source.indexOf('function ' + nextName + '(', start);
    assert.ok(start >= 0 && end > start);
    return source.slice(start, end).replace(/(?:export\s+)?(?:async\s+)?$/, '');
}

function harness(bundle, books = fixture(), failSave = false) {
    const saved = [];
    const history = [];
    const context = vm.createContext({
        structuredClone,
        console: { log() {}, warn() {}, error() {} },
        EMBEDDED_BOOK_KEY: '__embedded__', EXT_DISPLAY: 'Test',
        getDisplayName: name => name,
        getActiveLorebookNames: () => Object.keys(books),
        fetchWorldInfoBook: async name => context.wiCache[name] || books[name] || null,
        saveWorldInfoBook: async (name, data) => { if (failSave) throw new Error('Save failed'); books[name] = structuredClone(data); saved.push(name); },
        bindNewLorebookToCharacter: async () => { throw new Error('Unexpected creation'); },
        wiCache: {}, lastActiveEntries: [],
        toastr: { error() {}, warning() {} },
        translate: text => text,
        t: (strings, ...values) => strings.reduce((s, part, i) => s + part + (values[i] ?? ''), ''),
        recordStat() {}, SM: { lb: 'lb' }, _dbgAdd() {},
        logLBHistoryChanges: changes => history.push(...changes),
    });
    vm.runInContext(extract(bundle ? 'index.js' : 'src/features/feature-lorebook-engine.js', 'resolveLBChangeTarget', 'expandOutletsAsync'), context);
    vm.runInContext(extract(bundle ? 'index.js' : 'src/features/feature-lorebook-ui.js', 'applyLBChanges', 'renderProposalCard'), context);
    return { context, books, saved, history };
}

for (const bundle of [false, true]) {
    const label = bundle ? 'shipped bundle' : 'source';
    test(label + ': exact UID beats earlier substring and stale preview name', async () => {
        const { context } = harness(bundle);
        for (const strict of [false, true]) {
            for (const uid of [21, '21']) {
                const result = await context.resolveLBChangeTarget({ worldName: 'CLX6', uid, name: 'Dorian', originalName: "Dorian's shift" }, strict);
                assert.equal(result.origEntry.uid, 21);
            }
        }
    });
    test(label + ': name-only resolution is exact and unambiguous', async () => {
        const { context, books } = harness(bundle);
        assert.equal((await context.resolveLBChangeTarget({ worldName: 'CLX6', name: 'Dorian' })).origEntry.uid, 21);
        assert.equal((await context.resolveLBChangeTarget({ worldName: 'CLX6', name: 'Dori' })).origEntry, null);
        books.CLX6.entries[30] = { uid: 30, comment: 'Dorian' };
        assert.equal((await context.resolveLBChangeTarget({ worldName: 'CLX6', name: 'Dorian' })).origEntry, null);
    });
    test(label + ': missing IDs and wrong books cannot redirect a write', async () => {
        const { context } = harness(bundle);
        for (const change of [
            { worldName: 'CLX6', uid: 999, name: 'Dorian' },
            { worldName: 'CLX', uid: 21, name: 'Dorian' },
            { uid: 21, name: 'Dorian' },
        ]) assert.equal((await context.resolveLBChangeTarget(change)).origEntry, null);
    });
    test(label + ': unspecified book requires a globally unique exact name', async () => {
        const { context, books } = harness(bundle);
        assert.equal((await context.resolveLBChangeTarget({ name: 'Dorian' })).origEntry.uid, 21);
        books.Other = structuredClone(books.CLX6);
        assert.equal((await context.resolveLBChangeTarget({ name: 'Dorian' })).origEntry, null);
    });
    test(label + ': saving Dorian leaves the shift and relationship entries untouched', async () => {
        const { context, books, saved, history } = harness(bundle);
        const before = structuredClone(books.CLX6.entries);
        const change = { action: 'edit', worldName: 'CLX6', uid: 21, name: 'Dorian', originalName: "Dorian's shift", content: 'Revised character' };
        const applied = await context.applyLBChanges([change]);
        assert.equal(applied.length, 1);
        assert.equal(books.CLX6.entries[21].content, 'Revised character');
        assert.deepEqual(books.CLX6.entries[8], before[8]);
        assert.deepEqual(books.CLX6.entries[22], before[22]);
        assert.deepEqual(saved, ['CLX6']);
        assert.equal(history.length, 1);
    });
    test(label + ': invalid targets and failed saves are not reported as applied', async () => {
        const { context, saved, history } = harness(bundle);
        assert.equal((await context.applyLBChanges([{ action: 'edit', worldName: 'CLX6', uid: 999, name: 'Dorian', content: 'Wrong' }])).length, 0);
        assert.equal(saved.length, 0);
        assert.equal(history.length, 0);
        const failed = harness(bundle, fixture(), true);
        assert.equal((await failed.context.applyLBChanges([{ action: 'edit', worldName: 'CLX6', uid: 21, content: 'Revised' }])).length, 0);
        assert.equal(failed.history.length, 0);
        assert.equal(failed.books.CLX6.entries[21].content, 'Original character');
        assert.equal(failed.context.wiCache.CLX6, undefined);
    });
    test(label + ': renaming and UID zero still work', async () => {
        const { context, books } = harness(bundle);
        books.CLX6.entries[0] = { uid: 0, comment: 'Original', content: 'Original' };
        const applied = await context.applyLBChanges([{ action: 'edit', worldName: 'CLX6', uid: 0, name: 'Renamed', content: 'New' }]);
        assert.equal(applied.length, 1);
        assert.equal(books.CLX6.entries[0].comment, 'Renamed');
    });
    test(label + ': batch edits share a working copy and only valid changes are accepted', async () => {
        const { context, books, saved } = harness(bundle);
        const changes = [
            { action: 'edit', worldName: 'CLX6', uid: 21, content: 'Revised character' },
            { action: 'edit', worldName: 'CLX6', uid: 999, content: 'Must not be saved' },
            { action: 'append', worldName: 'CLX6', uid: 21, content: ' plus details' },
        ];
        const applied = await context.applyLBChanges(changes);
        assert.equal(applied.length, 2);
        assert.ok(!applied.includes(changes[1]));
        assert.equal(books.CLX6.entries[21].content, 'Revised character plus details');
        assert.equal(books.CLX6.entries[8].content, 'Original shift');
        assert.deepEqual(saved, ['CLX6']);
    });
}
