#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const homepagePath = path.join(ROOT, 'index.html');
const homeWidgetsPath = path.join(ROOT, 'js', 'home-widgets.js');
const splashPath = path.join(ROOT, 'enter.html');
const introScriptPath = path.join(ROOT, 'js', 'first-visit-intro.js');
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

const forbiddenBuilderCopy = [
  'Build a Crypto Moonboy',
  'Build a Moonboy or Girl',
  'Create a new Crypto Moonboy identity',
  'Create a Crypto Moonboy',
  'Create a Moonboy',
  'Create a Crypyo Moonboy',
  'Create a Crypyo Moonboy identity',
  'Build an original Crypto Moonboy GK character',
  'memorable Moonboy identity',
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
const homeWidgets = fs.readFileSync(homeWidgetsPath, 'utf8');
const splash = fs.readFileSync(splashPath, 'utf8');
const introScript = fs.readFileSync(introScriptPath, 'utf8');

const heroPositions = heroImages.map(({ sectionLabel, publicPath }) => ({
  sectionLabel,
  publicPath,
  start: splash.indexOf(`<section class="build-moonboy-hero" aria-label="${sectionLabel}"`),
}));
const lastHeroEnd = heroPositions.length
  ? splash.indexOf('</section>', heroPositions[heroPositions.length - 1].start)
  : -1;
const builderStart = html.search(/<section\b(?=[^>]*\bclass="[^"]*\bhomepage-avatar-builder\b)[^>]*>/);
const introStart = html.search(/<section\b(?=[^>]*\bid="how-it-works")[^>]*>/);
const introEnd = html.indexOf('</section>', introStart);
const introMarkup = introStart !== -1 && introEnd !== -1
  ? html.slice(introStart, introEnd + '</section>'.length)
  : '';

