# Crypto Nodes Wiki Operations Standard v1

## Authority

`data/nodes/nodes-master.v1.json.gz` is the v1 canonical catalogue snapshot. Git history is the editorial audit trail. D1 is a runtime/search index and must never become the sole editorial source of technical claims.

## Data classes

- Static curated: identity, node type, process, hardware, reward model, official sources, lifecycle status.
- Dynamic automated: price, market cap, 24h USD volume and largest tracked spot market.
- Derived operational: URL health, source fingerprints, review queue and freshness state.

## Source standard

1. Tier 1: official website, official docs, official repository, official technical paper/whitepaper, official roadmap/foundation.
2. Tier 2: market-data provider, major exchange docs, reputable research, major mining-pool docs.
3. Tier 3: community posts/directories are discovery sources only and cannot independently verify technical claims.

Technical claims use Tier 1 whenever available. A URL check proves reachability only; it does not prove the claim is current. Source metadata changes create review work and never silently rewrite canonical technical text.

## Verification states

- `active`: manually verified against authoritative sources.
- `needs_review`: seeded/discovered but not yet field-verified.
- `review_due`: previously verified but beyond review cadence.
- `source_changed`: source metadata changed and requires manual review.
- `inactive`, `deprecated`, `historical`, `unknown`: lifecycle states retained rather than deleted.

## Cadence

- Major active networks: manual technical review every 30 days.
- Other active systems: every 90 days.
- Historical/deprecated systems: every 365 days unless a change is detected.
- Market snapshot target: 15 minutes.
- Largest tracked spot market: 12 hours.
- URL/source health: spread continuously across the existing Worker schedule using bounded batches.

## Research expansion batches

New systems enter as `needs_review`; they do not become `active` because a directory or market API lists them.

1. Major PoW and merge-mined networks.
2. PoS L1/L0 validators and block producers.
3. Cosmos SDK/IBC validator networks.
4. Substrate/Polkadot ecosystem node roles.
5. Storage, compute and cloud providers.
6. DePIN wireless, sensor, bandwidth and mapping systems.
7. AI, GPU and rendering workers/subnets.
8. RPC, indexing, oracle, relay, bridge and keeper infrastructure.
9. Mining pools, management platforms, miners, firmware and hardware.
10. Historical, migrated, rebranded and deprecated systems.
11. Bittensor subnets and other subnet-style operator networks.
12. Restaking/AVS/prover networks.

Each research batch must record: canonical ID, official name/ticker if any, authoritative sources, operator role, actual hardware/capital prerequisites, reward/no-reward distinction, process summary, lifecycle state, explicit market-provider ID where applicable, and verification date.

## Quality gate

A record may move from `needs_review` to `active` only after:

- official website or official repository identified;
- node/operator documentation verified where available;
- reward/no-direct-reward statement verified;
- hardware/operator prerequisites checked;
- whitepaper/technical paper and roadmap linked only when an official canonical source exists;
- token mapping uses an explicit provider ID, never ticker-only inference;
- process summary matches the current network architecture.

## Import and generation

Validate catalogue without writing D1:

```bash
node scripts/nodes-import-to-d1.mjs
```

Generate SQL only:

```bash
node scripts/nodes-import-to-d1.mjs --out /tmp/nodes.sql
```

Import local D1:

```bash
node scripts/nodes-import-to-d1.mjs --local
```

Production import is deliberately guarded:

```bash
node scripts/nodes-import-to-d1.mjs --remote --yes
```

Generate individual wiki routes:

```bash
node scripts/generate-node-wiki-pages.mjs
```

## Runtime API

- `GET /api/nodes`
- `GET /api/nodes/:id`
- `GET /api/nodes/meta`
- `GET /api/nodes/verification`

Directory: `/wiki/nodes.html`

Read-only verification dashboard: `/wiki/nodes-admin.html` (noindex). It is a health view, not an authorization boundary.

## Scalability rule

Project 401 and project 4,001 are data additions. New categories/roles extend the locked taxonomy intentionally; they must not require a new page architecture, new table family or bespoke frontend card.
