# Moonpet pet selector fix — 6 October 2026

Base: merged main `b9868fe93c6dc3aa556178985173e0b42122dedb`.

An owner with two active saved pets from an earlier quarter could open the game
with a later rollout egg selected and see only its active slot number. The old
core renderer omitted all pet rows, and the full renderer placed the switch
buttons inside a collapsed panel labelled Competition Season. The ownership
records and original XP remained saved.

Pet spaces now have a separate, initially expanded panel on Home and Profile.
It uses the server's existing core/full roster, shows each pet's saved level and
XP, and preserves the existing authenticated switch, unlock and confirmed-delete
controls. Profile keeps the roster visible during pending or failed module
hydration. Competition details and rich progression remain separately collapsible;
saved panel preferences are respected. Missing instances remain visibly owned but
cannot be switched, deleted or repurchased. An uncertain previous action still
requires Refresh before another mutation.

No ownership row, active pointer, lifecycle, reward history or XP is rewritten by
this change. It does not delete the rollout egg or automatically select a pet.

## Verification

`scripts/moonpet-pet-spaces.test.mjs` runs the real Home/Profile, panel and button
renderers with two original level-8 saves and a selected level-1 egg. It checks
core and full responses, missing instances, panel preferences, uncertain-action
guards, and pending/failed Profile hydration. The first seven regressions fail
against the previous client and pass with the fix.

The real browser loop checks the core Home selector before opening competition
details, switches to each older pet, and confirms both saved XP totals and all
three ownership records survive. Both mobile viewport sizes run in Visual CI.

## Release

Mini App and Telegram launch version: `20261006-pet-spaces-v1`. The unchanged art
loader keeps `20261006-live-refresh-v5`. After an approved merge, GitHub Pages
publishes the frontend; deploy `moonboys-api` from updated main to update its
launch URL constant. No D1 migration or VPS change is required. No production
deployment or data mutation was performed during implementation.

After release, reopen the Telegram Mini App. Home and Profile must show Pet
Spaces with all retained pets and enabled switch buttons for the selectable
inactive pets. Select each original pet and verify its saved level and XP.
