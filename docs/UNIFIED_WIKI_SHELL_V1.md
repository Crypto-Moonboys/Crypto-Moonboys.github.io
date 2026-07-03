# Unified Wiki Shell v1

This note defines the first unified public UI shell for the Crypto Moonboys site.

## Main rule

All public pages should share the same shell chrome and route back to the wiki/search layer for discovery.

The source of public discovery is:

- `/wiki/`
- `/search.html`

Legacy pages can still exist in v1, but they are mounted inside the same shell instead of carrying their own competing UI.

## Runtime owner

`/js/site-shell.js` owns:

- global top navigation
- wiki search
- compact slide-out navigation
- layout wrapper
- route mode detection
- legacy route banner
- SWARMSY floating entry
- shell recovery if page scripts remove the header or nav

## Required global links

The shell must always show:

- HOME
- WIKI
- GAMES
- BATTLE CHAMBER
- SWARMSY
- SYSTEM HUB

## Shell modes

The shell stamps a mode on the body:

- `home`
- `wiki`
- `games`
- `battle`
- `tool`
- `system`
- `legacy`

`/css/wiki-shell-v1.css` uses those modes to keep pages visually consistent.

## Canonical route handling

V1 does not delete legacy pages or force redirects. It shows a canonical wiki/search route banner where needed so games, tools, and dashboards do not break.

Examples:

- games routes point back to `/wiki/games-graffpunks.html`
- battle routes point back to search for Battle Chamber
- system routes point back to search for System Hub
- SWARMSY routes point back to search for SWARMSY
- WAX tool routes point back to search for WAX

## Guardrail

Run:

```bash
node scripts/wiki-first-public-pages.test.mjs
```

This checks the shell contract, stylesheet, required global labels, and canonical route rules.
