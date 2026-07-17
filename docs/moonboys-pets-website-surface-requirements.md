# Crypto Moonboys Pets Website Surface Requirements

This document extends `docs/moonboys-pets-telegram-roguelite-plan.md` with the required website surfaces for Crypto Moonboys Pets.

## Review Outcome For PR #1043

The base plan correctly says Crypto Moonboys Pets must:

- have pet-specific API routes,
- have its own pet leaderboard,
- award Community XP through the existing `awardXp(...)` path,
- feed existing `telegram_users.xp` and `telegram_xp_log`,
- leave the existing arcade XP path untouched.

The implementation must also add the page and search surfaces below. These are required, not optional.

## Required Public Pages

### 1. Crypto Moonboy Pets Wiki Page

Create a dedicated wiki page:

`wiki/crypto-moonboy-pets.html`

Page title:

`Crypto Moonboy Pets`

Purpose:

- Explain what Crypto Moonboy Pets is.
- Explain that the game is played on Telegram.
- Explain that users grow their Crypto Moonboys pet through care, training, missions, streaks, and seasons.
- Explain that pet-earned Community XP is added to the main website XP leaderboard and graph.
- Explain that detailed pet stats live on the pet page/pet leaderboard, not dumped into the existing Community pages.
- Link to the Telegram bot/game CTA.
- Link to the pet leaderboard.
- Link to the How To Play page.

Search requirement:

- The page must appear in the website wiki search.
- It must be present in the generated/searchable wiki index used by `js/wiki.js` and `search.html`.
- Search terms that should find it include: `Crypto Moonboy Pets`, `Moonboys Pets`, `Telegram pet`, `pet game`, `Tamagotchi`, `roguelite`, `pet leaderboard`, `pet XP`.

Graph/wiki requirement:

- The page should be treated as a Gaming and Community wiki entity.
- If the repo generation scripts require metadata for rank/category/entity output, add the correct metadata so the page appears in search and graph tooling like other wiki pages.

### 2. How To Play Page

Create a dedicated how-to-play page, either:

`how-to-play-crypto-moonboy-pets.html`

or, if the site pattern prefers wiki-owned guides:

`wiki/crypto-moonboy-pets-how-to-play.html`

Minimum content:

- How to start the Telegram bot.
- How to link Telegram with `/gklink`.
- How to adopt a pet.
- What feeding, playing, cleaning, sleeping, training, and missions do.
- How pet XP differs from Community XP.
- How daily, weekly, seasonal, and all-time ranking works.
- How seasons reset automatically.
- What users can earn in-game: XP, pet stages, titles, badges, seasonal memories, and future utility where applicable.
- Clear note: no financial promises; gameplay rewards and XP are game/community progression.

### 3. Pet Leaderboard Page Or Panel

Create a dedicated pet leaderboard surface. Recommended URL:

`crypto-moonboy-pets-leaderboard.html`

Alternative if the repo prefers wiki pages:

`wiki/crypto-moonboy-pets-leaderboard.html`

The pet leaderboard must be separate from the current Community XP leaderboard.

Required leaderboard views:

- Daily pet XP
- Weekly pet XP
- Current pet season XP
- All-time pet XP

Required displayed fields:

- rank
- display name
- pet name
- pet stage
- pet level
- pet season XP
- streak days
- last active label

Do not expose private Telegram IDs in the UI.

## Main Leaderboard And Graph Integration

The existing main Community XP leaderboard and graph must include XP earned from Crypto Moonboys Pets because pet actions call the existing `awardXp(...)` flow.

Required behavior:

- Pet Community XP is added to `telegram_users.xp`.
- Pet Community XP is logged in `telegram_xp_log` with action names prefixed by `pet_`.
- Existing `/telegram/leaderboard` includes pet-earned XP naturally.
- Existing Community XP graph uses the same XP log source, so pet XP contributes to the graph.
- The graph may show source/category breakdown if supported, but must not require all pet stats to be dumped into current pages.

Important separation:

- Main Community XP leaderboard = combined XP from Telegram, arcade, wiki missions, pets, and future official sources.
- Pet leaderboard = pet-only progression and ranking.
- Pet stats = shown on Crypto Moonboy Pets pages/panels only.
- Existing community pages should show only a compact pet summary or CTA, not every live pet stat.

## No Data Dump Rule

Do not overload current pages with all pet details.

Allowed on existing pages:

- Compact pet card on `community.html`.
- CTA card on `games/index.html`.
- Combined XP total on current leaderboard/graph.
- Small source label such as `Pets XP` if the existing activity feed supports source display.

Not allowed on existing pages:

- Full pet stat table for every user.
- Full action history feed for every pet.
- Detailed hunger/happiness/cleanliness/energy for all players.
- Large new live stat panels that crowd out existing Community XP and arcade UI.

Put detailed pet data on the dedicated Crypto Moonboy Pets page and pet leaderboard page.

## API Requirements For Website Surfaces

Add or expose these endpoints:

| Route | Purpose |
| --- | --- |
| `GET /telegram-pets/state?telegram_id=` | Current user's pet summary for profile/pet page |
| `GET /telegram-pets/leaderboard?period=daily|weekly|seasonal|all_time` | Pet-only leaderboard |
| `GET /telegram-pets/missions?telegram_id=` | Current pet missions and completion state |
| `GET /telegram-pets/season/current` | Current pet season metadata |
| `GET /telegram-pets/activity?limit=20` | Optional pet-only activity feed for pet page only |

The existing `/telegram/leaderboard` remains the main combined Community XP leaderboard.

## Implementation Acceptance Checklist

The implementation PR is not complete until all of these are true:

- `wiki/crypto-moonboy-pets.html` exists.
- The Crypto Moonboy Pets wiki page appears in website search.
- A dedicated How To Play page exists and is linked from the pet wiki page.
- A dedicated pet leaderboard page or page section exists.
- The pet leaderboard is separate from the main Community XP leaderboard.
- Pet XP contributes to the main Community XP leaderboard via existing XP tables.
- Pet XP contributes to the current XP graph through the existing XP log/source path.
- Existing pages do not receive a heavy dump of every pet stat.
- `community.html` gets only a compact pet summary or CTA.
- `games/index.html` gets a Telegram Game card pointing users to play.
- Tests or audits assert that the wiki page is searchable and the pet leaderboard is separate.

## Short Codex Build Addendum

Use this with the main build prompt:

```text
Also implement the website surfaces from docs/moonboys-pets-website-surface-requirements.md. Create wiki/crypto-moonboy-pets.html, a dedicated How To Play page, and a dedicated pet leaderboard. Ensure the pet wiki page appears in website search. Pet-earned Community XP must feed the existing main XP leaderboard and graph through telegram_users.xp and telegram_xp_log, while detailed pet stats stay on the new Crypto Moonboy Pets pages and do not data-dump onto existing community pages.
```
