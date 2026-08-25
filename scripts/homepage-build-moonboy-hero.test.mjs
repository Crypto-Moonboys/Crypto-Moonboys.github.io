#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const homepagePath = path.join(ROOT, 'index.html');
const heroImages = [
  {
    sectionLabel: 'Crypto Moonboys Bad Days 1',
    publicPath: '/img/homepage/CRYPTO%20MOONBOYS%20BAD%20DAYS%20V1.jpg',
    repoPath: path.join(ROOT, 'img/homepage/CRYPTO MOONBOYS BAD DAYS V1.jpg'),
  },
  {
    sectionLabel: 'Crypto Moonboys Bad Days 2',
    publicPath: '/img/homepage/CRYPTO%20MOONBOYS%20BAD%20DAYS%20V2.jpg',
    repoPath: path.join(ROOT, 'img/homepage/CRYPTO MOONBOYS BAD DAYS V2.jpg'),
  },
  {
    sectionLabel: 'Crypto Moonboys Bad Days 3',
    publicPath: '/img/homepage/CRYPTO%20MOONBOYS%20BAD%20DAYS%20V3.jpg',
    repoPath: path.join(ROOT, 'img/homepage/CRYPTO MOONBOYS BAD DAYS V3.jpg'),
  },
  {
    sectionLabel: 'Crypto Moonboys Bad Days 4',
    publicPath: '/img/homepage/CRYPTO%20MOONBOYS%20BAD%20DAYS%20V4.jpg',
    repoPath: path.join(ROOT, 'img/homepage/CRYPTO MOONBOYS BAD DAYS V4.jpg'),
  },
  {
    sectionLabel: 'Crypto Moonboys Bad Days 5',
    publicPath: '/img/homepage/CRYPTO%20MOONBOYS%20BAD%20DAYS%20V5.jpg',
    repoPath: path.join(ROOT, 'img/homepage/CRYPTO MOONBOYS BAD DAYS V5.jpg'),
  },
];

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

const heroPositions = heroImages.map(({ sectionLabel, publicPath }) => ({
  sectionLabel,
  publicPath,
  start: html.indexOf(`<section class="build-moonboy-hero" aria-label="${sectionLabel}"`),
}));
const lastHeroEnd = heroPositions.length
  ? html.indexOf('</section>', heroPositions[heroPositions.length - 1].start)
  : -1;
const builderStart = html.indexOf('<section class="homepage-avatar-builder avatar-builder-host"');
const introStart = html.indexOf('<section class="hero-intro"');
const introEnd = html.indexOf('</section>', introStart);
const introMarkup = introStart !== -1 && introEnd !== -1
  ? html.slice(introStart, introEnd + '</section>'.length)
  : '';

check(heroPositions.every(({ start }) => start !== -1), 'Homepage contains all five Bad Days hero sections');
check(
  heroImages.every(({ repoPath }) => fs.existsSync(repoPath)),
  'All Bad Days hero images exist in the repository'
);
check(
  heroPositions.every(({ publicPath }) => html.includes(publicPath)),
  'Homepage uses all five approved full-width Bad Days hero images'
);
check(
  heroPositions.every((hero, index) => index === 0 || hero.start > heroPositions[index - 1].start),
  'Bad Days hero images remain ordered V1 through V5'
);
check(
  !html.includes('/img/homepage/BUILD%20A%20CRYPTO%20MOONBOY%20HERO%20PIC.jpg'),
  'Removed Build a Crypto Moonboy hero image is absent from the homepage'
);
check(
  !html.includes('CRYPTO%20MOONBOYS%20AND%20SWARMSY%20SIDE%20TWO.jpg') &&
    !html.includes('CRYPTO%20MOONBOYS%20AND%20SWARMSY%20SIDE%20one.jpg'),
  'Old stitched homepage hero images are absent'
);
check(
  lastHeroEnd !== -1 && builderStart > lastHeroEnd && introStart > builderStart,
  'Avatar builder sits after the Bad Days hero run and before the mission section'
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
  console.error(`\nHomepage hero audit failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('\nHomepage hero audit passed.');
