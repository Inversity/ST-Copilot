// Builds the UI map page (docs/ui-map/index.html) from docs/ui-inventory.json and
// tools/ui-map.template.html. The page is published as a Claude artifact with the
// screenshots from docs/screens served beside it as screens/<id>.jpg.
//
//   node tools/build-ui-map.mjs
//
// It also checks that every screenshot a node names exists, and lists captures no node uses.

import fs from 'node:fs';

const inv = JSON.parse(fs.readFileSync('docs/ui-inventory.json', 'utf8'));
const template = fs.readFileSync('tools/ui-map.template.html', 'utf8');

const have = new Set(fs.readdirSync('docs/screens').filter(f => f.endsWith('.jpg')).map(f => f.slice(0, -4)));
const named = new Set(inv.nodes.flatMap(n => n.screens || []));
const missing = [...named].filter(s => !have.has(s));
const unused = [...have].filter(s => !named.has(s));
const ids = inv.nodes.map(n => n.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
const orphans = inv.nodes.filter(n => n.parent && !ids.includes(n.parent)).map(n => n.id);
// Finding ids key the answers stored in the map: never renumber them, give new findings new ids.
const fids = inv.nodes.flatMap(n => (n.findings || []).map(f => f.id));
const badFindings = fids.filter((id, i) => !id || fids.indexOf(id) !== i);
if (missing.length || dupes.length || orphans.length || badFindings.length) {
    console.error({ missing, dupes, orphans, badFindings });
    process.exit(1);
}

// JSON inside <script>: a "</" would end the element early.
const json = JSON.stringify(inv).replace(/<\//g, '<\\/');
fs.mkdirSync('docs/ui-map', { recursive: true });
fs.writeFileSync('docs/ui-map/index.html', template.replace('/*INVENTORY*/', () => json));
console.log(`docs/ui-map/index.html: ${inv.nodes.length} nodes, ${named.size} screenshots${unused.length ? `; unused captures: ${unused.join(', ')}` : ''}`);
