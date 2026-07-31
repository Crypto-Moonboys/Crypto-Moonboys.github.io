# Production Deployment Truth

This document separates three different states that must not be confused:

1. **Committed** — code exists on the repository default branch.
2. **Deployable** — configuration and required bindings pass repository readiness checks.
3. **Verified live** — production evidence proves which commit or migration is currently deployed.

`workers/DEPLOY_STATUS.json` answers whether a Worker is safe to deploy. It does not prove that the Worker was deployed.

`deployments/production.json` is the production evidence record. A service remains `unverified` or `verification-pending` until evidence is added.

## Required evidence for a verified deployment

A Pages or Worker entry may use `verified-live` only when it contains:

- the exact 40-character deployed Git commit;
- a UTC deployment timestamp;
- at least one production verification URL;
- at least one evidence record containing a type, URL and UTC recording timestamp.

Acceptable evidence URLs include:

- a successful GitHub Actions deployment run;
- a retained deployment receipt or release record;
- a repository issue or PR comment containing captured deployment output;
- another durable, access-controlled record that identifies the deployed revision.

Do not store tokens, secret values, private keys, cookies or raw authentication output in the manifest or evidence record.

## Worker deployment provenance

The tracked production Workers expose `/deployment-info` only after their provenance wrapper has been deployed:

- `moonboys-api`
- `moonboys-leaderboard`
- `moonboys-anti-cheat`

The endpoint derives its commit and deployment timestamp from Cloudflare Worker version metadata. Production deploys must use:

```bash
node scripts/deploy-worker-with-provenance.mjs moonboys-api
node scripts/deploy-worker-with-provenance.mjs leaderboard
node scripts/deploy-worker-with-provenance.mjs anti-cheat
```

A plain `wrangler deploy` is not an approved production command because it can create an untagged version that cannot prove its repository commit.

After deploying all three Workers, run the **Live Worker Provenance Verify** workflow with the intended full commit SHA. Its successful workflow-run URL is durable evidence for the production manifest.

See `docs/worker-deployment-provenance.md` for the endpoint contract and deployment procedure.

## Required evidence for D1 migrations

A D1 database may use `verified-live` only when:

- every required migration is listed in `verified_migrations`;
- `verified_at` records the UTC verification time;
- evidence links to retained migration inspection output.

A migration file being committed is not evidence that it was applied remotely.

For `wikicoms`, migrations 038 and 039 remain `unverified` until production evidence is recorded.

## Updating the manifest after a deployment

1. Deploy or inspect the production system using the approved Cloudflare or GitHub deployment process.
2. Record the deployed commit and UTC timestamp.
3. Run the relevant production endpoint checks.
4. Preserve a durable evidence URL without including secrets.
5. Update `deployments/production.json`.
6. Run:

```bash
node scripts/production-deployment-truth-audit.test.mjs
node scripts/production-deployment-truth-audit.mjs
```

7. Submit the evidence update through a reviewed pull request.

## Current truth at creation

The manifest intentionally does not guess:

- GitHub Pages remains `verification-pending` until deployment evidence is recorded.
- `moonboys-api`, `anti-cheat` and `leaderboard` are deployable but their currently deployed commits are unverified.
- Adding provenance endpoints does not make them live; each Worker must be redeployed through the tagged wrapper.
- Block Topia auxiliary Workers remain blocked or require binding confirmation.
- D1 migrations 038 and 039 are committed but their production application is unverified.

The audit passes with explicit unverified states. It fails unsupported claims of a verified deployment.
