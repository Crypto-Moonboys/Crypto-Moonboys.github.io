# TAG RUN V2 — full automatic Community Pot release

This release changes the owner-approved policy from manual Anchor handoff to an
automatic daily WAX payout cycle.

## What becomes automatic

After an admin approves a token identity once with `/poolapprove`, the Worker:

1. captures the completed UTC day's Street Cred participation;
2. scans inbound WAX receipts and quarantines unknown token identities;
3. freezes an independently corroborated irreversible balance snapshot;
4. allocates 1% of each approved token's spendable balance;
5. commits the draw to a future WAX block, reveals it after irreversibility and
   performs the second policy-review identity automatically;
6. reserves each registered winner's exact amount within the D1 daily cap;
7. rechecks the token code hash, ABI hash, destination, snapshot, draw and cap;
8. signs one exact `isthatajoint@active` transfer;
9. stores the signed transaction and ID before broadcasting;
10. retries only that same transaction ID and marks it paid only after two
    history providers and WAX LIB corroborate the exact transfer.

`/poolquarantine` excludes a token immediately. Unknown tokens never enter a
snapshot, draw, reservation or signer.

## One-time production release

Run these commands separately in **Windows Command Prompt** from the repository
root after this PR is merged. Never paste either secret into Telegram, GitHub,
a PR comment or a shell command argument.

### 1. Update local main and back up production D1

```bat
cd /d D:\GITHUB\Crypto-Moonboys.github.io
git switch main
git pull --ff-only origin main
npm ci
npx wrangler d1 export wikicoms --remote --config workers/moonboys-api/wrangler.toml --output tag-run-v2-pre-automation-backup.sql
```

Keep `tag-run-v2-pre-automation-backup.sql` private. It contains production
data and must not be committed.

### 2. Apply migrations 108 and 109

```bat
npx wrangler d1 migrations list wikicoms --remote --config workers/moonboys-api/wrangler.toml
npx wrangler d1 migrations apply wikicoms --remote --config workers/moonboys-api/wrangler.toml
npx wrangler d1 migrations list wikicoms --remote --config workers/moonboys-api/wrangler.toml
```

The final list must say there are no migrations to apply. Migration 109 moves
the durable pool policy to `review_only`, adds contract pins and adds the
crash-safe prepared-transaction fields. It does not contain a private key.

### 3. Add both encrypted Worker secrets

```bat
npx wrangler secret put TAG_RUN_V2_ACTIVE_PRIVATE_KEY --config workers/moonboys-api/wrangler.toml
npx wrangler secret put TAG_RUN_V2_AUTOMATION_SEED_KEY --config workers/moonboys-api/wrangler.toml
```

Wrangler prompts for each value without putting it in command history.

- `TAG_RUN_V2_ACTIVE_PRIVATE_KEY` must be a private key that independently
  matches the live `isthatajoint@active` authority.
- `TAG_RUN_V2_AUTOMATION_SEED_KEY` must be a new random secret of at least
  32 characters and must not be the WAX key.

This is an active-authority hot key. A Worker/account compromise has the full
blast radius of `isthatajoint@active`; the application checks restrict normal
bot execution, but they cannot make a stolen active key scope-limited.

### 4. Build-check and deploy once

```bat
npx wrangler deploy --dry-run --config workers/moonboys-api/wrangler.toml
npx wrangler deploy --config workers/moonboys-api/wrangler.toml
```

The committed production configuration enables the full cycle. The runtime
still refuses every automatic action if either secret, any release flag, D1,
the official Telegram group ID or the exact `isthatajoint` account is missing.

### 5. Reapprove existing eligible tokens once

Migration 109 cannot invent independently observed contract hashes for rows
approved before this release. In the private admin chat, repeat `/poolapprove`
for every token that should remain eligible:

```text
/poolapprove kingsofgraff DUMPIT 8 automation-release-2026-11-12
/poolapprove wuffi WUF 4 automation-release-2026-11-12
/poolapprove kingsofgraff LFGK 4 automation-release-2026-11-12
```

Each successful response must show a pinned contract code hash and ABI hash.
After this one-time pinning, later balances of those token identities are
included automatically. A new token remains quarantined until the admin sends
one `/poolapprove` command.

## Normal operation

No daily approval, tip approval, snapshot command, draw command or Anchor
prompt is required. The only routine admin actions are:

```text
/poolapprove contract SYMBOL precision review-reference
/poolquarantine contract SYMBOL precision reason
```

Quarantining is the emergency token stop. Removing either automation release
flag or the active private-key secret stops new signing. Already submitted
transaction IDs remain reconciliation-only so an uncertain broadcast can never
be replaced with a second payment.
