import { spawnSync } from 'node:child_process';

const GROUPS = {
  wiki: [
    ['node', 'scripts/audit-related-wiki-paths.mjs'],
    ['node', 'scripts/wiki-navigation-backfill-rendering.test.mjs'],
    ['node', 'scripts/nft-related-section-dedupe.test.mjs'],
    ['node', 'scripts/audit-manual-content-preservation.mjs'],
    ['node', 'scripts/relationship-hints-related-wiki-paths.test.mjs'],
    ['node', 'scripts/e2e-website-payload-relationship-hints.test.mjs'],
    ['node', 'scripts/incubator-link-auth-cache.test.mjs'],
    ['node', 'scripts/wiki-aliases.test.mjs'],
    ['node', 'scripts/audit-and-purge-stale-sam-noise.test.mjs'],
    ['node', 'scripts/wiki-publish-gate.test.mjs'],
    ['node', 'scripts/validate-website-publish-payloads.test.mjs'],
    ['node', 'scripts/validate-website-publish-payloads.mjs'],
    ['node', 'scripts/search-page-card-rendering.test.mjs'],
    ['node', 'scripts/wiki-search.test.mjs'],
    ['node', 'scripts/wiki-engagement-layer.test.mjs'],
    ['node', 'scripts/wiki-engagement-api.test.mjs'],
    ['node', 'scripts/wiki-first-public-pages.test.mjs'],
    ['node', 'scripts/wiki-shell-guard.test.mjs'],
    ['npm', 'run', 'test:wiki-structure'],
    ['node', 'scripts/wiki-index-drift-regression.test.mjs'],
    ['node', 'scripts/audit-published-vs-index.js'],
  ],
  'worker-api': [
    ['node', 'scripts/telegram-link-token-security.test.mjs'],
    ['node', 'scripts/admin-grant-telegram-auth-security.test.mjs'],
    ['node', 'scripts/telegram-daily-digest-and-missed-perks.test.mjs'],
    ['node', 'scripts/telegram-daily-loop-commands.test.mjs'],
    ['node', 'scripts/daily-loop-live-smoke.test.mjs'],
    ['node', 'scripts/telegram-group-event-announcements.test.mjs'],
    ['node', 'scripts/daily-wtf-timed-events.test.mjs'],
    ['node', 'scripts/daily-loop-state-contract.test.mjs'],
    ['node', 'scripts/daily-loop-frontend-state.test.mjs'],
    ['node', 'scripts/scheduled-task-isolation.test.mjs'],
    ['node', 'scripts/cors-origins.test.mjs'],
    ['node', 'scripts/worker-rate-limit.test.mjs'],
    ['node', 'scripts/npc-chat-bridge.test.mjs'],
    ['node', 'scripts/sparky-telegram-gate.test.mjs'],
    ['node', 'scripts/worker-deploy-readiness-audit.test.mjs'],
    ['node', 'scripts/worker-deploy-readiness-audit.mjs'],
  ],
  arcade: [
    ['npm', 'run', 'test:btqm-runtime-assets'],
    ['node', 'scripts/btqm-bonus-battle-mode.test.mjs'],
    ['node', 'scripts/arcade-roguelite-protection.test.mjs'],
    ['npm', 'run', 'test:crystal-quest'],
    ['node', 'scripts/arcade-leaderboard-layout.test.mjs'],
    ['node', 'scripts/blocktopia-entry-auth.test.mjs'],
    ['node', 'scripts/blocktopia-reconnect-protection.test.mjs'],
    ['node', 'scripts/blocktopia-movement-hardening.test.mjs'],
    ['node', 'scripts/identity-gate-auth-guard.test.mjs'],
    ['node', 'scripts/leaderboard-client-regression.test.mjs'],
    ['node', 'scripts/how-to-play-xp-copy.test.mjs'],
    ['node', 'scripts/ui-timer-ownership.test.mjs'],
    ['node', 'scripts/faction-canon-protection.test.mjs'],
    ['node', 'scripts/battle-chamber-faction-page.test.mjs'],
    ['node', 'scripts/faction-chamber-pages.test.mjs'],
    ['node', 'scripts/faction-reward-system.test.mjs'],
    ['node', 'scripts/battle-chamber-server-authority.test.mjs'],
    ['node', 'scripts/faction-season-lock.test.mjs'],
  ],
  waxonedge: [
    ['node', 'scripts/audit-nft-pages-and-feed-sync.mjs'],
    ['node', 'scripts/audit-gkniftyheads-hub-links.mjs'],
    ['node', 'scripts/gkniftyheads-live-supply-scoring.test.mjs'],
    ['node', 'scripts/gkniftyheads-staged-rarity-pipeline.test.mjs'],
    ['node', 'scripts/nft-asset-version-ranking.test.mjs'],
    ['node', 'scripts/gkniftyheads-rarity-ranking.test.mjs'],
    ['node', 'scripts/gkniftyheads-collection-page-cleanup.test.mjs'],
    ['node', 'scripts/noballgamess-rarity-tracker.test.mjs'],
    ['node', 'scripts/noballgamess-asset-json-integrity.test.mjs'],
    ['node', 'scripts/nft-rarity-methodology-doc.test.mjs'],
    ['node', 'scripts/feed-updater-safety.test.mjs'],
    ['node', 'scripts/site-feed-registry.test.mjs'],
    ['node', 'scripts/wax-api-route-normalization.test.mjs'],
    ['node', 'scripts/wax-image-normalizer.test.mjs'],
    ['node', 'scripts/wax-collection-page-fallback.test.mjs'],
    ['node', 'scripts/waxonedge-api-routing.test.mjs'],
    ['node', 'scripts/waxonedge-smoke.test.mjs'],
    ['node', 'scripts/waxonedge-indexer-blueprint.test.mjs'],
    ['node', 'scripts/waxonedge-live-backend.test.mjs'],
    ['node', 'scripts/waxonedge-valuation-contract.test.mjs'],
    ['node', 'scripts/waxcash-standalone.test.mjs'],
  ],
  visual: [
    ['node', 'scripts/right-rail-live-panels.test.mjs'],
    ['node', 'scripts/favicon-consistency.test.mjs'],
    ['node', 'scripts/anti-drift-check.mjs'],
    ['node', 'scripts/public-copy-trust-guard.test.mjs'],
    ['node', 'scripts/ci-domain-groups.test.mjs'],
    ['node', 'scripts/live-site-verify-static.test.mjs'],
    ['node', 'scripts/site-shell-parity-audit.mjs'],
    ['node', 'scripts/visual-parity-swarmsy-audit.mjs'],
  ],
};

const group = process.argv[2];
if (!GROUPS[group]) {
  console.error(`Unknown CI domain "${group || ''}". Expected one of: ${Object.keys(GROUPS).join(', ')}`);
  process.exit(1);
}

for (const command of GROUPS[group]) {
  const [rawBin, ...args] = command;
  console.log(`\n[ci:${group}] ${[rawBin, ...args].join(' ')}`);
  const result = process.platform === 'win32' && rawBin === 'npm'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', [rawBin, ...args].join(' ')], { stdio: 'inherit' })
    : spawnSync(rawBin, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(`[ci:${group}] failed to start ${rawBin}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
