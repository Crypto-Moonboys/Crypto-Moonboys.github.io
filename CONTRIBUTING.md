# Contributing

## Mission alignment

Public-facing changes must preserve the current Crypto Moonboys hierarchy:

- Crypto Moonboys is the Graffiti Kings creator umbrella, not a game.
- Path 1 lets users build one or more 1/1 Moonboy identities through XP, eligible free NFT drops, keep/flip/burn and forge progression.
- Path 2 lets existing artists, businesses, product creators, brands and alter egos use SWARMSY without needing a Moonboy.
- Every 1/1 holder is a HODL Warrior and part of the active creator army.
- SWARMSY supports both paths.
- Games, NFTs, the wiki, Battle Chamber, Block Topia and lore are supporting systems.

Review `README.md` and `Crypto_Moonboys_Master_Source_of_Truth_v1.md` before changing mission, onboarding, ownership, reward or identity copy.

## Branch safety

- Stale `codex/*` branches must not be merged directly.
- Any reopened branch must be rebased or recreated from the latest `main` before review.
- Do not push mission or runtime changes directly to `main`.

## Validation before merge

- `npm test` must pass before merge.
- Public copy must be checked against both onboarding paths.
- Reduced-motion and no-JavaScript homepage fallbacks must remain usable.
- Ownership claims must match the published creator licence and royalty terms.
- XP gate copy must match live configuration rather than stale documentation.
- Every PR must complete the pull request template. PRs with missing deploy/test scope must not be merged.
- PR template completion is enforced by `.github/workflows/pr-template-check.yml`. Template validation is skipped for draft PRs and only applies once a PR is marked ready for review.

## Deployment and restart notes

- Worker changes require an explicit deploy note in the PR.
- VPS/server changes require an explicit restart note in the PR.
- Static copy-only changes require a GitHub Pages deployment note.