check(
  html.includes('<h1>🛑 STOP SWIPING N LIKING 👍 LET US HELP YOU BUILD SOMETHING PEOPLE REMEMBER.</h1>\n      <p class="hero-pulse-line">Some of us live for the future 💥💥💥🚀 and some of us wonder 🦄</p>\n      <h1 class="hero-secondary-heading">🤘 JOIN US ON THE WAX BLOCKCHAIN & HELP DESTROY THE MEME$ 🐸 TAKING OVER OUR WORLD.</h1>'),
  'Homepage opening copy preserves the approved headline, pulse, headline order'
);
check(heroPositions.every(({ start }) => start !== -1), 'Splash page contains all five Bad Days artwork sections');
check(
  heroImages.every(({ repoPath }) => fs.existsSync(repoPath)),
  'All Bad Days hero images exist in the repository'
);
check(
  heroPositions.every(({ publicPath }) => splash.includes(publicPath) && !html.includes(publicPath)),
  'All five approved full-width images appear only on the splash page'
);
check(
  heroPositions.every((hero, index) => index === 0 || hero.start > heroPositions[index - 1].start),
  'Splash art remains in order V1 through V5'
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
  lastHeroEnd !== -1 && builderStart > html.indexOf('</section>', html.indexOf('id="home-top-message"')) &&
    builderStart < introStart && heroPositions.every(({ start }) => start >= 0),
  'Builder remains under the mission text; Bad Days artwork is now on splash page'
);
check(
  introMarkup.includes('id="open-creative-academy"') &&
    !introMarkup.includes('GET READY #PLAYERONE') &&
    !introMarkup.includes('We Collaborate We Create We Inspire'),
  'Academy content remains without the removed promotional copy'
);
check(
  !html.includes('GET READY #PLAYERONE') &&
    !html.includes('JOIN US AND DISRUPT THE WORLD') &&
    !html.includes('We Collaborate We Create We Inspire') &&
    !html.includes('WE EMPOWER ⚡️⚡️⚡️'),
  'Removed promotional text is absent from the homepage'
);
check(
  !homeWidgets.includes('moveBuildCtaAboveBuilder') &&
    !homeWidgets.includes('homepage-build-cta'),
  'No runtime code recreates the removed promotional text'
);
check(
  html.includes('href="/my-moonboy.html">BUILD A MOONBOY IDENTITY</a>') &&
    html.includes('href="/gpt-users.html">BRING YOUR OWN IP</a>') &&
    html.includes('Start with the public ChatGPT Creator Studio'),
  'Homepage supports both approved identity and existing-IP creator routes'
);
check(
  html.includes('aria-label="Build a HODL Warrior"'),
  'Homepage avatar builder uses the approved HODL Warrior aria label'
);
// Artwork alt text describes the approved image; it is not a creator CTA.
const visibleCopy = html.replace(/<[^>]*>/g, ' ');
const forbiddenInHtml = forbiddenBuilderCopy.filter((phrase) => visibleCopy.includes(phrase));
check(
  forbiddenInHtml.length === 0,
  `Homepage source has no forbidden Moonboy/Crypto Moonboy builder CTA wording${forbiddenInHtml.length ? ` — found: ${forbiddenInHtml.map((p) => JSON.stringify(p)).join(', ')}` : ''}`
);
const forbiddenInWidgets = forbiddenBuilderCopy.filter((phrase) => homeWidgets.includes(phrase));
check(
  forbiddenInWidgets.length === 0,
  `Runtime home-widgets.js has no forbidden Moonboy/Crypto Moonboy builder CTA wording${forbiddenInWidgets.length ? ` — found: ${forbiddenInWidgets.map((p) => JSON.stringify(p)).join(', ')}` : ''}`
);
check(
  /\.build-moonboy-hero\s*\{[^}]*width\s*:\s*100%/is.test(splash),
  'Splash art section is full width'
);
check(
  /\.build-moonboy-hero img\s*\{[^}]*display\s*:\s*block[^}]*width\s*:\s*100%[^}]*height\s*:\s*auto/is.test(splash),
  'Splash art preserves natural aspect ratio'
);
check(
  !/class=["'][^"']*home-hero-left/.test(html) &&
    !/class=["'][^"']*home-hero-right/.test(html),
  'Homepage no longer uses the old split hero structure'
);


check(
  html.includes('/js/first-visit-intro.js') &&
    html.includes('dialog#cm-bad-days-intro') &&
    introScript.includes('dialog.showModal()') &&
    !introScript.includes('window.location.replace('),
  'First visit opens a modal and does not redirect the homepage'
);
check(
  introScript.includes("window.location.pathname !== '/'") &&
    introScript.includes("window.localStorage.getItem(KEY) === '1'") &&
    introScript.includes("window.localStorage.setItem(KEY, '1')") &&
    introScript.includes('event.origin !== window.location.origin') &&
    introScript.includes('event.source !== frame.contentWindow'),
  'First-visit state and same-origin frame messages are guarded'
);
check(
  splash.includes('content="noindex, follow"') &&
    html.includes('rel="canonical" href="https://cryptomoonboys.com/"'),
  'Splash is noindex; homepage canonical remains unchanged'
);
check(
  (splash.match(/data-enter-site/g) || []).length >= 3 &&
    splash.includes('PRESS START — ENTER THE WORLD') &&
    splash.includes('SKIP INTRO') &&
    splash.includes("window.parent.postMessage('cm:bad-days-intro:enter', window.location.origin)") &&
    html.includes('href="/enter.html">REPLAY THE BAD DAYS INTRO</a>'),
  'Enter, skip, embedded dismissal and replay are all available'
);
check(
  !html.includes('class="build-moonboy-hero"') &&
    !/object-fit:\s*cover/.test(splash) &&
    splash.indexOf('Bad Days 1') < splash.indexOf('Bad Days 5'),
  'Seamless Bad Days art is off homepage and never cropped'
);


// Keep homepage typography on its shared responsive hierarchy.
const homeTypeTokens = [
  '--home-type-hero', '--home-type-secondary', '--home-type-section',
  '--home-type-subsection', '--home-type-pulse', '--home-type-lead', '--home-type-body',
];
check(
  homeTypeTokens.every(token => html.includes(token + ':clamp(')) &&
  /\.hero-intro \.hero-pulse-line\s*\{[^}]*font-size:var\(--home-type-pulse\)/s.test(html) &&
  /\.home-core-mission h2\s*\{[^}]*font-size:var\(--home-type-section\)/s.test(html) &&
  /\.simple-section h2\s*\{[^}]*font-size:var\(--home-type-section\)/s.test(html) &&
  /\.simple-section p\s*\{[^}]*font-size:var\(--home-type-body\)/s.test(html) &&
  /\.history-blurb p\s*\{[^}]*font-size:var\(--home-type-body\)/s.test(html),
  'Home uses a consistent responsive type hierarchy without competing small paragraph sizes'
);


// The visual gallery is decorative: every approved asset appears twice for a
// seamless marquee, with no clickable lightbox or links wrapping the images.
const galleryStart = html.indexOf('<section class="home-art-strip"');
const galleryEnd = html.indexOf('</section>', galleryStart);
const galleryHtml = galleryStart >= 0 && galleryEnd > galleryStart
  ? html.slice(galleryStart, galleryEnd + '</section>'.length) : '';
const galleryImagePaths = [
  "/img/homepage/Gritty%20New%20York%20Night%20Billboard%20Scene.jpg",
  "/img/homepage/Moonboys%20Neon%20Graffiti%20Still%20Life.jpg",
  "/img/homepage/Moonboys%20Sticker%20Pack%20in%20Neon%20Alley.jpg",
  "/img/homepage/Moonboys%20Sticker%20Studio%20Chaos.jpg",
  "/img/homepage/Moonboys%20Graffiti%20Tee%20Stack%20in%20Neon%20Studio.jpg",
  "/img/homepage/Neon%20Graffiti%20Streetwear2%20Portrait.jpg",
  "/img/homepage/Neon%20Noir%20EL%20MUERTE%20Graffiti%20Mural.jpg",
  "/img/homepage/Neon%20Stickered%20Streets%20of%20New%20York.jpg",
  "/img/homepage/Neon%20Street%20Art%20Character%20Poster.jpg"
];
check(
  galleryStart > html.indexOf('THE WORLD IS YOUR CANVAS') &&
  galleryEnd < builderStart &&
  galleryImagePaths.every(src => galleryHtml.split('src="' + src + '"').length === 3),
  'Nine gallery images appear twice, immediately above the Moonboy Builder'
);
check(
  (galleryHtml.match(/<img /g) || []).length === 18 &&
  !/<a\b|onclick=|lightbox|data-fancybox/i.test(galleryHtml) &&
  galleryHtml.includes('aria-hidden="true"') &&
  /\.home-art-strip img\s*\{[^}]*height:460px/.test(html) &&
  /@keyframes homeArtStripScroll/.test(html),
  'Gallery scrolls seamlessly at 460px, with no clickable image enlargement'
);

check(
  !/\.home-art-strip:hover\s+\.home-art-strip-track/.test(html) &&
  !/\.home-art-strip\s*\{[^}]*overflow-x:\s*auto/.test(html) &&
  !/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.home-art-strip/.test(html) &&
  /\.home-art-strip-track\s*\{[^}]*animation-play-state:running/.test(html) &&
  /animation:homeArtStripScroll 145s linear infinite/.test(html),
  'Gallery never pauses on hover or switches to manual scrolling in reduced-motion mode'
);

if (failures > 0) {
  console.error(`\nHomepage hero audit failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('\nHomepage hero audit passed.');
