# Bountyblok × Crypto Moonboys: Daily Signals, Moonpet, Arcade XP and NFT contests
**Date:** 2026-11-16 · **Status:** AUDIT/DESIGN ONLY; no contest, paid service, wallet authority, D1 migration or production change
**Scope:** Bountyblok WAX contests, distribution, enterprise API; existing Telegram group media; six Daily WTF windows; website daily-loop and Arcade; Moonpet daily and weekly objectives; TAG RUN; NFT prizes and collecting/crafting.

## Executive finding
Use **Bountyblok as the verified external social-contest/recipient engine** and **Crypto Moonboys as the authoritative Telegram-account / existing-gameplay / Arcade-XP ledger**. Keep the existing Cloudflare Images compositor. The desired 1000×1000 JPEG Telegram image output and promotional share buttons are independent follow-up features. Never store every generated PFP permanently; the user explicitly rejected permanent public image storage.

Do not interpret "full Bountyblok organiser access" as proof of a particular unpublished API endpoint, authenticated user-to-wallet mapping, unattended NFT signing or native top-three-by-points contest mode. The public service advertises those building blocks at different levels, but exact account-level integration contracts must be read inside the user's organiser dashboard or from an actual account-authorised API reference. Public URLs have not exposed API schemas or active contest configuration.

## Repository evidence: systems are distinct
| System | Repo source / genuine authority | Reuse / limitation |
|---|---|---|
| **Six Daily WTF signals** | `workers/moonboys-api/shared/daily-wtf-schedule.js` | Every day 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 **UTC**, each 90 minutes. Requirements: accepted arcade run; Chaos path; accepted arcade run; faction/Battle action; game score; Chaos path. The schedule by itself is a **preview**, not evidence a player completed anything. |
| **Telegram timed group notices** | `scripts/telegram-group-event-announcements.test.mjs`; base Worker schedule and `telegram_group_announcement_log` | Existing ten-minute-before-event notices, five-minute checking cron, daily summary, stable announcement keys and durable send receipts. Reuse these deliveries instead of a parallel spam cron. Announcements are not completion receipts and are not NFTs. |
| **Daily-loop website API** | `workers/moonboys-api/routes/daily-loop-state.js`, `docs/LIVE_DAILY_LOOP_TRUTH_MAP.md` | `GET /daily-loop/state` public, `POST /daily-loop/state` signed Telegram-linked. Distinguishes `live`, `live_empty`, `preview`, `migration_pending`, `query_failed`, `unavailable`. Bountyblok tasks must never mark a preview as completed. |
| **Moonpet daily seven-mission checklist** | `docs/moonpet-mission-status-2026-10-11.md`, `docs/moonpet-source-of-truth.md`, `workers/moonboys-api/player-action-plan/sources.js` | Separate completed vs 7/7 bonus claimed status. A separate Pet Daily Journey tracks genuine Marks; Weekly Journey tracks Crests. Use trusted saved per-pet/owner receipts rather than a web UI click. Do not add Pet XP, Marks, Crests or evolution progress for external shares. |
| **Moonpet needs notifications** | `docs/telegram-moonboy-media-final.md`, `workers/moonboys-api/telegram/moonboy-message-gateway.js` | `pet-notification` is an existing media class with durable uncertainty guards; pet-needs alerts are NOT Daily WTF and should not become contest eligibility/payout proof. |
| **Faction daily missions** | `docs/player-action-plan-pr1-source-audit-2026-10-17.md`, `workers/moonboys-api/player-action-plan/sources.js` | Some faction daily/seasonal progress is a **client mirror** and not accepted server proof. Add a source-authority adapter only where server-side receipt verifies actual completion. |
| **Arcade XP** | `docs/arcade-xp-sync-path.md`, `workers/moonboys-api/pets/entry-requirement.js`, `workers/moonboys-api/migrations/063_arcade_xp_spendable_wallet.sql` | Moonpet's first-pet 1000-XP requirement reads `arcade_progression_state.arcade_xp_total` (lifetime). Separate `arcade_xp_wallets` tracks earned/spendable/spent. Generic `telegram_users.xp`/Community XP is NOT a substitute; do not fake `arcade_progression_events` game runs. Design a dedicated authorised external-task earning route with atomic ledger, caps, current XP source-of-truth and account-consistent spendable accounting. |
| **TAG RUN** | `docs/tag-run-engagement.md`, `docs/tag-run-wax-community-rewards.md` | Street Cred, /rain wallet registration and WAX token draws are separate. Text /rain registration can be PENDING without signed custody proof; do not pay a WAX NFT to an arbitrary self-asserted Telegram↔wallet link. No cross-credit into Street Cred/token pot by default. |
| **Telegram Moonboy image gateway** | `workers/moonboys-api/telegram/moonboy-portrait.js`, `moonboy-photo-transport.js`, `moonboy-media-cache.js`, `workers/moonboys-api/wrangler.toml` | Current 1000px static builder inputs are composited and transformed to **640px** output; JPEG ≤500,000 bytes; upload filename is `moonboy.jpg`; 30-day best-effort Workers Cache and cached Telegram file_id. Production config includes Images binding and group mode. Achieving **1000px output** requires changing composer, transport validation, cache version and tests; Telegram may internally rescale displayed previews. Telegram photo `filename` is not SEO text or an assured visible attachment name. |

