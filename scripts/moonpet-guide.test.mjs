import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { __petMediaTestHooks as worker } from '../workers/moonboys-api/worker.js';
import { PET_ENTRY_ARCADE_XP } from '../workers/moonboys-api/pets/entry-requirement.js';
import { PET_WEEKLY_JOURNEY_OBJECTIVES } from '../workers/moonboys-api/pets/weekly-journey.js';
import { PET_DAILY_CHALLENGES } from '../workers/moonboys-api/pets/daily-moon-run.js';
import { PET_ARENA_MIN_LEVEL, PET_WEEKLY_BOSS_MIN_LEVEL } from '../workers/moonboys-api/pets/combat-eligibility.js';
import { PET_JOB_COOLDOWN_SECONDS, PET_ADVENTURE_COOLDOWN_SECONDS } from '../workers/moonboys-api/pets/roguelite-foundation.js';
import { readDailyCompletion } from '../workers/moonboys-api/pets/completion-features.js';

const guide = createRequire(import.meta.url)('../js/moonpet-guide.js');
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const section = id => guide.sections.find(s => s.id === id).body;
const plain = value => value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const source = read('workers/moonboys-api/worker.js');
const lifecycle = read('workers/moonboys-api/pets/species-lifecycle.js');
const constant = (text, key) => Number(text.match(new RegExp('const ' + key + ' = (\\d+);'))?.[1]);

test('website guide and About blocks are exactly the shared in-game copy', () => {
  const howTo = read('how-to-play-crypto-moonboy-pets.html');
  const wiki = read('wiki/crypto-moonboy-pets.html');
  assert.ok(howTo.includes(guide.website(guide.sections, 'section')));
  assert.ok(wiki.includes(guide.website(guide.about, 'wiki-section')));
  const unsharedWiki = wiki.replace(/<!-- MOONPET_(?:ABOUT|START):BEGIN -->[\s\S]*?<!-- MOONPET_(?:ABOUT|START):END -->/g, '');
  assert.doesNotMatch(unsharedWiki, /choose Delete|Deletion archives|Delete And Start A New Pet/i, 'deletion instructions must stay in the shared guide block');
  const client = read('js/moonpet-mini-app.js');
  const helper = client.split('// TEST-EXPORT: guideMarkup:start')[1].split('// TEST-EXPORT: guideMarkup:end')[0];
  const markup = new Function('window', helper + '; return guideMarkup();')({ MoonpetGuide: guide });
  assert.ok(markup.startsWith(guide.game(guide.sections)));
  const html = read('moonpet-game.html');
  assert.ok(html.indexOf('/js/moonpet-guide.js?v=20261007-guidance-v1') < html.indexOf('/js/moonpet-mini-app.js?v=20261007-guidance-v1'));
  assert.match(source, /MOONPET_MINI_APP_URL = `\$\{SITE_URL\}\/moonpet-game\.html\?v=20261007-guidance-v1`/);
  assert.match(read('games/telegram/index.html'), /moonpet-game\.html\?v=20261007-guidance-v1/);
  const leaderboard = read('crypto-moonboy-pets-leaderboard.html');
  assert.match(leaderboard, /for the earning competition quarter, including awards earned by retained pets/);
  assert.doesNotMatch(leaderboard, /original earning pet season|Beta history/);
  assert.match(client, /kind === 'about'[\s\S]*MoonpetGuide\.game\(window\.MoonpetGuide\.about\)/);
  assert.match(client, /\['guide', 'about'\]\.includes\(utility.dataset.utility\)/);
  assert.equal((markup.match(/<details class="guide-step"/g) || []).length, guide.sections.length);
  assert.equal((markup.match(/<details class="guide-step" open/g) || []).length, 2);
});

test('entry, owned space and incubation numbers match authoritative code', () => {
  assert.equal(PET_ENTRY_ARCADE_XP, 1000);
  assert.match(plain(section('start')), /1,000 lifetime Arcade XP.*first pet is free/);
  assert.deepEqual(worker.PET_SEASON_EXTRA_SLOT_COSTS, { 2: 500, 3: 1000 });
  assert.equal(constant(source, 'PET_SEASON_MAX_SLOTS'), 3);
  assert.match(plain(section('pets')), /three owned pet spaces.*500 spendable Arcade XP.*1,000 spendable Arcade XP/);
  assert.deepEqual(['HATCH_PROGRESS', 'DAILY_INCUBATION_CAP', 'EARLIEST_HATCH_DAYS', 'GUARANTEED_HATCH_DAYS'].map(k => constant(lifecycle, k)), [12, 8, 7, 14]);
  assert.equal((lifecycle.match(/progress: 2, affinity:/g) || []).length, 4);
  assert.match(plain(section('incubation')), /7 full days.*12 signal and three care types.*14 full days/);
  assert.match(plain(section('incubation')), /at most 8 incubation actions count per pet per UTC day/);
});

