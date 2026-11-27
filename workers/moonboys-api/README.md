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

## Automatic Cloudflare validation and release

A ready PR from a branch in this repo that changes `workers/moonboys-api/`
automatically starts Cloudflare validation for its exact head SHA. The job
builds the Worker and runs Worker/API tests. If the PR adds SQL, a separate
trusted job reads the production schema and migration names. The test runner
applies the SQL to disposable D1 without production rows or credentials.
Add a focused API regression test for the fix to the PR.

For these PRs, approving and merging to `main` also authorizes release of the
reviewed Worker and any forward migrations in the PR. GitHub verifies the
pre-merge run, validates merged code, checks the migration ledger and applies
only approved pending migrations. It then publishes through the provenance
wrapper and checks the live Worker health and commit.

For Worker-only changes, the schema job is expected to show **Skipped**.
Confirm that **release** ran and passed. The overall run can show success
when a conditional job was skipped. Confirm the merge SHA against
[production deployment metadata](https://api.cryptomoonboys.com/deployment-info).

One-time GitHub setup:

- Keep the existing repository secrets `CLOUDFLARE_D1_READ_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` for migration validation.
- Set up the `cloudflare-production` environment with a deployment branch
  restriction for `main`, the `CLOUDFLARE_RELEASE_API_TOKEN` environment
  secret scoped to the target account's Workers and D1, and the
  `CLOUDFLARE_ACCOUNT_ID` environment variable. Required reviewers on this
  environment add an extra release click. Keep sign-off in the PR approval
  workflow for unattended release after the merge.

The **Cloudflare PR validation and release** workflow also supports manual
dispatch from `main` for recovery or API-agent requests outside the path
filter. For manual release, supply the successful validation run ID and
explicitly select **apply_d1** if the release includes pending migrations.
For fork contributions, review the change and use a branch in this repo
for the automated path.

Release fails closed if a test fails, the merge is no longer current
`main`, or applying this PR's migrations would apply unrelated pending
files. A release may be retried after a partial failure. It checks for
already applied migrations. A Worker rollback does not roll back D1.

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
the feature is closed. Each hour the Worker assigns every faction one
five-minute game window. Start times and groups vary while each window allows
at most three leaders off the map. The Worker uses public arcade routes from
the sitemap and the shared mining rules for unranked training. An uninterrupted
round adds 12 Leader Power when its window closes, for the same daily ceiling
of 288 per leader. Missed ticks are skipped. Training never writes player
ledgers or arcade leaderboards.

Signed members may interrupt a rival with one free preset question per UTC
day (5, 10 or 20 minutes). A paid pause costs 100 Block Topia XP or 5 Block
Topia gems for 1 hour, or 1,200 XP or 50 gems for 24 hours. There is a one-hour
recovery interval after brief or hourly pauses, and six hours after a 24-hour
pause. Slowdowns cannot overlap or accumulate during recovery. Paid actions
atomically write a pause and a progression cost receipt. The feature only
affects independent leader rounds, while members' banks and signals continue
during the pause.

### Faction leader lore chat

Apply `130_clan_leader_lore.sql` and configure a dedicated Hermes API gateway
on the VPS with its provider set to local Ollama. Use a game-only profile
with all toolsets disabled and no access to the build runner’s credentials or
private workspace. Keep Ollama and Hermes bound to loopback. Use an authenticated
HTTPS proxy that forwards only `POST /v1/chat/completions` to that profile.
Set `CLAN_LEADER_HERMES_URL` to the full HTTPS endpoint and store the bearer key
as the `CLAN_LEADER_HERMES_TOKEN` Worker secret.
`CLAN_LEADER_HERMES_MODEL` names the gateway profile and defaults to
`hermes-agent`. The Ollama model itself is configured on the VPS.
Set `CLAN_LEADER_LORE_ENABLED=true` when the connection is ready. Chat requires
the configuration for the selected provider. Hermes is the default and has no hosted model fallback.
Players sign in with Telegram and can ask any of the nine faction leaders.
The Worker sends the question, up to two earlier questions, and public source
excerpts to the model. Telegram auth and account IDs stay within the Worker.
Only daily usage counts are saved to D1.

To use your own Google AI Studio key through Cloudflare AI Gateway, configure the
following on the Worker. Keep both credentials in encrypted Worker secrets.

| Binding | Value |
| --- | --- |
| `CLAN_LEADER_LORE_PROVIDER` | `gemini` |
| `CLAN_LEADER_GEMINI_GATEWAY` | `https://gateway.ai.cloudflare.com/v1/<account-id>/moonboys-lore` |
| `CLAN_LEADER_GEMINI_KEY` | Google AI Studio API key (secret) |
| `CLAN_LEADER_GATEWAY_TOKEN` | Cloudflare AI Gateway Run token (secret) |
| `CLAN_LEADER_GEMINI_MODEL` | Optional. Defaults to `gemini-3.8-flash` |

Gemini uses the same published lore retrieval and nine faction profiles. It checks
each question for canon relevance and can also hold a general conversation or
invent new, explicitly non-canon lore without a trigger phrase. Canon replies still
require citations. The chat sends the last two questions and replies so follow-up
questions can build on the same scene. Standalone greetings are answered locally
before retrieval or any model call, and count towards the player’s chat allowance.
Gemini defaults to 100 provider calls per UTC day across the site unless
`CLAN_LEADER_LORE_SITE_LIMIT` specifies a different positive limit. The gateway
uses provider billing and disables prompt and response logging. Verify both chat
modes with a signed-in Waterfront session after deployment.

The nine leaders have their own faction identity, voice and guiding values.
They share a knowledge catalog built from the published site artifact, public
Wiki index, sitemap and current canon references. Pages publishes the artifact's
HTML and Markdown path index at `/js/leader-lore-sources.json`. The Worker reads
short excerpts from relevant documents when a question is asked and links the
sources it used. Editorial-only files, noindex pages and account routes stay out
of model context. Each signed player gets 10 chat questions per UTC day shared across all nine leaders.
Local replies and model replies use that same allowance. Faction members also get
one separate free slowdown each UTC day, shared across the same leaders.
Set `CLAN_LEADER_LORE_SITE_LIMIT` only if needed to cap total model traffic by
UTC day. In Waterfront,
select a leader for details and double-click or double-tap to ask. Send closes
the composer and the reply appears above the leader. The info button opens
the full reply and sources. Lore questions do not affect rounds, scores or
player balances.

### Waterfront faction seats

Apply `131_waterfront_seats.sql` and deploy the Worker before publishing the
Waterfront entry page. The entry endpoint verifies the same Telegram proof
and canonical faction membership used by Block Topia. Entry depends on a
free faction seat, with no XP threshold. Only a successful claim receives
the live district layout. Each browser document renews its 75-second seat
every 20 seconds, releases it when leaving where possible, and locks the
map when it loses the seat. The database allows one seat per faction and
one per account. Unrenewed seats expire on their own.

### Public SWARMSY Wiki Search

`POST /swarmsy/wiki-search` accepts a short question without Telegram authentication.
It uses the published Brain feed for official Wiki references. The
`SWARMSY_SEARCH_AI` binding runs Cloudflare's native Workers AI model with the
published Wiki excerpts. The existing article search remains usable when AI
is unavailable.

Anonymous requests have separate keys in the existing Worker rate limit bindings.
A separate D1 counter caps model calls at 100 per UTC day using the existing
`clan_leader_lore_usage` table from migration 130. No visitor identity or query
text is written to that table.
