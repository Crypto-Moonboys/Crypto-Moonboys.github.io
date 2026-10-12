import assert from 'node:assert/strict';
import fs from 'node:fs';

const client = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
const profileSource = client.slice(client.indexOf('  function renderProfile()'), client.indexOf('  var screens ='));
const notificationControlsSource = client.split('// TEST-EXPORT: notificationControls:start')[1]?.split('// TEST-EXPORT: notificationControls:end')[0];
assert.ok(notificationControlsSource, 'Profile uses the real server-backed alert control renderer');
const retiredFeatures = ['breeding', 'traits', 'sanctuary', 'lineage', 'fusion', 'prestige'];
const panels = new Map();
const renderProfile = new Function('state', 'panel', `
  var MOONPET_IDENTITY_REVEAL_STAGE = 3;
  function activePetSummary() { return ''; }
  function renderSeasonSlots() { return ''; }
  function renderPetHouse() { return ''; }
  function renderFurnitureShop() { return ''; }
  function button(label) { return label; }
  function routeButton(label) { return label; }
  function number(value) { return Number(value || 0); }
  function words(value) { return String(value || '').replaceAll('_', ' '); }
  function escapeHtml(value) { return String(value || ''); }
  function valueText() { return ''; }
  function resolveMoonpetDisplayName() { return 'BOTTY'; }
  function moonpetStageLabel() { return 'Stage 3'; }
  ${notificationControlsSource}
  ${profileSource}
  return renderProfile();
`);
const state = {
  pet: { callsign: 'Saved callsign', evolution_stage: 3 },
  lifecycle: { evolution_stage: 3 },
  guidance: {
    features: [
      ...retiredFeatures.map(key => ({ key, title: 'Retired ' + key, available: false })),
      { key: 'pet_arena', title: 'Pet Arena', available: false, detail: 'Requires Level 10.' },
      { key: 'daily_missions', title: 'Daily Missions', available: true },
    ],
  },
};
renderProfile(state, (title, body, key) => { panels.set(key || title, { title, body }); return body; });
for (const key of ['prestige', 'sanctuary', 'future-systems']) assert.equal(panels.has(key), false);
for (const key of ['evolution', 'season', 'tracks', 'callsign', 'alerts', 'leaderboard']) assert.ok(panels.has(key), key + ' remains playable');
assert.match(panels.get('callsign').body, /Saved callsign|SAVE CALLSIGN/, 'Profile keeps callsign editing');
assert.match(panels.get('features').body, /\[LOCKED\] Pet Arena[\s\S]*Requires Level 10/, 'playable level gates remain visible');
assert.match(panels.get('features').body, /\[ONLINE\] Daily Missions/);
assert.doesNotMatch(panels.get('features').body, /Retired /, 'no unwired entries survive the feature directory');
assert.match(client, /Personality develops through play/);

const stylesSource = client.match(/  function drawEquippedStyles\([^\n]+\) \{[\s\S]*?\n  \}/)?.[0];
assert.ok(stylesSource);
const draws = [];
const ctx = { save() {}, restore() {}, fillRect(...args) { draws.push(['fill', ...args]); }, strokeRect(...args) { draws.push(['stroke', ...args]); } };
const drawStyles = new Function('state', 'ctx', 'activeScreen', 'reducedMotion', 'drawPixelRect', stylesSource + '; return drawEquippedStyles;');
const drawPixelRect = (...args) => draws.push(['pixel', ...args]);
const renderStyle = (key, time, foreground, motion = true, screen = 'home') => {
  draws.length = 0;
  drawStyles({ style_loadout: { equipped: [key] } }, ctx, screen, motion, drawPixelRect)(time, foreground);
  return draws.slice();
};
renderStyle('rename_badge', 0, true);
assert.deepEqual(draws, [], 'a previously saved Rename Badge no longer draws a nameplate');
draws.length = 0;
drawStyles({ style_loadout: { equipped: ['rename_badge', 'profile_frame'] } }, ctx, 'home', true, drawPixelRect)(0, true);
assert.equal(draws.filter(draw => draw[0] === 'stroke').length, 2, 'the working Profile Frame remains visible');
draws.length = 0;
drawStyles({ style_loadout: { equipped: ['run_trail'] } }, ctx, 'explore', true, drawPixelRect)(0, false);
assert.equal(draws.filter(draw => draw[0] === 'fill').length, 8, 'the working Run Trail remains visible');
assert.equal(renderStyle('neon_aura', 0, false).filter(draw => draw[0] === 'pixel').length, 4, 'Neon Aura draws its framing glow');
assert.equal(renderStyle('street_sparks', 0, true).filter(draw => draw[0] === 'pixel').length, 12, 'Street Sparks draws its canvas accents');
assert.equal(renderStyle('gold_frame', 0, true).filter(draw => draw[0] === 'stroke').length, 2, 'Gold Frame draws both borders');
assert.equal(renderStyle('cyber_scanlines', 0, false).filter(draw => draw[0] === 'pixel').length, 19, 'Cyber Scanlines draws the overlay');
assert.deepEqual(renderStyle('run_trail', 0, false, true, 'explore'), renderStyle('run_trail', 900, false, true, 'explore'),
  'reduced motion keeps the Run Trail stationary');
assert.deepEqual(renderStyle('street_sparks', 0, true), renderStyle('street_sparks', 900, true),
  'reduced motion keeps Street Sparks stationary');

console.log('moonpet-roadmap-regression.test.mjs passed: playable Profile and canvas cleanup');
