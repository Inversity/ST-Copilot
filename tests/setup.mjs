import { register } from 'node:module';

register('./loader.mjs', import.meta.url);

// Minimal browser globals needed at module load time.
globalThis.window = globalThis.window || { addEventListener() {} };
globalThis.toastr = { warning() {}, error() {}, success() {}, info() {} };
globalThis.SillyTavern = {
    getContext: () => globalThis.__stContext || { characters: [], name1: 'User' },
};
