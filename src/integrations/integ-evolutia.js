import { getCurrentPersonaId } from '../utils/util-st.js';

export function _getAspectEvolutiaCharFields() {
    try {
        const ctx = SillyTavern.getContext();
        const char = ctx.characters?.[ctx.characterId];
        if (!char) return null;
        const AE_KEY = 'st-description-swap-fields';
        const state = char.data?.extensions?.[AE_KEY];
        if (!state || !state.swapEnabled) return null;
        const activeId = state.activeAlterEgoId || 'base';
        const alterEgos = Array.isArray(state.alterEgos) ? state.alterEgos : [];
        const activeEgo = alterEgos.find(a => a.id === activeId) || alterEgos[0];
        const fields = Array.isArray(activeEgo?.fields) ? activeEgo.fields : (Array.isArray(state.fields) ? state.fields : []);
        const enabled = fields.filter(f => f.enabled !== false && f.content?.trim());
        if (!enabled.length) return null;
        return enabled.map(f => ({ id: f.id, name: f.name || 'Field', content: f.content }));
    } catch(_) { return null; }
}

export function _getAspectEvolutiaPersonaFields() {
    try {
        const ctx = SillyTavern.getContext();
        const pu = ctx.powerUserSettings || {};
        const personaId = getCurrentPersonaId();
        if (!personaId) return null;

        const AE_KEY = 'st-description-swap-fields';
        const personaState = pu[AE_KEY]?.personaDynamicFields?.[personaId];
        if (!personaState || !personaState.swapEnabled) return null;
        
        const activeId = personaState.activeAlterEgoId || 'base';
        const alterEgos = Array.isArray(personaState.alterEgos) ? personaState.alterEgos : [];
        const activeEgo = alterEgos.find(a => a.id === activeId) || alterEgos[0];
        const fields = Array.isArray(activeEgo?.fields) ? activeEgo.fields : (Array.isArray(personaState.fields) ? personaState.fields : []);
        const enabled = fields.filter(f => f.enabled !== false && f.content?.trim());
        if (!enabled.length) return null;
        return enabled.map(f => ({ id: f.id, name: f.name || 'Field', content: f.content }));
    } catch(e) { return null; }
}