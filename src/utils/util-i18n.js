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

const LOCALE_FILES = ['ko-kr'];

// Must run before any UI is injected: data-i18n is resolved when elements are inserted.
export async function loadLocale(extPath) {
    const ctx = SillyTavern.getContext();
    const locale = typeof ctx.getCurrentLocale === 'function' ? ctx.getCurrentLocale() : 'en';
    if (!locale || locale === 'en' || typeof ctx.addLocaleData !== 'function') return;
    // Browsers may report a bare language ("ko") where ST resolves the locale from navigator.language.
    const file = LOCALE_FILES.includes(locale) ? locale : LOCALE_FILES.find(f => f.split('-')[0] === locale.split('-')[0]);
    if (!file) return;
    try {
        const res = await fetch(`/scripts/extensions/${extPath}/i18n/${file}.json`);
        if (!res.ok) return;
        ctx.addLocaleData(locale, await res.json());
    } catch (e) {
        console.warn('[ST-Copilot] Failed to load locale', locale, e);
    }
}