test('every published stage gate and consumed material matches evolution content', () => {
  const definitions = Object.values(worker.MOONPET_EVOLUTIONS).filter(e => e.stage > 0);
  assert.equal(definitions.length, guide.stages.length);
  for (const row of guide.stages) {
    const live = definitions.find(e => e.stage === row.stage);
    assert.equal(live.name, row.name);
    assert.deepEqual(live.requirements, {
      pet_level: row.level, min_age_days: row.days, growth_marks: row.marks, weekly_crests: row.crests,
      boss_victories: row.bosses ? { alley_king: row.bosses } : {}, relics_owned: row.relics,
      inventory: { material: { scrap_metal: row.scrap, ...(row.fragments ? { evolution_fragment: row.fragments } : {}) } }
    });
  }
  assert.match(plain(section('incubation')), /UNKNOWN through Stages 0, 1 and 2.*Stage 3/);
  assert.match(lifecycle, /MOONPET_IDENTITY_REVEAL_STAGE = 3/);
});

test('care effects, rewards and account cooldowns match the Worker', () => {
  for (const { key, name, ...stats } of guide.care) assert.deepEqual(stats, worker.PET_ACTIONS[key], name);
  assert.equal(constant(source, 'PETS_ACTION_COOLDOWN_SECONDS'), 45);
  assert.match(plain(section('care')), /45-second account cooldown for that action/);
  assert.deepEqual(worker.PET_SPECIAL_ACTION_POLICIES, {
    energy_drink: { cooldown_seconds: 600, daily_limit: 3 },
    dance: { cooldown_seconds: 300, daily_limit: 5 }, cuddles: { cooldown_seconds: 300, daily_limit: 5 }
  });
  assert.deepEqual(['energy_drink', 'dance', 'cuddles'].map(k => [worker.PET_ACTIONS[k].energy, worker.PET_ACTIONS[k].happiness]), [[28, 0], [0, 18], [0, 8]]);
  for (const k of ['energy_drink', 'dance', 'cuddles']) for (const field of ['pet_xp', 'community_xp', 'gold', 'crystals', 'style_tokens']) assert.equal(worker.PET_ACTIONS[k][field], 0);
  assert.match(plain(section('audio')), /Inspire Bot is the silent incubation option.*adds 2 inspiration signal and rhythm affinity/);
  assert.match(lifecycle, /temperament: TEMPERAMENTS\[bytes\[11\] % TEMPERAMENTS\.length\]/);
  assert.match(plain(section('audio')), /Temperament is assigned separately and does not change with these choices/);
  assert.doesNotMatch(plain(section('audio')), /choices influence.*identity and temperament/);
});

test('mission advice matches accepted-action goals and the retained 50-Gold balance target', async () => {
  const day = '2026-10-07';
  async function completion(counts, gold) {
    let bits = 0;
    const db = { prepare(sql) { return {
      bind(...args) { this.args = args; return this; },
      async run() {
        assert.match(sql, /INSERT INTO telegram_pet_daily_completion/);
        bits |= this.args[2];
        return { success: true, meta: { changes: 1 } };
      },
      async all() { return { success: true, results: [{ utc_day: day, progress_bits: bits }] }; }
    }; } };
    return readDailyCompletion(db, 'guide-player', day, counts, 0, gold);
  }
  const base = { feed: 1, play: 1, clean: 1, train: 1, trade: 1, buy: 1 };
  for (const route of ['adventure', 'run_extract', 'run_complete', 'daily_moon_run', 'district_mission', 'event_chain', 'seasonal_boss']) {
    assert.equal((await completion({ ...base, [route]: 1 }, 50)).ready, true, route);
  }
  assert.equal((await completion({ ...base, adventure: 1 }, 49)).ready, false);
  const { train, ...withoutInstantTrain } = base;
  assert.equal((await completion({ ...withoutInstantTrain, activity_claim: 1, adventure: 1 }, 50)).ready, false, 'timed activity does not tick instant Train');
  assert.equal((await completion({ ...base, contract_complete: 1 }, 50)).ready, false, 'Contracts do not tick adventure');
  assert.match(plain(section('missions')), /One Feed also counts toward the Feed \+ Play \+ Clean goal/);
  assert.match(plain(section('missions')), /Timed Train does not complete the instant Train mission/);
  assert.match(plain(section('missions')), /Gold carried over from an earlier day counts.*do not need to earn 50 new Gold/);
});

