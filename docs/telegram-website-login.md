# Telegram website authentication: architecture and migration audit

Status: implemented on a review branch; production login remains disabled. No
production migration, Worker deployment or merge is authorized by this PR.

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
transient re-bootstrap failures retain it for another attempt. Protected actions renew expired
five-minute access proof before deciding whether account activation is absent;
confirmed session expiry or revocation still clears website identity.
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
before database verification, including bare or whitespace-padded tokens, JSON
strings and the supported JSON/base64 evidence envelopes. Duplicate query keys
are checked on both GET and POST requests. Legacy signed GET status requests
remain compatible;
the current browser sends both credential types in POST bodies. No new website
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
encoded website proof, bare/padded tokens, quoted/nested token strings and duplicate
URL query keys on GET/POST, while preserving legacy GET compatibility.

`telegram-website-session-client.test.mjs` covers memory-only credentials,
bootstrap timing, competitive activation, legacy fallback, stale local flags,
renewal after transient errors/hidden-tab expiry, cross-tab cookie replacement,
markerless callback recovery and confirmed logout.
It rejects conflicting legacy identities, retains same-ID website sessions and
prepares logout after a rollback reload without issuing gameplay proof.
`telegram-website-login-browser.test.mjs` follows
the mocked-provider flow through the actual Incubator page in desktop and mobile
Chromium, verifies existing server-backed Arcade XP and confirms logout. It
also follows signed same/different-ID legacy callbacks across reloads, verifies
both accounts' existing XP, logs out during rollback without provider secrets,
and clears identity after cleanup has already deleted the session. It executes
the modifier writer with expired proof against the actual Worker and validates
cross-tab renewal after re-login replaces the shared HttpOnly cookie. The browser
tests require no production credentials and do not contact Telegram. Server tests
cover disabled flags, either missing OIDC secret, origin/CSRF enforcement,
idempotent missing-session logout and rejection of revoked proof by both Workers.
The first two suites run in Worker/API CI; the browser suite runs in Visual CI.
`telegram-progression-auth.test.mjs` executes the actual Arcade modules in Arcade
CI: delayed renewal, safe unsent retries, account changes, modifier ordering,
legacy/guest compatibility, hydration and uncertain-write rejection.
`moonpet-passive-refresh.test.mjs` covers retryable website renewal failures for
reads and actions, recovery on the next attempt without duplicate submission,
confirmed expiry, Mini App/legacy compatibility and cancellation/deadlines.
