#!/usr/bin/env node
/**
 * live-content-truth-verify.mjs
 *
 * Manual/post-deploy guard for stale public HTML and mission drift on cryptomoonboys.com.
 *
 * The browser-facing site can look current while crawlers, curl, or CDN variants still
 * receive old machine-readable HTML. This script fetches raw public HTML with several
 * user agents and fails when canonical pages expose retired copy or omit the current
 * README-backed identity-first model.
 */

import https from 'node:https';

const BASE = (process.env.LIVE_SITE_BASE || 'https://cryptomoonboys.com').replace(/\/$/, '');

const USER_AGENTS = [
  'live-content-truth-verify/1.0',
  'Mozilla/5.0 (compatible; CryptoMoonboysTruthBot/1.0; +https://cryptomoonboys.com)',
  'curl/8.0.0',
];

const GLOBAL_BANNED = [
  {
    needle: 'THE WIKI IS ALIVE',
    reason: 'old wiki-first homepage shell still being served',
  },
  {
    needle: 'Read the lore. Play the arcade. Earn XP',
    reason: 'old game/Xp-first positioning still being served',
  },
  {
    needle: 'START FREE → PLAY GAMES → EARN XP AND RANK UP → RECEIVE NFT REWARDS',
    reason: 'old reward-farm onboarding copy still being served',
  },
  {
    needle: 'world\'s first Living Web3 Wiki',
    reason: 'old wiki-first About positioning still being served',
  },
  {
    needle: 'Living Web3 Wiki',
    reason: 'old wiki-first branding is no longer current positioning',
  },
  {
    needle: 'Play. Earn. Build.',
    reason: 'old arcade shell branding still being served',
  },
  {
    needle: 'BECOME A MOONBOY — JOIN THE HODL WARRIOR ARMY',
    reason: 'old community page reduces onboarding to HODL Warrior recruitment',
  },
  {
    needle: 'JOIN THE HODL WARRIORS',
    reason: 'HODL Warriors is a qualifying 1/1 builder role, not a directly selectable faction or generic join CTA',
  },
];

const PAGES = [
  {
    path: '/',
    label: 'home root',
    required: [
      'Crypto Moonboys is the creator umbrella',
      'PATH 1 — BUILD A MOONBOY IDENTITY',
      'PATH 2 — KEEP THE IDENTITY YOU ALREADY HAVE',
      'ONE UMBRELLA. TWO PATHS. ONE CREATOR MOVEMENT.',
    ],
    banned: [
      'THE WIKI IS ALIVE',
      'Read the lore. Play the arcade. Earn XP',
      'Browse by Category',
      'Recent Articles',
    ],
  },
  {
    path: '/index.html',
    label: 'home index',
    required: [
      'Crypto Moonboys is the creator umbrella',
      'PATH 1 — BUILD A MOONBOY IDENTITY',
      'PATH 2 — KEEP THE IDENTITY YOU ALREADY HAVE',
      'ONE UMBRELLA. TWO PATHS. ONE CREATOR MOVEMENT.',
    ],
    banned: [
      'THE WIKI IS ALIVE',
      'Read the lore. Play the arcade. Earn XP',
      'Browse by Category',
      'Recent Articles',
    ],
  },
  {
    path: '/community.html',
    label: 'community Path 1',
    required: [
      'PATH 1 / MOONBOY IDENTITY / BATTLE CHAMBER',
      'A Moonboy is a character identity you can build a brand, products, stories, content and community around.',
      'Already an artist, business, product, brand or project?',
      'This is a creator-army role—not one of the nine selectable factions.',
    ],
    banned: [
      'BECOME A MOONBOY — JOIN THE HODL WARRIOR ARMY',
      'JOIN THE HODL WARRIOR ARMY',
      'Start free. Play games. Earn XP. Claim rewards.',
    ],
  },
  {
    path: '/about.html',
    label: 'about',
    required: [
      'Crypto Moonboys is the Graffiti Kings creator umbrella',
      'Build a Moonboy identity or bring the identity, art, business, product or brand you already own.',
      'Crypto Moonboys is not a game, NFT project, wiki, token project or chatbot.',
      'The tools serve the umbrella.',
    ],
    banned: [
      'world\'s first Living Web3 Wiki',
      'THE WIKI IS ALIVE',
      'Read the lore. Play the arcade. Earn XP',
    ],
  },
  {
    path: '/swarmsy.html',
    label: 'swarmsy',
    required: [
      'SWARMSY',
      'SPARKY',
      'Memory locks stop drift',
      'Proof before claims',
    ],
    banned: [
      'Crypto Moonboys is the living Web3 wiki',
      'Return to the living public archive',
      'BACK TO THE WIKI',
    ],
  },
  {
    path: '/wiki/crypto-moonboys.html',
    label: 'canonical wiki entry',
    required: [
      'CRYPTO MOONBOYS',
      'ONE UMBRELLA. TWO WAYS TO JOIN.',
      'Crypto Moonboys is not a game.',
      'THE TWO PATHS COMPARED',
    ],
    banned: [
      'THE WIKI IS ALIVE',
      'Start free. Play games. Earn XP. Claim rewards.',
    ],
  },
];

