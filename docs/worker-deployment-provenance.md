# Worker Deployment Provenance

The production Worker evidence system uses Cloudflare version metadata rather than hand-maintained source constants.

## Public endpoint

The following production Workers expose `GET /deployment-info` after this change is deployed:

- `moonboys-api`
- `moonboys-leaderboard`
- `moonboys-anti-cheat`

A verified response contains only:

```json
{
  "service": "moonboys-api",
  "commit": "<40-character repository commit>",
  "deployed_at": "<UTC Cloudflare version creation time>",
  "environment": "production"
}
```

The endpoint does not expose Cloudflare version IDs, account identifiers, bindings, database identifiers, secrets, tokens, user data or runtime configuration.

If the deployed Worker version does not have a valid 40-character commit tag or valid version timestamp, the endpoint returns HTTP 503 with `commit` or `deployed_at` set to `null`. It must not invent provenance.

## Approved deployment command

Production deployments for the three tracked Workers must run from the repository root through:

```bash
node scripts/deploy-worker-with-provenance.mjs moonboys-api
node scripts/deploy-worker-with-provenance.mjs leaderboard
node scripts/deploy-worker-with-provenance.mjs anti-cheat
```

The deploy wrapper requires:

- branch `main`;
- a clean working tree;
- `HEAD` exactly matching `origin/main`;
- a full repository commit SHA.

It invokes Wrangler with the full commit as the Cloudflare Worker version tag. Cloudflare's version metadata binding then exposes that tag and the version creation timestamp to `/deployment-info`.

Before deploying, update the checkout explicitly:

```bash
git fetch origin main
git switch main
git pull --ff-only origin main
```

Do not bypass the wrapper with a plain `wrangler deploy`, because an untagged version cannot provide repository-backed deployment provenance.

## Production evidence update

Adding the endpoint does not prove that it is live. After each real deployment:

1. Call the Worker's `/deployment-info` endpoint.
2. Confirm the returned commit exists in this repository and matches the intended deployment.
3. Retain the deployment output or release evidence at a durable URL.
4. Update `deployments/production.json` with the commit, UTC deployment time, verification URL and evidence.
5. Run the production deployment truth audit.
6. Submit the evidence update through a reviewed pull request.