### Current six schedule slots (UTC)
| Time | Event ID | Verified game task if implemented from source |
|---|---|---|
| 00:00–01:30 | wtf-midnight-signal | accepted Arcade run |
| 04:00–05:30 | wtf-early-chain-wake-up | completed Chaos path |
| 08:00–09:30 | wtf-morning-signal | accepted Arcade run |
| 12:00–13:30 | wtf-midday-rush | accepted faction/Battle action |
| 16:00–17:30 | wtf-evening-burst | accepted game score threshold |
| 20:00–21:30 | wtf-late-chaos | completed Chaos path |

**Do not replace game requirements with social clicks:** external Bountyblok verification adds a *separate* verified social mission. A player may complete both and receive the corresponding independently capped rewards, but one source receipt must not be used twice.

## Bountyblok feature evidence, how to operate and limits

### Contests
Public: https://www.bountyblok.io/contests
Advertised workflow: select chain (WAX), create contest, specify required actions (social following/engagement, community joins, NFT holding and other listed tasks), upload hero image/description/reward, launch hosted landing page, pick a **random** winner/winners at completion. Bountyblok advertises verified social network actions and referrals. **This does not establish that hosted-contest UI natively ranks top three by *points* each day**; that requires a verified task data feed and separate deterministic daily rank close unless account-specific organiser UI demonstrates otherwise.

Suggested organiser operation for initial canary:
1. Sign in to WAX contest creator using existing authorised organiser access (never submit private keys to our Worker).
2. Create **one daily campaign** (or a reusable recurring series if dashboard supports it), labelled with date and UTC close. Choose the official campaign X post containing a public artwork image and site mission link.
3. Choose supported *truly verified* X action and WAX eligibility tasks (confirm whether Repost, Quote, Reply, hashtag and external link visit are available and verifiable in current X integration). Use hosted page and actual generated contest URL.
4. Set optional free-to-enter conditions, wording, date boundaries, entry limits, no misleading "share completed" from merely opening the link. Confirm preview by a normal player account.
5. Export/snapshot or retrieve task completions from a documented authenticated API; match owner and event IDs and settle to D1. If completion export/API is absent, do **not** award server Arcade XP automatically just because a URL was opened.
6. The same day’s six Telegram signals may link to this single hosted campaign and highlight distinct steps, rather than generating six separate near-identical spammy X posts.

### NFT Distribution
Public: https://www.bountyblok.io/distribution-tool
Detailed independent walkthrough: https://academy.anyo.io/course/bountyblok-nft-airdrop-tool/
Supported recipient filters include template/collection/schema ownership, holding quantities, exclude list, "Unique Accounts Only", imported list, social-engagement recipient selection, account count cap and snapshot. Payload can be existing asset IDs or mint-on-demand from a collection-authorised account. A walkthrough explicitly requires reviewing recipient and transaction batches and **signing wallet transactions**; RAM/CPU/NET and collection mint authority are relevant. Its "burned template IDs" filtering is a **historical criterion**, NOT proof of an atomic burn-to-rare mint in the contest UI. Do not interpret the non-custodial drop tool as a permission to run an unattended hot-wallet signer.

### Enterprise API / Bountyblok Gamification
Public: https://www.bountyblok.io/enterprise-web3-api
Additional historical Bountyblok Zapier integration description: https://bountyblok.medium.com/bountyblok-adds-zapier-integration-to-expand-gamification-7cfd77fe0857
The provider advertises custom Web3 APIs, task tracking, XP/achievements and integrations. Public content does **not** publish the current endpoint schema, access tokens, payout signing rules or webhook authenticity method. An older Bountyblok Telegram bot article (2019) described group activity tracking, but must not be assumed to work today; do not add a second bot into the live TAG RUN group without checking it cannot duplicate or disrupt reward flows.

**Account-only details to verify before implementing:** exact WAX contest ID and public URL shape; dashboard supported X actions as of November 2026; actual verified completion export/API/webhook fields; signed authentication and rate limits; WAX account attached to contest participant; delete/undo events and replay handling; daily ranking/weighted winner modes; whether NFT drop runs can be remotely submitted and authorised without an interactive signature; credits/quotas; documented organizer role. Do not guess endpoint paths.