let failed = 0;
let checks = 0;

function ok(message) {
  checks += 1;
  process.stdout.write(`[PASS] ${message}\n`);
}

function fail(message) {
  checks += 1;
  failed += 1;
  process.stderr.write(`[FAIL] ${message}\n`);
}

function fetchText(url, userAgent) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.setTimeout(30000, () => {
      req.destroy(new Error(`timeout fetching ${url}`));
    });
    req.on('error', reject);
  });
}

function normalise(value) {
  return String(value || '').toLocaleLowerCase('en-GB');
}

function includesCaseInsensitive(body, needle) {
  return normalise(body).includes(normalise(needle));
}

function findCaseInsensitive(body, needle) {
  return normalise(body).indexOf(normalise(needle));
}

function compactSnippet(body, needle) {
  const index = findCaseInsensitive(body, needle);
  if (index < 0) return '';
  const start = Math.max(0, index - 80);
  const end = Math.min(body.length, index + needle.length + 80);
  return body.slice(start, end).replace(/\s+/g, ' ').trim();
}

async function verifyPage(spec, userAgent) {
  const url = `${BASE}${spec.path}`;
  let response;
  try {
    response = await fetchText(url, userAgent);
  } catch (error) {
    fail(`${spec.label} ${spec.path} fetch failed for UA "${userAgent}": ${error.message}`);
    return;
  }

  const body = response.body || '';
  const cfCache = response.headers['cf-cache-status'] || 'unknown';
  process.stdout.write(`\n== ${spec.label} ${spec.path} | UA: ${userAgent} | HTTP ${response.status} | cf-cache ${cfCache} ==\n`);

  if (response.status >= 200 && response.status < 400) {
    ok(`${spec.path} returned HTTP ${response.status}`);
  } else {
    fail(`${spec.path} returned HTTP ${response.status}`);
  }

  if (includesCaseInsensitive(body, '<html') || includesCaseInsensitive(body, '<!DOCTYPE html')) {
    ok(`${spec.path} returned HTML`);
  } else {
    fail(`${spec.path} did not return recognisable HTML`);
  }

  for (const needle of spec.required) {
    if (includesCaseInsensitive(body, needle)) {
      ok(`${spec.path} contains required truth: ${needle}`);
    } else {
      fail(`${spec.path} missing required truth: ${needle}`);
    }
  }

  const banned = [...GLOBAL_BANNED.map((entry) => entry.needle), ...(spec.banned || [])];
  for (const needle of [...new Set(banned)]) {
    if (includesCaseInsensitive(body, needle)) {
      const globalMatch = GLOBAL_BANNED.find((entry) => normalise(entry.needle) === normalise(needle));
      const reason = globalMatch ? ` — ${globalMatch.reason}` : '';
      const snippet = compactSnippet(body, needle);
      fail(`${spec.path} contains banned stale/conflicting copy: ${needle}${reason}${snippet ? `\n       snippet: ${snippet}` : ''}`);
    } else {
      ok(`${spec.path} does not contain banned copy: ${needle}`);
    }
  }
}

for (const userAgent of USER_AGENTS) {
  for (const spec of PAGES) {
    await verifyPage(spec, userAgent);
  }
}

process.stdout.write(`\nLive content truth verification complete: ${checks} checks, ${failed} failed.\n`);

if (failed > 0) {
  process.exit(1);
}
