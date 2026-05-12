# Repo Branch Audit (`codex/*`)
This report inventories remote `codex/*` branches, flags likely stale branches, and highlights likely overlap with high-risk runtime areas.

## Merge safety recommendation
- **Do not merge `codex/*` branches directly.**
- If any branch work is still needed, **recreate from latest `main` and re-implement intentionally**.

## Risk key
- **Likely stale:** ⚠️ Yes (branch appears to be legacy/one-off codex automation work)
- **High-risk overlap:** paths likely touched in one or more of: `games/block-topia/`, `server/block-topia/`, `workers/moonboys-api/`, `js/components/`, `js/site-shell.js`

## Block Topia
High-risk overlap (category-level): **games/block-topia/, server/block-topia/, workers/moonboys-api/**

| Branch | Likely stale | High-risk overlap |
|---|---|---|
| `codex/add-hidden-admin-panel-for-block-topia-grants` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/add-secure-block-topia-grant-action` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/add-secure-block-topia-xp-grant-for-admins` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/block-topia-2p-base-reset` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/block-topia-and-arcade-integration-qa-pass` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/block-topia-covert-phase-1` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/block-topia-covert-world-ui` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/block-topia-passive-map-restore` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/block-topia-quest-maze-roguelite` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/block-topia-remove-old-feed-ui` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/block-topia-server-world-integration-pass` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/block-topia-session-tension-tuning` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/block-topia-strip-map-world-labels` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/block-topia-system-sanity-audit-stabilization` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/block-topia-ui-clarity-clean` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/block-topia-ui-clarity-followup-2` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/block-topia-ui-clarity-pass` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-2p-50xp-gate` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-city-phase-foundation` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-combat-pacing-feed-spam` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-drawhud-survivetotalsec-hotfix` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-gameplay-loop-ux` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-level-progression-post-mission-nav` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-mission-complete-feed-lockout` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-mission-complete-lockout-hotfix` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-npc-core-sync` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-onboarding-clarity` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-overlay-gating-hotfix` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-prestart-ready-gate` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-roguelite-clean-rebuild` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-roguelite-level-system` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-upgrade-visibility-hotfix` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-upgrade-visibility-post490` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/blocktopia-ws-close-code-hotfix` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/btqm-maze-fixes` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/create-final-correction-pr-for-block-topia` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/finalize-visual-enhancements-for-block-topia-shell` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/finish-block-topia-pass-3-improvements` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/finish-map-visual-overhaul-for-block-topia` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/fix-block-topia-integration-issues` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/implement-rpg-reward-system-in-block-topia` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/polish-block-topia-interaction-and-stability` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |
| `codex/refactor-block-topia-progression-logic` | ⚠️ Yes | ⚠️ games/block-topia/, server/block-topia/, workers/moonboys-api/ |

## Arcade games
High-risk overlap (category-level): **None identified**

| Branch | Likely stale | High-risk overlap |
|---|---|---|
| `codex/add-firewall-defense-node-mini-game` | ⚠️ Yes | No |
| `codex/arcade-plugin-systems` | ⚠️ Yes | No |
| `codex/asteroid-fork-fixes` | ⚠️ Yes | No |
| `codex/asteroid-fork-roguelite-adapter` | ⚠️ Yes | No |
| `codex/enhance-roguelite-infinite-loop-with-protections` | ⚠️ Yes | No |
| `codex/fix-arcade-api-base-sync` | ⚠️ Yes | No |
| `codex/fix-arcade-presentation-4games` | ⚠️ Yes | No |
| `codex/fix-arcade-presentation-pr-review-issues` | ⚠️ Yes | No |
| `codex/fix-arcade-xp-sync-telegram` | ⚠️ Yes | No |
| `codex/implement-roguelite-engagement-system` | ⚠️ Yes | No |
| `codex/implement-shared-mini-game-tier-scaling-system` | ⚠️ Yes | No |
| `codex/invaders-sync-debug-chain` | ⚠️ Yes | No |
| `codex/pac-chain-roguelite-parity` | ⚠️ Yes | No |
| `codex/snake-run-fixes` | ⚠️ Yes | No |
| `codex/snake-run-roguelite` | ⚠️ Yes | No |
| `codex/update-arcade-leaderboard-and-messaging` | ⚠️ Yes | No |

## Faction systems
High-risk overlap (category-level): **workers/moonboys-api/, js/components/**

| Branch | Likely stale | High-risk overlap |
|---|---|---|
| `codex/add-player-faction-alignment-system` | ⚠️ Yes | ⚠️ workers/moonboys-api/, js/components/ |
| `codex/centralize-faction-canon` | ⚠️ Yes | ⚠️ workers/moonboys-api/, js/components/ |
| `codex/fix-faction-earn-503-fallback` | ⚠️ Yes | ⚠️ workers/moonboys-api/, js/components/ |
| `codex/fix-preload-warning-on-faction-chamber-pages` | ⚠️ Yes | ⚠️ workers/moonboys-api/, js/components/ |

## Admin/grants
High-risk overlap (category-level): **workers/moonboys-api/**

| Branch | Likely stale | High-risk overlap |
|---|---|---|
| `codex/create-pr-for-d1-schema-fix` | ⚠️ Yes | ⚠️ workers/moonboys-api/ |
| `codex/create-pr-for-d1-schema-fix-g0sk9r` | ⚠️ Yes | ⚠️ workers/moonboys-api/ |
| `codex/fix-admin-page-telegram-auth-handoff` | ⚠️ Yes | ⚠️ workers/moonboys-api/ |
| `codex/fix-unauthenticated-state-on-admin-tools-page` | ⚠️ Yes | ⚠️ workers/moonboys-api/ |

## Hermes/removed agent work
High-risk overlap (category-level): **None identified**

| Branch | Likely stale | High-risk overlap |
|---|---|---|
| `codex/add-hermes-og-swarm-manager-functionality` | ⚠️ Yes | No |
| `codex/create-new-pr-for-hermes-og-fullscreen` | ⚠️ Yes | No |
| `codex/fix-hermes-natural-operator-intent-routing` | ⚠️ Yes | No |
| `codex/hermes-admin-chat-ui-only-20260507-062035` | ⚠️ Yes | No |
| `codex/hermes-admin-ux-controls-20260507-064658` | ⚠️ Yes | No |
| `codex/hermes-admin-wizard-ux-20260507` | ⚠️ Yes | No |
| `codex/hermes-direct-ollama-chat` | ⚠️ Yes | No |
| `codex/hermes-direct-ollama-chat-clean` | ⚠️ Yes | No |
| `codex/hermes-readiness-routing-fixes` | ⚠️ Yes | No |
| `codex/hermes-repo-registry-targeting` | ⚠️ Yes | No |
| `codex/hermes-runtime-owner-router` | ⚠️ Yes | No |
| `codex/hermes-tool-bridge-final` | ⚠️ Yes | No |
| `codex/hermes-tool-registry-skills-gpt-operator` | ⚠️ Yes | No |
| `codex/hermes-universal-owner-router` | ⚠️ Yes | No |
| `codex/hermes-webcrawl-agent-20260507-071439` | ⚠️ Yes | No |
| `codex/sandbox-governance-docs-only-20260507-062917` | ⚠️ Yes | No |
| `codex/sandbox-unified-ui-rebuild-20260507-060628` | ⚠️ Yes | No |

## Shell/UI
High-risk overlap (category-level): **js/components/, js/site-shell.js**

| Branch | Likely stale | High-risk overlap |
|---|---|---|
| `codex/add-interaction-layer-to-ui` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/clean-shell-unification-index-truth` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/final-sanity-pass-on-ui-fixes` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/fix-console-issues-on-live-pages` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/fix-live-page-warnings-and-enhance-ui` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/fix-oversized-foreground-moonboys-logo` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/fix-panel-for-daily-wtf-events` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/home-hero-css-animation-followup` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/home-hero-split-sections-rebuild` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/homepage-real-layered-pixel-scene` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/implement-real-time-interaction-layer` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/implement-site-visual-overhaul` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/install-homepage-neon-ui-unifier-override` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/mobile-sidebar-overlay-touch-fix` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/remove-broken-white-hero-overlay-layer` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/separate-moonboys-logo-homepage-bg` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |
| `codex/stabilise-css-shell-contract` | ⚠️ Yes | ⚠️ js/components/, js/site-shell.js |

## Misc
High-risk overlap (category-level): **None identified**

| Branch | Likely stale | High-risk overlap |
|---|---|---|
| `codex/add-how-to-play-and-systems-manual-page` | ⚠️ Yes | No |
| `codex/add-telegram-group-event-announcements` | ⚠️ Yes | No |
| `codex/add-xp-visibility-and-onboarding-explainer` | ⚠️ Yes | No |
| `codex/audit-live-player-data-integrity` | ⚠️ Yes | No |
| `codex/audit-open-prs-and-create-consolidation-pr` | ⚠️ Yes | No |
| `codex/content-clarity-five-pages` | ⚠️ Yes | No |
| `codex/daily-wtf-timed-events-xp-burst` | ⚠️ Yes | No |
| `codex/extract-daily-digest-routes` | ⚠️ Yes | No |
| `codex/favicon-png-standardization` | ⚠️ Yes | No |
| `codex/fix-copilot-sync-race` | ⚠️ Yes | No |
| `codex/fix-daily-wtf-live-feed-recovery` | ⚠️ Yes | No |
| `codex/fix-daily-wtf-right-rail-fallback-helper-race` | ⚠️ Yes | No |
| `codex/fix-missing-sync-trigger-after-score-submit` | ⚠️ Yes | No |
| `codex/fix-personal-activity-feed-mixup` | ⚠️ Yes | No |
| `codex/identify-code-conflicts-in-game-repo` | ⚠️ Yes | No |
| `codex/improve-sync-user-experience-and-auto-submit` | ⚠️ Yes | No |
| `codex/perform-sanity-audit-and-update-readme` | ⚠️ Yes | No |
| `codex/pr-564-conflict-resolve` | ⚠️ Yes | No |
| `codex/task-title` | ⚠️ Yes | No |
| `codex/task-title-28o7fe` | ⚠️ Yes | No |
| `codex/task-title-2dunm8` | ⚠️ Yes | No |
| `codex/task-title-51pbxj` | ⚠️ Yes | No |
| `codex/task-title-61knd3` | ⚠️ Yes | No |
| `codex/task-title-8ab4s2` | ⚠️ Yes | No |
| `codex/task-title-d4tjxw` | ⚠️ Yes | No |
| `codex/task-title-dkrf0y` | ⚠️ Yes | No |
| `codex/task-title-dojukm` | ⚠️ Yes | No |
| `codex/task-title-ekmx35` | ⚠️ Yes | No |
| `codex/task-title-mkvx3t` | ⚠️ Yes | No |
| `codex/task-title-o298ul` | ⚠️ Yes | No |
| `codex/task-title-r3hi4y` | ⚠️ Yes | No |
| `codex/task-title-r690ve` | ⚠️ Yes | No |
| `codex/task-title-tdpo9z` | ⚠️ Yes | No |
| `codex/task-title-ttetkl` | ⚠️ Yes | No |
| `codex/task-title-xfsos0` | ⚠️ Yes | No |
| `codex/task-title-zis6ic` | ⚠️ Yes | No |
| `codex/update-telegram-login-and-progression-wording` | ⚠️ Yes | No |
