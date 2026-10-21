// Snapshot the daily model bench (btsouth/model-canary) for /bench. Writes
// src/data/bench.json only when the results changed. Before the first run the
// summary doesn't exist yet, and the page shows when the first run lands.
//
//   node scripts/fetch-bench.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const URL_ = 'https://raw.githubusercontent.com/btsouth/model-canary/main/results/summary.json';
const OUT = new URL('../src/data/bench.json', import.meta.url);

const res = await fetch(URL_, { headers: { 'User-Agent': 'btso-dev-site' } });
let next;
if (res.status === 404) next = { models: {} };
else if (!res.ok) {
  console.error(`Bench summary request failed: ${res.status}`);
  process.exit(1);
} else {
  next = await res.json();
  if (typeof next.models !== 'object') {
    console.error('Bench summary has no models.');
    process.exit(1);
  }
}

const text = `${JSON.stringify(next)}\n`;
if (existsSync(OUT) && readFileSync(OUT, 'utf8') === text) console.log('Bench data unchanged.');
else {
  writeFileSync(OUT, text);
  console.log(`Wrote bench data for ${Object.keys(next.models).length} models.`);
}
