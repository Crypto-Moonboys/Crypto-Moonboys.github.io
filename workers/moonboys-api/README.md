# Moonboys API Worker

This Worker owns the live Telegram, Arcade XP, faction and Block Topia progression routes.

## Production deploy

Run from the repository root on a clean, updated `main` checkout:

```sh
npm ci
node scripts/worker-deploy-readiness-audit.mjs
node scripts/deploy-worker-with-provenance.mjs moonboys-api
```

Do not bypass the provenance wrapper with a direct Wrangler production deploy. The wrapper refreshes `origin/main`, requires local `HEAD` to match it, and tags the Cloudflare Worker Version with the full repository commit used by `/deployment-info`.

`POST /telegram/webhook` requires `X-Telegram-Bot-Api-Secret-Token` matching the
Cloudflare `TELEGRAM_WEBHOOK_SECRET` secret. Before deployment, complete
[the exact secret and Telegram registration process](../../docs/telegram-webhook-security.md).
The production wrapper verifies that this secret binding exists; a missing or
unreadable binding blocks deployment. Never store its value in Wrangler variables.

## D1 migrations

Do not apply D1 migrations as part of an ordinary Worker deployment. Inspect the production migration state separately, apply only reviewed missing migrations, and retain evidence in `deployments/production.json`.

## Live route groups

- `GET /health`
- `GET /deployment-info`
- Telegram auth/link/profile/activity/status routes
- `POST /arcade/progression/sync`
- faction status/join/earn routes
- `POST /blocktopia/progression`
- `POST /blocktopia/progression/entry`
- `POST /blocktopia/progression/upgrade`
- `POST /blocktopia/progression/mini-game`
- `POST /blocktopia/progression/reset`

## Runtime rule

Keep this Worker aligned with live routes only. Remove disabled, archived or compatibility-only route families instead of documenting them.

## Clan Operations progression and scheduled rewards

The public Battle Chamber shows each crew's city project. Confirmed banks move
the project through 30, 100 and 300 weekly banks. These milestones track crew
activity and reset Mondays at 00:00 UTC.

Apply migration `126_clan_period_rewards.sql` before enabling period close.
Set `CLAN_PERIOD_REWARDS_FROM` to the approved UTC start date (`YYYY-MM-DD`).
The first scored period of each kind is the first full period starting on or
after that date. Configured Community seasons with an end date use the full
UTC days they contain. Closes run on the existing five-minute Worker tick
with a five-minute settlement buffer. A saved result freezes standings and
grants receipt-backed entitlements in one transaction.

- Weekly scoring uses the existing locked roster and best five UTC days.
  Monthly and seasonal scoring applies the same rule to the days inside
  each period and sums each roster's scores and possible banks. A roster in
  a short boundary week can count at most three banks per day in that slice.
- A ranked period needs at least two crews with three distinct entrants each.
  A crew needs a bank to place. Exact ties share rank and first-place rewards.
  Only players with a bank that matches their winning locked roster earn its
  award. A player's awards appear in My Moonboy and their operation collection.
- Winners earn the Crew Spotlight Badge weekly, the Monthly Crew Champion
  Badge monthly, and the City Champion Trophy and title seasonally. The Battle
  Chamber shows recent final scores and the seasonal Hall of Fame.
- Set `CLAN_SIGNAL_XP_FROM` to the approved cutover timestamp in UTC
  (`YYYY-MM-DDTHH:mm:ss.sssZ`). The scheduled Worker credits 100 Community XP
  per account and official window when a player banks a tier inside that
  window. The existing Community award receipt makes retries idempotent.
  Banks before the cutover or outside the six official windows are excluded.
  Completing a legacy signal objective can still unlock its roguelite options.
  XP amounts shown there are previews. Daily operation Renown, collectibles,
  Arcade XP, Battle Chamber Clout and WAX balances use their existing ledgers.

