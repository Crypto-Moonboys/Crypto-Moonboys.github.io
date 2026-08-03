#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const homepagePath = path.join(ROOT, 'index.html');
const heroImagePath = path.join(ROOT, 'img/homepage/BUILD A CRYPTO MOONBOY HERO PIC.jpg');

let failures = 0;

function check(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
    failures += 1;
  }
}

const html = fs.readFileSync(homepagePath, 'utf8');

const heroStart = html.indexOf('<section class="build-moonboy-hero" aria-label="Build a Crypto Moonboy"');
const heroEnd = html.indexOf('</section>', heroStart);
const bitcoinKidStart = html.indexOf('<section class="build-moonboy-hero" aria-label="Crypto Moonboys Bitcoin Kid profile"');
const bitcoinKidEnd = html.indexOf('</section>', bitcoinKidStart);
const builderStart = html.indexOf('<section class="homepage-avatar-builder avatar-builder-host"');
const builderEnd = html.indexOf('</section>', builderStart);
const introStart = html.indexOf('<section class="hero-intro"');
const introEnd = html.indexOf('</section>', introStart);
const introMarkup = introStart !== -1 && introEnd !== -1
  ? html.slice(introStart, introEnd + '</section>'.length)
  : '';

check(heroStart !== -1, 'Homepage contains the Build a Crypto Moonboy hero section');
check(fs.existsSync(heroImagePath), 'Build a Crypto Moonboy hero image exists in the repository');
check(
  html.includes('/img/homepage/BUILD%20A%20CRYPTO%20MOONBOY%20HERO%20PIC.jpg'),
  'Homepage uses the approved full-width Build a Crypto Moonboy hero image'
);
check(
  !html.includes('CRYPTO%20MOONBOYS%20AND%20SWARMSY%20SIDE%20TWO.jpg') &&
    !html.includes('CRYPTO%20MOONBOYS%20AND%20SWARMSY%20SIDE%20one.jpg'),
  'Old stitched homepage hero images are absent'
);
check(
  bitcoinKidEnd !== -1 && builderStart > bitcoinKidEnd && introStart > builderEnd,
  'Avatar builder sits after the Bitcoin Kid profile and before the mission section'
);
check(
  introMarkup.includes('Now you have something worth shouting about.<br><span>We make sure people remember it.</span>'),
  'Mission heading remains unchanged'
);
check(
  /<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(introMarkup) &&
    /<p\b[^>]*>[\s\S]*?<\/p>/i.test(introMarkup),
  'Mission heading and supporting copy remain beneath the new hero image'
);
check(
  /\.build-moonboy-hero\s*\{[^}]*width\s*:\s*100%/is.test(html),
  'Hero section is explicitly full width'
);
check(
  /\.build-moonboy-hero img\s*\{[^}]*display\s*:\s*block[^}]*width\s*:\s*100%[^}]*height\s*:\s*auto/is.test(html),
  'Hero image is responsive and preserves its aspect ratio'
);
check(
  !/class=["'][^"']*home-hero-left/.test(html) &&
    !/class=["'][^"']*home-hero-right/.test(html),
  'Homepage no longer uses the old split hero structure'
);

if (failures > 0) {
  console.error(`\nHomepage Build a Moonboy hero audit failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('\nHomepage Build a Moonboy hero audit passed.');