## Integration design (proposed, not deployed)

### A. Publish/campaign mapping
- One `contest_campaign` per UTC date (or contest ID + task ID per signal if API supports recurring windows), linked to `daily_wtf_events` IDs and Telegram message logical keys. Store official `contest_url`, `canonical_x_post_url`, status, start/end, artwork logical seed and campaign title. This maps **posts to already-existing web missions**.
- Group post buttons: `PLAY MISSION` (website app, existing auth), `VERIFIED X TASK` (actual hosted Bountyblok contest), optional `SHARE ON X` (X intent opens composer only), and `RESULTS` (trusted leaderboard). Never replace existing Telegram links/captions/topics.
- One generated Moonboy artwork per existing send path; group messages can use the same relevant Bountyblok campaign without storing every unique PFP permanently. A normal X intent cannot automatically attach a Telegram-hosted JPEG to a new X post. The best **verifiable** first action is engagement with the **canonical official X post carrying campaign artwork**, not an unverified share of a private Telegram image.

### B. Participant ↔ identity link
- Existing Telegram signed auth identifies site/Moonpet/Arcade owner. Bountyblok contest may verify a connected WAX wallet independently. **These are two identities**. A self-entered /rain wallet address is not sufficient proof of custody or membership.
- Use an audited account-link handshake with owner proof on both sides using the Bountyblok API's actual supported authenticated identifier. Never match wallets to Telegram owners from plaintext hints, usernames or self-declared X handles. Reject conflicts and shared-wallet multi-account farming.
- No wallet signing for *Arcade XP* settlement; users can enter free tasks under existing game identity when proof can be mapped. Any burn or on-chain NFT transfer naturally requires permission/signature from the relevant WAX owner/issuer as applicable. Do not ask for secret keys.

### C. Verified social completion → game XP
- Ingest only Bountyblok's confirmed completed action (not landing-page views, button opens, unsigned callbacks or schedule previews).
- Define immutable idempotency key `provider:bountyblok:contest_id:action_id:provider_participant_id`; verify provider signature or fetch authoritative state server-to-server. Save raw provider reference, status, time, verified WAX owner and linked Telegram ID, source run/mission, UTC day, award amount, payout state and revocation/audit metadata.
- Add a **dedicated** `social_contest_xp` award type and daily cap. The existing Arcade XP lifetime and spendable wallet must be updated through approved server-side accounting, not by forged game score submissions or naive `telegram_users.xp` writes. Review whether social-earned XP should count toward the 1,000 first Moonpet entry gate; by default counting it changes game progression and is a policy choice.
- Distinct rewards: existing game mission completion preserves its normal Game/Arcade/Pet rewards; an independently Bountyblok-verified social task earns **one** additional promotional Arcade XP award (value/cap requires approval). Neither a Tweet impression nor an image download earns gameplay XP. Avoid writing Street Cred, weekly lottery tickets or WAX tokens in this adapter.
- Account-level unique constraints, UTC-day cap, source-event timestamp, predictable tie-breaking, duplicate claims, revoked events, provider outage, retry/recovery and two accounts using the same WAX/X identity must be tested before production.
- Avoid incentives for high-volume repetitive X posting. X promotion guidance warns against repeated identical/near-identical posts and multiple accounts: https://help.x.com/en/rules-and-policies/x-contest-rules . Reward distinct verified actions with bounded frequency; not repetitive mass posting.

### D. Daily top three NFTs
- Close **daily rank** at UTC midnight from accepted, unique, verified completion receipts in our D1; snapshot immutable final ranks. Separately classify optional Bountyblok random draw so it is **not** misrepresented as the points top 3.
- Top 3 default: 1 qualifying NFT reward each (gold/silver/bronze template IDs to be approved). Deterministic order on verified contest points, then qualified task count, then first accepted completion timestamp and stable owner ID. Enforce one top-three prize per real linked entrant per day.
- Create **draft distribution** with exactly 3 approved recipient wallets and template IDs; check assets/reserves, funding/RAM and wallet custody evidence. Bountyblok Distribution Tool can import recipient list and distribute/mint, but public evidence still shows a signer approval. Do not claim fully automatic final transfers absent verified signer-specific API and owner approval.
- Persist actual on-chain TX ID, template, asset ID, recipient, terminal status and error/uncertainty. Do not display "NFT SENT" merely because a draft or signing page opened.
- Daily contest NFTs potentially have market value. Publish clear free-entry and age/region eligibility, ranking/ties, fraud appeals, asset availability, deadlines and promotion terms. Protect existing community-pot WAX signer; no shared authority.

