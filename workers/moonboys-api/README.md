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
