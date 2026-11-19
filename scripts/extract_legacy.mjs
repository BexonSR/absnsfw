// One-time migration helper: pulls the catalog data and hero SVG out of the
// legacy single-file build (legacy/crimson_original.html).
// Usage: node scripts/extract_legacy.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const lines = readFileSync('legacy/crimson_original.html', 'utf8').split(/\r?\n/);

// Hero artwork (lines 1317-1443, 1-based) -> assets/hero-art.svg
const svg = lines.slice(1316, 1443).map((l) => l.replace(/^ {8}/, '')).join('\n');
writeFileSync('assets/hero-art.svg', svg, 'utf8');

// Catalog / notifications / subtitles -> data/catalog.json
const code = [...lines.slice(1448, 1737), ...lines.slice(1738, 1746)].join('\n');
const ctx = vm.createContext({});
vm.runInContext(
  code + '\nthis.out = { titles: CATALOG, notifications: INITIAL_NOTIFICATIONS, subtitles: SUBTITLE_SCRIPT };',
  ctx
);
writeFileSync('data/catalog.json', JSON.stringify(ctx.out, null, 2), 'utf8');
console.log(`titles: ${ctx.out.titles.length}, notifications: ${ctx.out.notifications.length}, subtitles: ${ctx.out.subtitles.length}`);
