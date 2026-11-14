#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const homepagePath = path.join(ROOT, 'join-us-on-the-wax-blockchain.html');
const landingPath = path.join(ROOT, 'index.html');
const homeWidgetsPath = path.join(ROOT, 'js', 'home-widgets.js');
const legacyEntryPath = path.join(ROOT, 'enter.html');
const myMoonboyPath = path.join(ROOT, 'my-moonboy.html');
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
const landing = fs.readFileSync(landingPath, 'utf8');
const homeWidgets = fs.readFileSync(homeWidgetsPath, 'utf8');
const legacyEntry = fs.readFileSync(legacyEntryPath, 'utf8');
const myMoonboy = fs.readFileSync(myMoonboyPath, 'utf8');

const badDaysGalleryStart = myMoonboy.indexOf('<section id="bad-days-artwork" class="mm-bad-days-gallery"');
const heroPositions = heroImages.map(({ publicPath }) => myMoonboy.indexOf('src="' + publicPath + '"'));
const builderStart = html.search(/<section\b(?=[^>]*\bclass="[^"]*\bhomepage-avatar-builder\b)[^>]*>/);
const introStart = html.search(/<section\b(?=[^>]*\bid="how-it-works")[^>]*>/);
const introEnd = html.indexOf('</section>', introStart);
const introMarkup = introStart !== -1 && introEnd !== -1
  ? html.slice(introStart, introEnd + '</section>'.length)
  : '';

// Check the exact approved copy, element types, classes and order without
// depending on Git's LF/CRLF checkout policy on Windows.
const openingMarkup = html.match(/<section\b[^>]*\bid="home-top-message"[^>]*>\s*<div class="simple-wrap">([\s\S]*?)<\/div>/)?.[1] || '';
const openingElements = [...openingMarkup.matchAll(/<(h1|p|h2)(?:\s+class="([^"]+)")?>([^<]*)<\/\1>/g)]
  .map(([, tag, className, text]) => ({ tag, className: className || '', text }));
check(
  JSON.stringify(openingElements) === JSON.stringify([
    { tag: 'h1', className: '', text: '🛑 STOP SWIPING N LIKING 👍 LET US HELP YOU BUILD SOMETHING PEOPLE REMEMBER.' },
    { tag: 'p', className: 'hero-pulse-line', text: 'Some of us live for the future 💥💥💥🚀 and some of us wonder 🦄' },
    { tag: 'h2', className: 'hero-secondary-heading', text: '🤘 JOIN US ON THE WAX BLOCKCHAIN & HELP DESTROY THE MEME$ 🐸 TAKING OVER OUR WORLD.' },
  ]),
  'Homepage opening copy preserves the approved headline, pulse, headline order'
);
check(heroPositions.every(position => position > badDaysGalleryStart), 'Five Bad Days images are present at the bottom of My Moonboy');
check(heroImages.every(({ repoPath }) => fs.existsSync(repoPath)), 'All five Bad Days artwork files exist');
check(heroImages.every(({ publicPath }) => !html.includes(publicPath) && !legacyEntry.includes(publicPath)),
  'Bad Days images have been removed from the homepage and retired splash route');
check(heroPositions.every((position, i) => i === 0 || position > heroPositions[i - 1]),
  'Five panels remain in the approved V1 through V5 order');
check(badDaysGalleryStart > myMoonboy.indexOf('id="mm-economy"') && badDaysGalleryStart < myMoonboy.lastIndexOf('</main>'),
  'Full artwork follows My Moonboy mission and economy content');
check(/\.mm-bad-days-gallery img\s*\{[^}]*display:block;[^}]*width:100%;[^}]*height:auto/.test(myMoonboy) &&
  myMoonboy.includes('width:calc(100% + 2 * var(--shell-gutter))'),
  'Artwork uses full-width, uncropped and responsive images beyond shell gutters');
check(
  !html.includes('/img/homepage/BUILD%20A%20CRYPTO%20MOONBOY%20HERO%20PIC.jpg'),
  'Removed Build a Crypto Moonboy hero image is absent from the homepage'
);
check(
  !html.includes('CRYPTO%20MOONBOYS%20AND%20SWARMSY%20SIDE%20TWO.jpg') &&
    !html.includes('CRYPTO%20MOONBOYS%20AND%20SWARMSY%20SIDE%20one.jpg'),
  'Old stitched homepage hero images are absent'
);
check(builderStart > html.indexOf('</section>', html.indexOf('id="home-top-message"')) && builderStart < introStart,
  'Builder remains under the mission text; five Bad Days panels moved to My Moonboy');
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
  html.includes('href="/my-moonboy.html">check their verified missions on My Moonboy</a>') &&
    html.includes('href="/gpt-users.html">ChatGPT Creator Studio</a>') &&
    html.includes('Build a body of work and direct relationships with supporters, customers, collaborators'),
  'Homepage supports the current My Moonboy and ChatGPT Creator Studio routes'
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
check(!html.includes('/js/first-visit-intro.js') && !html.includes('cm-bad-days-intro') &&
  !html.includes('href="/enter.html"'), 'Homepage loads directly with no first-visit dialog or replay link');
check(legacyEntry.includes('http-equiv="refresh" content="0;url=/"') &&
  legacyEntry.includes('content="noindex, follow"') &&
  !legacyEntry.includes('build-moonboy-hero'), 'Legacy splash URL redirects to home and cannot compete in search');
check(html.includes('rel="canonical" href="https://cryptomoonboys.com/join-us-on-the-wax-blockchain.html"'),
  'Moved full experience publishes its own canonical URL');
check(landing.includes('rel="canonical" href="https://cryptomoonboys.com/"'),
  'Short homepage preserves the root canonical URL');
check(landing.includes('href="/join-us-on-the-wax-blockchain.html"') &&
  !landing.includes('id="build-moonboy"') && !landing.includes('<iframe') && !landing.includes('<video') &&
  !landing.includes('home-art-strip') && !landing.includes('src="/js/avatar-builder-test.js"'),
  'Short homepage links to the full experience without heavy builder, media or gallery');
check(!html.includes('class="build-moonboy-hero"'),
  'Bad Days art never returns to the homepage');

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
