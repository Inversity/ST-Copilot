// Resolve against ST's locale at call time; the source English text is the key.
export function t(strings, ...values) {
    const ctx = SillyTavern.getContext();
    if (typeof ctx.t === 'function') return ctx.t(strings, ...values);
    return strings.reduce((out, s, i) => out + s + (i < values.length ? values[i] : ''), '');
}

export function translate(text) {
    const ctx = SillyTavern.getContext();
    return typeof ctx.translate === 'function' ? ctx.translate(text) : text;
}