test('Journey thresholds, objectives, XP caps and tier rewards match code', () => {
  assert.equal(worker.DAILY_JOURNEY_REQUIRED_OBJECTIVES, 3);
  assert.match(plain(section('daily')), /any 3 of these 5/);
  assert.deepEqual(Object.fromEntries(Object.entries(PET_DAILY_CHALLENGES).map(([id, c]) => [id, c.target])), { daily_combat: 3, daily_explorer: 7, daily_extraction: 1, daily_boss: 1, daily_care: 3 });
  assert.equal(worker.WEEKLY_JOURNEY_REQUIRED_OBJECTIVES, 5);
  assert.deepEqual(Object.fromEntries(Object.entries(PET_WEEKLY_JOURNEY_OBJECTIVES).map(([id, c]) => [id, c.target])), { weekly_care: 5, weekly_training: 3, weekly_run: 3, weekly_boss_attempt: 1, weekly_check_in: 2 });
  assert.match(plain(section('weekly')), /5 accepted Feed\/Play\/Clean\/Sleep actions, 3 Train actions, 3 completed or extracted qualifying runs, 1 Weekly Boss attempt and 2 Daily Cache check-ins/);
  assert.equal(constant(source, 'PETS_DAILY_PET_XP_CAP'), 1200);
  assert.equal(constant(source, 'PETS_DAILY_COMMUNITY_XP_CAP'), 250);
  assert.match(plain(section('progression')), /1,200 Pet XP and 250 Community XP per UTC day/);
  assert.deepEqual(worker.PET_SEASON_REWARD_TIERS.map(t => [t.required_xp, t.reward]), [
    [250, { moon_gold: 80, style_tokens: 1 }], [1000, { moon_gold: 160, moon_crystals: 3, style_tokens: 2 }],
    [3000, { moon_gold: 260, moon_crystals: 6, style_tokens: 4 }], [7500, { moon_gold: 420, moon_crystals: 10, style_tokens: 8 }]
  ]);
});

test('published activity timings and combat costs are supported by current code', () => {
  assert.equal(PET_JOB_COOLDOWN_SECONDS, 45);
  assert.equal(PET_ADVENTURE_COOLDOWN_SECONDS, 1800);
  assert.equal(PET_ARENA_MIN_LEVEL, 10);
  assert.equal(PET_WEEKLY_BOSS_MIN_LEVEL, 5);
  assert.match(source, /PET_ACTIVITY_MIN_SECONDS = 5 \* 60/);
  assert.match(source, /PET_ACTIVITY_GRACE_SECONDS = 24 \* 60 \* 60/);
  assert.match(source, /PET_ACTIVITY_CAP_SECONDS = Object.freeze\(\{ sleep: 8 \* 3600, train: 2 \* 3600, work: 8 \* 3600, explore: 8 \* 3600 \}\)/);
  for (const [result, cost] of [['win', 6], ['draw', 5], ['loss', 4]]) assert.match(source, new RegExp('kaiju_' + result + ': Object.freeze\\([^\\n]+energy_cost: ' + cost));
  assert.match(plain(section('combat')), /6 energy for a win, 5 for a draw or 4 for a loss/);
  assert.match(plain(section('work')), /5 minutes.*2 hours.*8 hours/);
  assert.match(plain(section('work')), /24 hours after its cap/);
});

test('all player help excludes obsolete or unimplemented promises', () => {
  const copy = guide.sections.concat(guide.about).map(s => s.title + s.body).join('');
  assert.doesNotMatch(copy, /\b(?:beta|Breeding|Lineage|Fusion|Sanctuary|Prestige)\b|premium routes|IN DEVELOPMENT/i);
  for (const content of [copy, read('how-to-play-crypto-moonboy-pets.html'), read('wiki/crypto-moonboy-pets.html')]) assert.match(content, /Pets persist: no automatic seasonal reset, replacement or retirement/);
});
