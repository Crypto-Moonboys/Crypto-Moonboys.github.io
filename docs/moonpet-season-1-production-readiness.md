# Moonpet Season 1 Production Readiness

Focused deployment checklist for the Moonpet Mini App after the Season 1 player-experience and capability work in PR #1234.

## Pre-merge checks

Run from the repository root:

```bat
REM Run from repository root
node scripts/telegram-pets-season-1-production-readiness.test.mjs
node scripts/telegram-pets-mini-app.test.mjs
node scripts/telegram-pets-mini-app-parity.test.mjs
node scripts/telegram-pets-guided-progression.test.mjs
node scripts/telegram-pets-content-reconciliation.test.mjs
node scripts/telegram-pets-per-pet-state.test.mjs
node scripts/telegram-pets-daily-moon-run.test.mjs
node scripts/telegram-pets-weekly-journey.test.mjs
npm run ci:worker-api
npm run ci:visual
git diff --check
```

## Post-merge Worker deploy command

This readiness PR does not change runtime Worker code. The command below is the standard Season 1 production rollout command after merging runtime changes.

Do not deploy `moonboys-api` with direct `wrangler deploy`. Use the provenance wrapper so deployed Worker metadata includes the commit tag required by `/deployment-info`.

```bat
REM Run from repository root after pulling latest main
git checkout main
git pull origin main
node scripts/deploy-worker-with-provenance.mjs moonboys-api
```

## Health check command

```bat
curl --ssl-no-revoke https://moonboys-api.sercullen.workers.dev/health
```

Expected response:

```json
{"ok":true}
```

## Provenance check command

```bat
curl --ssl-no-revoke https://moonboys-api.sercullen.workers.dev/deployment-info
```

## D1 migration status

No D1 migration is required for this readiness PR. Add one only if a future PR introduces a real schema blocker and explains it before implementation.

## Manual live verification steps

1. Open the Telegram Mini App as a new or unadopted player and confirm the state loads with Moon Egg onboarding.
2. Open as a player with an active egg and confirm Arena and Kaiju show locked panels, not playable combat.
3. Open as a player with a completed Season pet and an active egg and confirm combat remains locked with `moon_egg_must_hatch`.
4. Open as a player with a completed Season pet and a hatched active Moonpet and confirm Arena and Kaiju entry controls are available.
5. Trigger stale Arena queue, stale Kaiju queue, and owned solo Kaiju match cleanup from locked state and confirm only caller-owned stale rows are cleared.
6. Confirm Sanctuary, Prestige, Weekly Journey, Breeding, Fusion, Lineage, Traits, and future expansion panels return planned/unavailable copy without live rewards or completion data.

## Rollback notes

This PR is tests, CI wiring, and documentation only. If a post-merge issue appears, revert the PR and redeploy the Worker from the previous known-good `main` commit.

## Known locked systems

- Arena and Kaiju are locked unless the player has completed a Season pet and the active Moonpet is hatched.
- Sanctuary is unavailable in the Mini App route and returns `feature_not_available`.
- Prestige is unavailable and returns `feature_not_available`.

## Known planned systems

- Weekly Journey gameplay integration.
- Breeding gameplay.
- Genetics and traits expansion.
- Sanctuary gameplay.
- Fusion.
- Arena expansion.
- Kaiju expansion.
- Prestige gameplay.
- Token/NFT mechanics.