The five-minute production tick prepares the next Community season during
the final 24 hours of a dated season. The successor starts at the exact
previous end time and runs for 90 days. Date-aware reads keep the existing
season current until that boundary. The closing standings and rewards use
the existing settlement buffer. An operator seeds the initial season with
an end date. Later seasons continue automatically while Clan Operations and
period rewards are enabled.

### Clan campaign catalogue

Migration `127_clan_campaigns.sql` adds the campaign plans, frozen results and
collectible receipts. Apply it before deploying the compatible Worker. The
existing Clan Operations and period reward settings enable the campaign tick.
The first eligible full season is Season 13. The public preview projects the
next dated season in advance. The Worker saves the plan for an eligible active
or upcoming season and keeps that plan through later builds.
The first two campaigns use all 60 catalogue parts across two disjoint sets.
Subsequent campaigns alternate themes and select objectives, events and
collectibles deterministically from their respective pools.

The first objective admits players through their first confirmed bank during
the window and uses the faction on that receipt. It awards progress. Later
windows use the roster locked for their opening UTC week. Only matching
server-confirmed Clan Operation banks count. Individual challenges
cap each entrant’s credit at the challenge target and require at least 70%
of the roster’s possible score. Team challenges use the stated objective.
City events and the co-op finale give each rostered faction an equal share of
the city meter, with at least four shares. The usual 30% and 35% city goals
require at least two contributing factions. Ranked finale scores count equal parts participation and banks
per eligible roster day. At least two crews with three entrants are needed
to place. Ties share the result.

Five of the campaign windows have collectibles. Qualifying crews' players
who banked in the window receive a receipt when the window closes. Final
results and receipts commit together after a five-minute UTC buffer.
Collectibles are in-game records. The existing rankings and reward ledgers
continue to use their original inputs and rules.

Starting with Season 15, a selected Night Shift event reverses the daily route
rotation for newly opened operations. A saved daily run keeps its route.

Local release checks include the campaign regression cases in
`scripts/clan-mining-pilot.test.mjs` and the mobile campaign panel in
`scripts/faction-operations-browser.test.mjs`. Use a local D1 fixture to
exercise the first campaign before the scheduled production handover.

### Daily PFP Roll

Battle Chamber uses the Builder’s 20 saved PFPs for the daily target rotation.
D1 pins each target and its three trait pools by UTC day. Each signed faction
member can use five free rolls per day. The Worker awards 0, 5, 15 or 50
Community XP for zero, one, two or three matching traits. A full match also
makes the winning portrait available for PNG export from the current round.

Apply `128_clan_pfp_roll.sql` before turning on `CLAN_PFP_ROLL_ENABLED` in the
Moonboys API Worker. The game also uses the Clan Operations availability
setting. The per-account request ID keys both the roll and its Community XP
receipt. Roll persistence and XP settlement share one D1 batch. PFP rolls
write to their own tables and Community XP, leaving Paint Wall banks on the
existing operations ledger.

### Faction leader rounds and rival slowdowns

Apply `129_clan_leader_presence.sql` before setting `CLAN_LEADER_PLAY_FROM`
to the agreed UTC start date (`YYYY-MM-DD`). Leave the variable unset while
the feature is closed. The five-minute Worker tick uses the public site's
sitemap and each faction's own chamber URL for visits. An available leader
can complete one unranked training round per tick with the shared mining rules.
A successful round adds one Leader Power. Missed ticks are skipped. Internal
rounds do not make entries in player ledgers or arcade leaderboards.

Signed members may interrupt a rival with one free preset question per UTC
day (5, 10 or 20 minutes). A paid pause costs 100 Block Topia XP or 5 Block
Topia gems for 1 hour, or 1,200 XP or 50 gems for 24 hours. There is a one-hour
recovery interval after brief or hourly pauses, and six hours after a 24-hour
pause. Slowdowns cannot overlap or accumulate during recovery. Paid actions
atomically write a pause and a progression cost receipt. The feature only
affects independent leader rounds, while members' banks and signals continue
during the pause.
