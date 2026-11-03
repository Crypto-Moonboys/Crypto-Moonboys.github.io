# TAG RUN V2 PR10 — Owner-approved real WAX transfers through Anchor

**Release status: CODE ONLY.** PR10 adds an owner-operated real signing and
broadcasting path. It does NOT apply migration 105, select token assets,
approve donations, enable funded draws, or send funds on its own.

## What the release runner actually does

- Runs locally on the owner's Windows computer, never in the public Worker,
  Telegram bot, a cron job or GitHub Actions.
- Reads deployed Cloudflare Worker settings and the real D1 ledger using
  a short-lived, privately held Cloudflare API token.
- Requires ALL production payout release flags to already be enabled by a
  separate, explicitly authorized release decision.
- Uses the verified cap, approved asset, confirmed donation, frozen snapshot,
  reviewed draw, immutable bundle, registered member destination and exact
  per-transfer spending ceiling enforced by the existing payout executor.
- Uses Anchor Link console transport to request a REAL WAX mainnet
  transaction from isthatajoint@tagrain, with exactly one transfer action.
  The owner personally approves in Anchor. No private WAX key is used in
  code, uploaded to Cloudflare or stored in GitHub.
- Writes broadcast_unknown BEFORE requesting an Anchor signature, so a
  timeout, rejection or uncertain submission is never automatically retried.
- Separately reconciles a matching irreversible WAX transfer from two
  independent Hyperion indexers and an authoritative last irreversible block.
  Submission success or a transaction ID is NOT proof of payment.
- Member registration through /rain remains sufficient as a receiving
  destination; recipients do not have to sign a message to RECEIVE tokens.

**This is human-approved one payment at a time, not automated daily signing.**

## Hard prerequisites before any live transfer

1. Apply migration 105 to remote D1 ONLY after explicit owner approval and
   a fresh tested private backup. Verify exactly which migration is pending;
   never blindly execute all migrations.
2. Cryptographically verify project custody of the isthatajoint WAX account.
3. Create a dedicated tagrain custom authority and link the transfer action
   for each separately approved token contract. Ensure a protected,
   owner-controlled signing key exists in Anchor. Never expose owner or active
   private keys. WAX linkauth does NOT limit recipient or quantity.
4. Complete legal review of random token awards and payment/donation policy.
   Verify the real donor's intent, token allowlist, actual contract/precision,
   finality, historical snapshot and protected receiver identity.
5. Obtain two-person funding/draw approval, establish exact 5% daily cap
   and an operator-chosen immutable per-transaction maximum.
6. Before any live owner action, independently authorize and enable all
   required Worker flags: TAG_RUN_ENABLED=true,
   TAG_RUN_WEEKLY_REWARDS_ENABLED=false,
   TAG_RUN_V2_OBSERVATION_ENABLED=false,
   TAG_RUN_V2_POOL_ENABLED=true,
   TAG_RUN_V2_DRAWS_ENABLED=true,
   TAG_RUN_V2_PAYOUTS_ENABLED=true,
   TAG_RUN_V2_EXECUTOR_RELEASE_APPROVED=true,
   TAG_RUN_V2_TIP_ACCOUNT=isthatajoint.
7. First real payout requires its own explicit small amount and destination
   approval, then irreversible proof and ledger inspection before expansion.

**Production remains observation-only / payouts OFF at PR merge time.**
Do not enable flags just to make these commands run.

## Windows PowerShell operator runbook

In the repository root, with Node >=22.13 and an owner-controlled terminal:

```powershell
Set-Location "D:\GITHUB\Crypto-Moonboys.github.io"
node --version
$env:CLOUDFLARE_API_TOKEN = "<private scoped Cloudflare token>"
$env:CLOUDFLARE_ACCOUNT_ID = "<your Cloudflare account ID>"
$env:TAG_RUN_OPERATOR_GROUP_ID = "<exact existing Telegram group chat ID>"
```

Keep tokens and account credentials out of GitHub, ChatGPT, screenshots
and group posts. Scope the Cloudflare token to Worker settings READ and
the production D1 database read/write, with a short expiry; revoke after use.

Install the local-only Anchor console transport, without saving dependencies
to the repository manifests:

```powershell
npm install --no-save --package-lock=false anchor-link anchor-link-console-transport
```

The operator runner does not import Anchor until the owner explicitly
authorizes a SEND. These commands are LIVE when funding and release gates
are fulfilled. Each write requires --live and a separate exact typed phrase.

```powershell
# Read frozen intent and action (read-only, even with payouts OFF)
node scripts/tag-run-v2-owner-payout.mjs status --intent <64-hex-intent-key>

# Create a paused cap from verified funding, not observed balances
node scripts/tag-run-v2-owner-payout.mjs create-cap --live --day <YYYY-MM-DD> --contract <contract> --symbol <SYMBOL> --precision <0-8> --max-units <approved-base-units> --approved-by <reviewer-reference>

# Manually open ONLY a separately reviewed cap
node scripts/tag-run-v2-owner-payout.mjs open-cap --live --day <YYYY-MM-DD> --contract <contract> --symbol <SYMBOL> --precision <0-8>

# Reserve one pre-reviewed, frozen member allocation
node scripts/tag-run-v2-owner-payout.mjs reserve --live --day <YYYY-MM-DD> --contract <contract> --symbol <SYMBOL> --precision <0-8> --bundle <bundle-index> --member <telegram-id> --recipient <registered-wax-account> --units <approved-base-units> --auth-digest <real-64-hex-approval-digest> --approved-by <reviewer-reference>

# Owner types exact approval and then signs one transfer in Anchor
node scripts/tag-run-v2-owner-payout.mjs send --live --intent <64-hex-intent-key>

# Only when the original transfer has irreversible chain evidence
node scripts/tag-run-v2-owner-payout.mjs reconcile --live --intent <intent-key> --tx <64-hex-transaction-id> --sequence <global-action-sequence>
```

The owner must not invent authorization digests, fabricate donation proofs,
change token contracts or approve lottery payments before the independent
legal and custody reviews.

**STOP on broadcast_unknown:** if Anchor errors or is cancelled after the
atomic send lock, do not click again or re-run SEND. Reconcile the original
transaction; if it did not broadcast, use a separately reviewed exception
policy. A WAX tx ID returned from Anchor is not a final settlement record.

## Test commands

```powershell
node --test scripts/tag-run-v2-owner-payout.test.mjs
node --test scripts/tag-run-v2-payout-executor-pr9.test.mjs
node scripts/verify-d1-production-migrations.test.mjs
npm run ci:worker-api
echo $LASTEXITCODE
```

Tests fake signer and Cloudflare responses; only an explicitly authorized,
small real WAX transfer validates custody, chain finality and receipts.
No automated or protected headless signer is installed. A future automated
service would require a separately secured signing authority, never
a public Worker private key.

Official WAX / Anchor references:
- https://greymass.github.io/anchor-link/classes/Link.html
- https://greymass.github.io/anchor-link/interfaces/TransactOptions.html
- https://docs.wax.io/operate/wax-infrastructure/wax-account-custom-permissions
