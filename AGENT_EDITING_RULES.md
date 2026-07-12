# Agent Editing Rules

Main branch is sacred.
Sandbox branch is the warzone.
Production only changes after GK says yes.

## Mission truth

Before editing public copy, agents must understand the hierarchy:

- Crypto Moonboys is the Graffiti Kings creator umbrella, not a game.
- The umbrella has two valid onboarding paths.
- Path 1: build one or more 1/1 Moonboy identities through identity, faction, XP, eligible free NFT drops, keep/flip/burn and forge progression.
- Path 2: keep an existing artist, business, product, brand or alter-ego identity and use SWARMSY without needing a Moonboy.
- Moonboys are the new generation of Graffiti Kings identities in the Web3 and blockchain world.
- GKniftyHEADS is the primary foundation alongside other Moonboy factions connected to OG Graffiti Kings artists.
- Every 1/1 holder is a HODL Warrior and part of the active creator army.
- SWARMSY supports both paths with identity, strategy, planning, branding, publishing, growth and momentum.
- Games, XP, NFTs, burns, the wiki, Battle Chamber, Block Topia and lore are supporting systems, not the top-level mission.

When copy conflicts, use this order:

1. `README.md`
2. `Crypto_Moonboys_Master_Source_of_Truth_v1.md`
3. live runtime code and configuration
4. this file
5. `.copilot-instructions.md`
6. relevant public pages
7. older planning and lore documents

## Global enforcement

- Never push direct edits to `main` or `master`.
- Always create backup + sandbox branches first.
- Keep destructive operations gated by explicit approvals.
- Present intended file/action plan before edits where possible.
- Include tests + unresolved risks in every PR handoff.

## Public copy guardrails

- Never call Crypto Moonboys a game.
- Never make Path 1 appear mandatory for users who only need SWARMSY.
- Never present NFTs as the reason the umbrella exists.
- Never reduce HODL Warriors to passive holders.
- Never present SWARMSY as an unrelated side project.
- Never state a stale hard-coded XP gate when a live configuration source exists.
- Never invent legal ownership beyond the published creator licence and royalty terms.
- Always separate live, planned and lore-only systems.

## Scope boundaries

- Do not modify unrelated runtime systems outside requested scope.
- Preserve existing auth, leaderboard, Telegram and core gameplay behavior unless explicitly requested.
- Never expose secrets, keys, `.env` or private credentials.

## Release control

No production deployment and no final merge without explicit GK confirmation.
