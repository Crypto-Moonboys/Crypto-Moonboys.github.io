# Telegram website authentication: architecture and migration audit

Status (activation PR #1465): OIDC implementation merged separately; migration 090, initial Worker deployments and BotFather/OIDC setup were reported completed. This PR changes the API production feature flag to enabled. The enabled flag takes effect only after PR #1465 is merged and the updated moonboys-api Worker is deployed. Real Telegram-provider authentication and returning-player preservation remain unverified until live acceptance passes. No production activation is claimed merely by merging the flag change.

## Existing paths and ownership

`js/identity-gate.js` coordinates legacy Telegram Login evidence and the bot link
flag. `/telegram/auth` verifies legacy HMAC evidence but does not activate an
account. `/gklink`, the Incubator callback and `/telegram/link/confirm` establish
activation. `/telegram/user/status` restores fresh, signed evidence only when
valid proof accompanies the request. A browser ID, username or local linked flag
is never sufficient proof for a protected server operation.

`telegram_users.telegram_id` is the unique account anchor. Arcade progression,
Block Topia progression, faction membership, pets, achievements, rewards and
ownership references retain their existing keys. `telegram_users.id` is also
preserved. The existing leaderboard deployment accepts registered Telegram
accounts through its compatibility wrapper and shares the `wikicoms` D1 database
with the API. Its anti-cheat KV and score validation stay in place.

Moonpet `/telegram-pets/app/*` validates Telegram Mini App `initData` using the
bot token, rejects expired data and uses scoped mutation challenges. Browser
launches use the shared identity gate. Website login does not replace Mini App
validation. Requests supplying two authentication methods must agree on identity.

## New flow

1. A desktop or mobile browser visits `/telegram/website/start` on
   `https://api.cryptomoonboys.com`. The Worker creates a ten-minute transaction
   containing state, a browser-cookie binding, nonce and PKCE verifier. It
   also records any existing verified session for revocation: the Strict session
   cookie will not accompany Telegram's cross-site return. It redirects to
   Telegram with Authorization Code + S256 PKCE.
2. Telegram returns to `/telegram/website/callback`. An atomic D1
   `DELETE ... RETURNING` consumes the matching state and browser binding before
   code exchange. The Worker sends the verifier and Client Secret to Telegram.
3. `jose` verifies the ID token against Telegram's pinned JWKS URL. Validation
   requires RS256, issuer, audience, expiration, recent issuance, nonce and the
   profile `id` claim. Provider URLs are constants; token-supplied key URLs and
   signing algorithms cannot select a verifier.
4. The verified numeric **`id`**, not OIDC **`sub`**, resolves the existing
   account. The issuer/client/subject binding must agree with that ID. Conflicts
   fail closed, including a different identity when a live cookie session exists.
   Concurrent conflicting bindings cannot activate or create the other account.
5. The Worker upserts only verified name/username metadata and records
   `link_confirmed`. It never replaces a user row, resets progression or grants
   XP, pets, rewards, faction membership, ownership or game eligibility.
6. A host-only `Secure; HttpOnly; SameSite=Strict` cookie holds a random session
   secret. The browser returns to its allowlisted website URL with no tokens in
   the URL. The short-lived login cookie uses `SameSite=Lax` for the callback.
7. `/session` restores the identity and a five-minute opaque credential in memory.
   Protected clients pass it in the existing `telegram_auth` envelope. Its `s1_`
   namespace survives clients that copy only `id`, `hash` and `auth_date`.
   Both Workers verify its hash, account, expiry, revocation and anti-cheat state
   from D1; it cannot become a legacy Telegram HMAC credential.

The website keeps only display identity and session mode in localStorage. New
credentials and CSRF secrets are never persisted there. The existing legacy
cache remains solely for compatibility and is cleared when a website session
is restored. The server status endpoint preserves website credentials rather
than converting them into 24-hour legacy HMAC evidence.

The browser waits for API configuration when a game page loads the identity gate
first, then queries `/telegram/website/capabilities`. Only a server-confirmed
enabled capability activates website login controls and cookie bootstrap. A
disabled flag, missing credentials, unavailable capability or disabled API keeps
the bot fallback available. The capability exposes no secrets or account data.
Capability, session, renewal and logout requests have an eight-second abort
deadline. A stalled bootstrap settles identity waiters and uses the bot fallback;
a timed-out logout retains local identity until revocation can be confirmed.
Verified capability and request health are separate: transient network errors,
bad JSON and server errors do not permanently disable renewal. Later requests,
visible-tab refresh and the renewal timer retry the cookie session. A failed
initial capability or session probe is retried by fresh-auth callers even when
the callback cookie has no local session marker yet; legacy proof remains the
fallback when that retry fails. Renewal authorization failures re-bootstrap the
shared cookie once: another tab may have replaced it while this tab retains the
old CSRF token. Only rejection of that cookie session clears local identity;
transient re-bootstrap failures retain it for another attempt. Five-minute proof
expiry does not revoke a retained verified website identity. Score submission and
other protected actions can therefore reach renewal before sending a write;
they still require fresh proof and server validation. Confirmed cookie session
expiry or revocation clears activation.

The shared profile hydrator retries after a verified session recovers, including
when both initial cookie probes failed and left the profile in guest/cache state.
It shares one in-flight fetch, locks only after authoritative hydration for that
account, and preserves live XP updates that arrive during the fetch. A verified
account change resets the old profile; a delayed response for another account
cannot overwrite the current profile. Session events only trigger a retry;
authentication still comes from the identity gate.

Moonpet reads and actions stop with a retryable error when renewal returns no
fresh proof but the identity gate retains a website session. They send no
unauthenticated gameplay request and do not mark authentication permanently
failed. The next attempt renews again; confirmed expiry keeps the existing
authentication failure behavior. Mini App `initData` and legacy proof still use
their existing paths, and mutations never replay automatically.

Arcade mission, faction contribution, Battle Chamber proof, modifier and Daily
WTF writers await fresh authentication before submitting. Mission, modifier and
streak hydration also renews before checking linked status. Local gameplay APIs
and progression calculations remain synchronous and unchanged. Unsent updates
use one authentication retry, then show a visible Retry updates control; that
control can retry only updates for which no mutation request was sent. A queued
update is pinned to its original Telegram account and stops if renewal or retry
changes identity. Modifier selection keeps the newest unsent choice, so retrying
an older choice cannot undo a later selection. An uncertain response after a
mutation is surfaced for profile verification and never replayed automatically.
Daily WTF retains its existing verified legacy access without adding a bot-link
prerequisite. Server validation and contribution authority remain unchanged.

Faction status uses `POST /faction/status` with proof in the body. The API rejects
website credentials in `telegram_auth` and `auth_evidence` URL query parameters
before database verification, including bare or whitespace-padded tokens, their
base64/base64url text encodings, JSON strings and the supported JSON/base64
evidence envelopes. Duplicate query keys are checked on both GET and POST
requests. Legacy signed GET status requests remain compatible; the current
browser sends both credential types in POST bodies. No new website
credential belongs in a URL, browser cache or log.

## Session and security contract

Access credentials expire after five minutes. Renewal uses the HttpOnly cookie,
an exact allowed Origin and a session-bound CSRF header. Sessions have a
30-minute idle limit without renewal and a 24-hour absolute limit. A visible
website page renews every four minutes; protected asynchronous requests renew
near expiry. Bootstrap cannot extend the idle deadline. Logout revokes the
session, immediately invalidating every credential in both Workers, and clears
the cookie. Blocked accounts can still log out.
Every authentication batch and revocation write must explicitly report success;
an unconfirmed write returns 503 without issuing a replacement session cookie or
claiming successful logout. The browser retains its state until logout succeeds.
Migration 090 and the fresh schema index both absolute expiry and last-seen idle
expiry, plus credential session references, so login cleanup and cascading
credential deletion use indexed searches.
An environment that applied an earlier PR revision of migration 090 must also
install these two additive indexes during the approved rollout; reapplying its
idempotent SQL preserves existing accounts and authentication records.

Telegram's documented code-flow response supplies no refresh token or UserInfo
endpoint. Local renewal never invents a Telegram refresh grant. After absolute
expiry, the player authenticates with Telegram again. Provider failures, invalid
tokens, D1 failures, stale/replayed state, unverified identities, mismatched IDs and
expired/revoked sessions fail closed. Auth responses use `no-store`, restricted
credentialed CORS and `no-referrer`; they do not return provider tokens or errors.

The API custom domain is required. A `workers.dev` cookie would be third-party
to the website and unreliable on mobile. The GitHub Pages hostname retains the
bot fallback; it is not an OIDC return origin. Preview environments need explicit
HTTPS API and origin configuration and a separate BotFather registration.

Legacy HMAC evidence remains usable for its existing 24-hour window. Website
logout revokes website sessions; it does not retroactively revoke independently
issued bot/legacy evidence. Existing public profile/status reads are display
interfaces and remain public; they never issue credentials from an ID alone.
Legacy callbacks cannot replace a retained website identity or change identity
during its initial bootstrap. A different Telegram ID requires confirmed website
logout first. A same-ID callback preserves website proof, CSRF and session mode
instead of downgrading to legacy evidence, including while short proof is expired.
The Incubator keeps its legacy auth caches and competitive queue untouched when
the current website session is retained.

Logout stays available with the rollout flag disabled or OIDC secrets removed.
`GET /telegram/website/logout` prepares revocation: it requires the exact allowed
Origin, reads the cookie, and returns only the session-bound CSRF token (or null when no
session exists), and issues no access credential or session. A reloaded tab can
then send `POST /telegram/website/logout` with CSRF. An existing session requires
valid CSRF and a successful revocation write; a confirmed missing session returns
200 and clears the cookie. Database uncertainty remains a 503 and preserves
client identity. New login and session/credential issuance stay disabled during
rollback. D1, the first-party API domain and allowed origins must remain configured
for logout; provider secrets are unnecessary.

## Required configuration and approved deployment sequence

In the BotFather Mini App, select **WIKICOMSBOT → Login Widget**:

- Register `https://cryptomoonboys.com` and `https://www.cryptomoonboys.com`.
- Register the exact redirect URI
  `https://api.cryptomoonboys.com/telegram/website/callback`.
- Keep the default **RS256** signing algorithm. Request only `openid profile`;
  no phone, wallet or bot messaging permission is required.
- Obtain the OIDC Client ID and Client Secret. These are separate from
  `TELEGRAM_BOT_TOKEN`; set `TELEGRAM_OIDC_CLIENT_ID` and
  `TELEGRAM_OIDC_CLIENT_SECRET` as Worker secrets. Never commit their values.

After explicit GK deployment approval:

1. Take the normal D1 backup and record returning-player IDs and existing
   progression/ownership snapshots. Apply migration
   `090_telegram_website_sessions.sql` to `wikicoms` with the normal Wrangler
   migration workflow. It creates four auth tables and indexes only; no existing
   account backfill or ID conversion is required. Fresh schema installations
   contain the same definitions.
   Migration 090 is also required by the production manifest, evidence request,
   parser and D1 verification workflow; missing applied-migration evidence fails
   verification. These repository requirements do not claim it is already applied.
2. Confirm `api.cryptomoonboys.com` routes to `moonboys-api` with HTTPS. Configure
   the BotFather URLs and secrets above. Keep
   `TELEGRAM_WEBSITE_LOGIN_ENABLED=false` during the rollout.
3. Deploy the leaderboard Worker and then the API Worker from the reviewed
   commit. They must use the same existing D1 binding; anti-cheat KV bindings and
   bot token stay unchanged. Publish the website through the approved Pages flow.
4. Enable `TELEGRAM_WEBSITE_LOGIN_ENABLED=true` only after both Workers and
   migration are verified. Keep `TELEGRAM_WEBSITE_AUTH_ORIGIN` and
   `TELEGRAM_WEBSITE_ORIGINS` at the documented first-party values.
5. Use a returning account on desktop and mobile. Confirm Telegram's real code
   flow echoes the requested nonce, cookie bootstrap works, and the same numeric
   Telegram ID sees its original profile/Arcade XP and eligible games without a
   bot command. Compare the pre-login snapshots. Verify Mini App launches,
   `/gklink`, expiry, renewal and logout; a captured pre-logout test credential
   must be rejected by both Workers. Do not log credential contents.

Rollback: disable new login, retain the additive migration and bot fallback.
Do not delete auth bindings, reset accounts or remove progression tables. Revoke
website sessions if an authentication incident requires it. Keep the API domain,
origin allowlist and D1 binding available so users can still revoke their sessions.
A repository PR cannot itself prove BotFather, real provider nonce support, custom-domain cookie
behavior or production migration state; those are release acceptance checks.

## Official references

- [Current Telegram Login and OIDC specification](https://core.telegram.org/bots/telegram-login)
- [Telegram Mini App validation](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
- [OIDC discovery](https://oauth.telegram.org/.well-known/openid-configuration)

No Web3Auth, WalletConnect, automatic wallet, game-economy or canon change is part
of this migration.

## Regression coverage

`telegram-website-auth.test.mjs` exercises real SQLite constraints with D1-style
atomic batches and signed mock-provider JWTs. It covers additive migration,
retained account row IDs, both XP systems, pets, factions, achievements, reward
receipts, ownership links, repeat login, old bot login, accepted leaderboard
submissions, conflicting Mini App identities, callback replay, JWT validation,
origin/CSRF checks, renewal, idle/absolute expiry, revocation and D1 failures.
It also covers resolved D1 mutation failures and disabled rollout capabilities.
SQLite query-plan checks cover fresh-install and migrated session cleanup,
including idle/absolute expiry indexes and indexed credential cascades; cleanup
retains active sessions and deletes only expired sessions and their credentials.
Malformed `return_to` input consistently returns 400 without creating a login
transaction. Transport tests cover faction POST proof and rejection of JSON or
encoded website proof, bare/padded tokens and their base64/base64url text encodings,
quoted/nested token strings and duplicate URL query keys on GET/POST, while
preserving legacy GET compatibility.

`telegram-website-session-client.test.mjs` covers memory-only credentials,
bootstrap timing, competitive activation, legacy fallback, stale local flags,
renewal after transient errors/hidden-tab expiry, cross-tab cookie replacement,
markerless callback recovery and confirmed logout. Profile regressions cover
late recovery from guest state, concurrent hydration, live XP races and account
changes. Score submission renews expired proof after hidden-tab expiry or a
transient timer failure, and sends no score when the cookie session is rejected.
It rejects conflicting legacy identities, retains same-ID website sessions and
prepares logout after a rollback reload without issuing gameplay proof.

`telegram-website-login-browser.test.mjs` follows
the mocked-provider flow through the actual Incubator page in desktop and mobile
Chromium, verifies existing server-backed Arcade XP and confirms logout. It
also follows signed same/different-ID legacy callbacks across reloads, verifies
both accounts' existing XP, logs out during rollback without provider secrets,
and clears identity after cleanup has already deleted the session. It executes
the modifier writer with expired proof against the actual Worker and validates
cross-tab renewal after re-login replaces the shared HttpOnly cookie. Both
viewport tests also fail the first two cookie-session probes, then recover the
original server-backed profile without a reload. The browser tests require no
production credentials and do not contact Telegram. Server tests
cover disabled flags, either missing OIDC secret, origin/CSRF enforcement,
idempotent missing-session logout and rejection of revoked proof by both Workers.
The first two suites run in Worker/API CI; the browser suite runs in Visual CI.
`telegram-progression-auth.test.mjs` executes the actual Arcade modules in Arcade
CI: delayed renewal, safe unsent retries, account changes, modifier ordering,
legacy/guest compatibility, hydration and uncertain-write rejection.
`moonpet-passive-refresh.test.mjs` covers retryable website renewal failures for
reads and actions, recovery on the next attempt without duplicate submission,
confirmed expiry, Mini App/legacy compatibility and cancellation/deadlines.

## Callback incident diagnostics

`telegram_website_auth` structured events identify the action, stage, outcome,
fixed failure category, and a random per-request ID. The response also carries
`X-Moonboys-Auth-Request-Id`. Token exchange events include only the provider HTTP
status. No authorization code, token, state, cookie, client secret, SQL text,
callback URL, account ID or profile data is logged. Exception messages are
classified locally and discarded. Public response errors remain unchanged.

A handled Wrangler invocation can still return 503: the auth handler catches
exceptions intentionally. `website_login_unavailable` can come from an
unconfirmed D1 batch/revocation result or an exception during transaction
consumption, provider exchange/JSON parsing, JWKS/token verification, account
lookups, account/session writes or previous-session revocation. Use the failed
stage and category to identify which operation needs investigation.

Local validation of migration 090 and the actual D1 API confirms that atomic
`DELETE ... RETURNING` and the guarded account/session batch work with the
repository schema. This does not establish the deployed schema or production
root cause. Do not remove transaction consumption or weaken browser binding,
PKCE, nonce, issuer/audience validation, uniqueness or account blocking.

Before an approved release, obtain read-only production evidence:

```sql
SELECT type, name, tbl_name, sql FROM sqlite_master
WHERE tbl_name IN ('telegram_users', 'telegram_activity_log',
  'telegram_anticheat_state', 'telegram_oidc_accounts',
  'telegram_login_transactions', 'telegram_website_sessions',
  'telegram_website_credentials')
ORDER BY tbl_name, type, name;
SELECT name FROM d1_migrations WHERE name LIKE '090%';
```

Compare those definitions and indexes with migration 090 and the callback SQL;
inspect no player rows and apply no migrations until schema drift is confirmed
and GK approves the required change. Migration 090 does not add a foreign key
from OIDC bindings to users; session and activity rows reference the unique
`telegram_users.telegram_id`. Existing accounts are upserted without replacement;
progression and ownership columns are preserved.

### Confirmed root cause of the callback 503

The token exchange called `fetch(..., { redirect: 'error' })`. Node accepts that
value, but the Workers runtime (workerd) throws
`TypeError: Invalid redirect value, must be one of "follow" or "manual"` before
any network request. The handler caught it as stage `provider_exchange`, category
`provider_transport_or_response`, and returned 503 `website_login_unavailable`
after the transaction had already been consumed. Every production callback that
passed cookie/state validation therefore failed before contacting Telegram's
token endpoint. The Node fixtures injected `fetch` and asserted `'error'`, so
they could not detect it.

The exchange now uses `redirect: 'manual'`; a 3xx response fails the existing
`response.ok` check as `telegram_token_exchange_failed`, so redirects are still
never followed. A Telegram OAuth error returned with HTTP 200 and no `id_token`
now fails at `provider_exchange` instead of token verification. A Miniflare
regression test bundles the handler and runs start, callback, token exchange,
JWKS verification, D1 account/session writes and session bootstrap inside
workerd; it returns 503 with the previous code. PKCE, nonce, state,
browser-cookie binding, issuer/audience/algorithm checks, identity uniqueness
and account blocking are unchanged. The earlier `invalid_login_callback`
(cookie or state validation) is a separate failure mode and is not explained by
this defect.

### Why structured events were not visible

`moonboys-api` has `[observability] head_sampling_rate = 0.1`, so Workers Logs
persists only about one in ten invocations; a single start/callback pair is
usually unsampled in the Events/query view. The events are emitted with
`console.info`, so a level filter of error/warn also hides them. If Live Logs
show no invocation at all for a callback that returned 503, confirm with
read-only evidence that the Live view is attached to the `moonboys-api` Worker
serving `api.cryptomoonboys.com`, that the active version's tag equals the
commit reported by `/deployment-info`, and that the 503 response carries
`X-Moonboys-Auth-Request-Id` (absent means the diagnostic version is not
serving). `npx wrangler tail moonboys-api --format json` from the Worker
directory is an independent real-time check. Raising `head_sampling_rate` to `1`
temporarily is a GK cost decision and is not part of this fix.

Release requirement: a `moonboys-api` Worker deployment only, through the
provenance wrapper after GK approval. No D1 migration, secret, BotFather,
frontend or leaderboard change is needed. Rollback: redeploy the previous
`moonboys-api` version (`wrangler rollback` or the prior provenance-tagged
commit) or set `TELEGRAM_WEBSITE_LOGIN_ENABLED=false`; no data is changed.

Three callback invocations alone do not identify browser navigations, reloads,
retries or duplicate submission. Distinct request IDs identify invocations, not
transactions. After a failed exchange/write the transaction remains consumed;
a reload may fail at cookie validation or transaction consumption. Start a new
login attempt rather than retrying the same callback. To distinguish browser
causes, inspect a browser network trace locally and share only redacted timing,
method, status and request IDs; never share callback URLs or credentials.

This diagnostic change needs a moonboys-api Worker release, no D1 migration,
frontend release or VPS restart. Hold merge and deployment for GK approval.
After approval, use the repository readiness audit and provenance deployment
wrapper from this document. Capture a failed-stage event if login still fails,
then verify real-provider login on desktop/mobile, valid session bootstrap,
return redirect and preservation of the existing account before declaring the
incident resolved. Mocked browser tests do not substitute for that acceptance.