### E. Collect 3–4 NFTs, burn, earn rare
- Bountyblok holding/completed-set filtering is an excellent **gating or bulk targeting** tool. Real **burn-to-mint** requires an on-chain recipe, not merely checking possession.
- AtomicAssets has `burnasset`/`mintasset`; for a supported ready-made UX, investigate an audited WAX **blend** contract/creator platform such as `blend.nefty`. Inputs must be distinct owned eligible asset IDs and a known collection/template, consented wallet-signed burn, durable transaction and resulting official Rare/Epic. No fake burning, no server escrow of users' keys, no cross-wallet ingredients unless a separately reviewed contract explicitly permits.
- Example proposals only (not created): 4 Common → 1 Rare; 3 Rare → 1 Epic; 4 Epic → 1 Legendary. Confirm supply cap, art, mint authority, any RAM fees and collection admin permission first.
- Sources: https://docs.wax.io/build/tutorials/howto_atomicassets/mint_nft and https://neftyfusion.mintyblocks.com/nft-blending-wax . Third-party blend UIs/contracts require their own security and fee review.

### F. 1000px Telegram artwork and "long filename"
- Existing `moonboy-portrait.js` encodes at 640. Proposed 1000px output needs actual Cloudflare codec tests, Telegram file validation updates, cache namespace invalidation, transport quality/byte-limit regression and image comparisons; do **not** assume a large 1000px JPEG always fits 500 KB.
- Sending a photo via Telegram's `sendPhoto` makes it a Telegram photo; the multipart filename generally is **not** a user-facing name or SEO text. Put the meaningful long promotional title **in the caption and X message**, and use `sendDocument` only as a separate option if an explicit named downloadable file is required (different Telegram UX). Deterministic logical IDs are preferable to a global sequential JPEG filename for retries; a durable display number can be allotted once per accepted logical post if needed.
- User requested no permanent generated-PFP store. Preserve that. A generic X intent cannot upload the Telegram photo; share text+canonical public campaign X link, or let a user manually attach/copy their photo. Do not promise X previews for a unique Telegram-only image when no public durable image URL exists.

## Phased implementation / safe PR boundaries
1. **Audit-only PR (this document):** no source code or live data changes. Confirm provider capabilities and score/economy policy with organiser dashboard; collect actual redacted API schemas/screenshots and controlled contest URL.
2. **PR1: source contract, ledger + identity tests** (no payout enabled). Define D1 migration, provider authenticity, single owner ↔ wallet mapping, contest-task registry and idempotent settlement; no prod migration until rehearsed/approved.
3. **PR2: group UI & 1000px artwork** behind OFF-by-default per-message-class flags; preserve full original captions, topics, source artwork and Telegram uncertainty dedupe. Add verified hosted-campaign button; no fake "shared" status.
4. **PR3: Bountyblok verified completion read adapter** from real supported API or safe manual export, record dry-run rows; audit spoof/replay, pagination, user linking, rollback, source test fixtures.
5. **PR4: Arcade XP settlement** using correct authoritative lifetime/spendable stores and explicit approved values/caps; test Moonpet 1,000-XP entry interaction, races and each separate XP economy.
6. **PR5: leaderboard + Top 3 NFT draft/distribution** only with collection/template IDs, verified eligible WAX recipient wallet, signer authority and live transaction receipts; no per-tip WAX signer access.
7. **PR6: optional holder campaigns + on-chain crafting** after AtomicAssets collection/approved blend contract, test actual burn+mint with owner consent.
8. **Canary and rollout:** single organiser-created test contest, one actual linked Telegram account + verified WAX identity, one genuinely verified action, exactly one Arcade XP receipt, then a second entrant, then 24-hour UTC rollover, then a deliberately duplicated claim. Only after proof consider top-three NFT trial with explicit signer approval.

## Explicit unresolved dependencies and acceptance gates
- Account-specific Bountyblok organizer UI and API schema: not accessible unauthenticated from the public webpages; no API endpoint name or request JSON assumed.
- WAX-to-Telegram proof strategy compliant with user's no extra wallet-signature preference, or account-specific provider-supported identity assertion. No silent claim from /rain text alone.
- Actual source of Arcade XP awarding that atomically updates lifetime and any spendable wallet for social rewards; pet entry rules and reward budget policy.
- User-approved social XP per verified action, action counts/cap, season score vs Arcade XP and NFT supply/template IDs.
- Explicit X post action verification capabilities; no paid XP from unverified share taps.
- NFT distribution signer automation limits and failure behavior; do not assume dashboard manual signing can be bypassed.
- Third-party burn/upgrade contract audit, collection authorisations, user signatures and non-refundable fees.
- Security, cost, legality and full regression for production; no deployment by docs-only PR.

**This audit does not establish a live Bountyblok contest, configured contest-to-Arcade XP bridge, wallet signature authority or any transferred NFT.**
