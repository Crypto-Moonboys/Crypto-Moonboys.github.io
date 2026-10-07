import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const guide = createRequire(import.meta.url)('../js/moonpet-guide.js');
const check = process.argv.includes('--check');
const blocks = [
  ['how-to-play-crypto-moonboy-pets.html', 'GUIDE', guide.website(guide.sections, 'section')],
  ['wiki/crypto-moonboy-pets.html', 'ABOUT', guide.website(guide.about, 'wiki-section')],
  ['wiki/crypto-moonboy-pets.html', 'START', guide.website(guide.sections.filter(s => ['start', 'incubation', 'pets', 'navigation', 'audio'].includes(s.id)), 'wiki-section')]
];
for (const [file, marker, content] of blocks) {
  const url = new URL('../' + file, import.meta.url);
  const before = await fs.readFile(url, 'utf8');
  const pattern = new RegExp('<!-- MOONPET_' + marker + ':BEGIN -->[\\s\\S]*?<!-- MOONPET_' + marker + ':END -->');
  if (!pattern.test(before)) throw new Error('Missing Moonpet guidance marker: ' + file + ':' + marker);
  const after = before.replace(pattern, '<!-- MOONPET_' + marker + ':BEGIN -->\n' + content + '\n<!-- MOONPET_' + marker + ':END -->');
  if (check && after !== before) throw new Error('Stale Moonpet guidance: run node scripts/sync-moonpet-guide.mjs');
  if (!check && after !== before) await fs.writeFile(url, after);
}
console.log(check ? 'Moonpet website guidance matches shared copy.' : 'Moonpet website guidance synchronized.');
