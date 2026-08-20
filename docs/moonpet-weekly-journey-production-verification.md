# Moonpet Weekly Journey Production Verification

Manual post-merge checklist for PR #1239-style Weekly Journey deploys. This is production verification only; do not run it from normal CI.

## Preconditions

- The PR is merged into `main`.
- The Worker change is ready to deploy through the provenance wrapper.
- No gameplay expansion, D1 migration, token/NFT logic, breeding, genetics, sanctuary, fusion, prestige, Arena expansion, Kaiju expansion, or unrelated static-site change is part of the verification pass.

## Checklist

1. Pull `main`.

```bash
git checkout main
git pull origin main
```

2. Confirm a clean tree.

```bash
git status --short
```

3. Deploy the Worker with the provenance wrapper.

```bash
node scripts/deploy-worker-with-provenance.mjs moonboys-api
```

4. Verify health.

```bash
curl --ssl-no-revoke https://moonboys-api.sercullen.workers.dev/health
```

Expected:

```json
{"ok":true}
```

5. Verify the deployment-info commit.

```bash
curl --ssl-no-revoke https://moonboys-api.sercullen.workers.dev/deployment-info
```

Confirm the `commit` field is present and matches the merged `main` commit that was deployed.

6. Wait for the GitHub Pages deploy to finish.

7. Curl the static URLs.

```bash
curl --ssl-no-revoke -I https://cryptomoonboys.com/moonpet-game.html
curl --ssl-no-revoke -I "https://cryptomoonboys.com/js/moonpet-mini-app.js?v=20260820-weekly-journey-live-polish"
curl --ssl-no-revoke -I "https://cryptomoonboys.com/css/moonpet-mini-app.css?v=20260820-weekly-journey-live-polish"
```

Each response must be `200`.

8. Run the manual production smoke script.

```bash
node scripts/moonpet-production-smoke.mjs
```

The script fails if Worker health is not `ok`, `/deployment-info` has no full commit SHA, or any Moonpet static URL is not `200`.

9. Open the Mini App.

10. Verify Weekly Journey states:

- Authority syncing does not show fake `0/5` available progress.
- Active-pet-required remains explicit when no active Moonpet exists.
- Live authority can show real `0/5`, partial, and `5/5` progress.
- A complete but unsettled week does not fake an awarded Weekly Crest.
- A settled Weekly Crest does not look claimable again.
- Week reset timing is visible when season timing exists, and week 13 resets at season end.
