# Street Swarm Builder Verification Handoff Spec

## Purpose

This document defines the future verification handoff between:

- Crypto Moonboys Telegram identity flow
- GKnifty Heads Incubator
- Street Swarm app runtime builder access

The current app-side implementation is intentionally fail-closed.

Street Swarm runtime/app editing access must never unlock from:

- plain local toggles
- localStorage edits
- AsyncStorage edits
- public verification strings
- client-only claims

Builder access must eventually require a server-issued proof tied to the existing Telegram-linked auth flow.

---

## Current Existing Flow

Current flow already works for Telegram identity linking.

1. User opens Telegram.
2. User interacts with @WIKICOMSBOT.
3. User runs:

- /gkstart
- /gklink

4. Bot returns signed link:

gkniftyheads-incubator.html#telegram_auth=...

5. incubator-link.js parses telegram_auth.
6. Page posts payload to:

/telegram/link/confirm

7. Worker validates Telegram identity.
8. identity-gate.js stores linked Telegram identity.
9. restoreLinkedTelegramAuth can restore linked state later.

This remains the source of truth.

---

## Required New Capability

After successful Telegram link confirmation, the website/auth system must be able to generate a future app-readable builder verification handoff.

This handoff is ONLY for:

- future Open Runtime access
- future app editing/remix access
- future community builder mode

It must NOT:

- unlock rewards
- unlock leaderboard authority
- unlock XP authority
- unlock faction authority
- expose OpenAI keys
- expose backend secrets
- replace Telegram auth truth

---

## Allowed Future Handoff Types

Any of the following are acceptable:

## Option A — Deep Link

Example:

streetswarm://builder-auth?proof=SIGNED_TOKEN

---

## Option B — One-Time Builder Code

Example:

GKBUILD-4F92-XX11

Entered manually into app.

---

## Option C — QR Verification

Incubator generates QR containing signed builder proof.

Desktop/mobile app scans it.

---

## Option D — Local Signed Export

Website exports temporary signed verification payload.

App imports it locally.

---

## Required Security Rules

Future proof/token MUST:

- be server-issued
- be signed
- expire
- be revocable
- be tied to linked Telegram identity
- not expose reward authority
- not expose XP authority
- not expose backend admin authority
- not expose secrets

The app must validate the proof.

The app must stay fail-closed if validation fails.

---

## Important Doctrine

Street Swarm Open Runtime access is NOT:

- an admin system
- a rewards system
- a backend authority system

It is:

- a runtime builder/edit/remix gate
- a community creator gate
- a moddable shell gate

Telegram identity remains the root identity layer.

---

## Current Status

Current implementation status:

- App-side gate foundation exists.
- App-side storage remains fail-closed.
- No unlock path exists yet.
- No signed proof exists yet.
- No deep-link builder verifier exists yet.
- No backend reward authority is exposed.

This is intentional.

---

## Future PR Scope

Future implementation PR should:

1. Generate signed builder verification proof after successful /telegram/link/confirm.
2. Expose safe handoff flow.
3. Add app-side verifier.
4. Keep runtime builder unlock isolated from rewards/backend authority.
5. Add expiry/revocation logic.
6. Add verification tests.
7. Add replay protection.

---

## Non-Goals

This system must NOT:

- implement Open Runtime yet
- implement app editing yet
- implement plugin execution yet
- implement rewards sync changes
- implement Telegram XP authority changes
- implement backend admin systems

This PR only documents the required future handoff architecture.
