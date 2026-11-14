// Focused manual regression check for the companion Graffiti Kings links.
// Run: node scripts/check-graffiti-kings-reciprocal-links.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SITE = 'https://graffitikings.com';
const begin = '<!-- GK_COMPANION_LINKS:BEGIN -->';
const end = '<!-- GK_COMPANION_LINKS:END -->';
const expectedLinks = new Map(Object.entries({
  'index.html': 4,
  'about.html': 3,
  'about/graffiti-kings.html': 4,
  'graffiti-kings-creative-guide.html': 3,
  'wiki/graffiti-kings.html': 4,
  'wiki/darren-cullen.html': 4,
  'wiki/charlie-buster.html': 5,
  'wiki/crypto-moonboys.html': 4,
  'wiki/gkniftyheads.html': 3,
  'wiki/graffpunks.html': 4,
  'wiki/nbg.html': 3,
  'wiki/waxp.html': 4,
  'wiki/graffiti-queens-in-decentraland.html': 3,
  'wiki/graffpunks-24-7-radio.html': 3,
  'wiki/graffpunks-ecosystem.html': 3,
  'wiki/nbg-token.html': 3,
  'wiki/noballgamess-nft-collection.html': 2,
  'wiki/xrp-kids.html': 3,
  'wiki/bitcoin-kid-army.html': 2,
}));
// Verified against the public archive's merged sitemap before the PR.
const targetPaths = new Set([
  '/', '/about.html', '/history.html',
  '/characters/darren-cullen.html', '/characters/charlie-buster.html',
  '/pages/darren-cullen-ser-history.html',
  '/pages/graffiti-kings-web-network.html',
  '/pages/graffiti-queens-decentraland-2021.html',
  '/pages/graffiti-queens-nft-festival-2022.html',
  '/pages/graffiti-kings-wax-nft-collections.html',
  '/pages/crypto-moonboys-gkniftyheads-network.html',
  '/pages/bitcoin-kid-invasion-toys-archive.html',
  '/pages/charlie-buster-grime-art-history.html',
  '/pages/charlie-buster-no-ball-games-nbg.html',
  '/pages/charlie-buster-treef-project.html',
  '/pages/charlie-buster-source-network.html',
  '/pages/music.html', '/pages/nft-collections.html',
  '/factions/graffpunks.html', '/factions/gkniftyheads.html',
  '/factions/no-ball-games-legion.html'
]);
const errors = [];
let total = 0;
for (const [filename, count] of expectedLinks) {
  const absolute = path.join(ROOT, filename);
  if (!fs.existsSync(absolute)) {
    errors.push(filename + ': source file missing');
    continue;
  }
  const content = fs.readFileSync(absolute, 'utf8');
  if (content.split(begin).length !== 2 || content.split(end).length !== 2) {
    errors.push(filename + ': expected exactly one bounded reciprocal-links section');
    continue;
  }
  const open = content.indexOf(begin);
  const close = content.indexOf(end);
  if (open > close || !content.includes('<main') ||
      open < content.indexOf('<main') || close > content.lastIndexOf('</main>')) {
    errors.push(filename + ': reciprocal links must be inside the document main element');
    continue;
  }
  const block = content.slice(open + begin.length, close);
  const links = [...block.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi)];
  if (links.length !== count) {
    errors.push(filename + ': expected ' + count + ' links, found ' + links.length);
  }
  const seen = new Set();
  for (const link of links) {
    const attr = link[1];
    const href = attr.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const label = link[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!href || !label || label.length < 6) {
      errors.push(filename + ': reciprocal link missing destination or readable text');
      continue;
    }
    let url;
    try { url = new URL(href); }
    catch { errors.push(filename + ': invalid URL ' + href); continue; }
    if (url.origin !== SITE || !targetPaths.has(url.pathname) || url.search || url.hash) {
      errors.push(filename + ': unapproved or noncanonical target ' + href);
    }
    if (seen.has(href)) errors.push(filename + ': duplicate target ' + href);
    seen.add(href);
    if (!/\btarget=["']_blank["']/i.test(attr) ||
        !/\brel=["'][^"']*\bnoopener\b[^"']*\bnoreferrer\b[^"']*["']/i.test(attr)) {
      errors.push(filename + ': link missing safe external-window attributes: ' + href);
    }
  }
  total += links.length;
}
if (errors.length) {
  for (const error of errors) console.error('ERROR:', error);
  process.exitCode = 1;
} else {
  console.log('Graffiti Kings companion links passed:', expectedLinks.size,
    'relevant pages,', total, 'contextual links, no duplicate or unrecognised destinations.');
}
