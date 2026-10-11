# MoonPet release verification — 11 October 2026

Intended website release: `bfa8997d0942ca1101aab26b7b7c19a29c3999ca`.
Fresh runtime checks completed at `2026-10-11T19:50:56.234Z`.
[Sanitised evidence](../deployments/evidence/moonpet-release-2026-10-11.json) is retained with this report.

## Result

The deployed frontend, Worker source and bot launcher match the intended release.
**Full release confirmation remains blocked on production D1 migration evidence.**
Cloudflare rejected the read-only migration query with error `7403`: the configured
account is invalid or is not authorised to access that service. This does not
prove any migration is missing, and no migration was applied by this audit.

| Surface | Confirmed result |
| --- | --- |
| MoonPet page, CSS, supporting scripts and public How to Play | Eleven resources match their committed bytes exactly. |
| Telegram games launcher | HTTP 200; normalising only Cloudflare Rocket Loader's script marker and loader injection produces the exact committed HTML hash. Its MoonPet URL is correct. |
| API Worker, workers.dev and first-party API host | Both expose commit `18a0d9f009e6d7a38643407b992a0dfda3b27491`, deployed `2026-10-11T18:02:04.071Z`, production. Both health checks return `ok:true`. Worker subtree, shared provenance and build manifests match current main. |
| Leaderboard Worker | Commit `a4a500f3fc38d03158bfce4b9be9a7e1517e0c5b`; current runtime and build manifests match. |
| Anti-cheat Worker | Commit `2323ef3a07794411ff4d5788a02ff63995226cba`; Worker and shared source match. Root build/dependency manifests have subsequently changed; this Worker imports only local source. Compiled-bundle identity is not claimed. |
| Actual WIKICOMSBOT menu | Read with Telegram getMe/getChatMenuButton for the dedicated canary chat. Menu matches `/games/telegram/?v=20260903-games-shell-v8`. No Telegram message was sent. |
| Production D1 | **Unverified**: authorised access is needed to confirm the 52 existing required migration records. |

Current asset versions: CSS, Mini App and guide `20261011-ui-v1`;
Play Options `20261011-bounty-v1`. The bot and live launcher agree on
`/moonpet-game.html?v=20261011-rewards-v1`. These page and asset tokens have
different purposes and do not need identical values.

## Supporting release checks

- [All five main CI domains passed](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/actions/runs/38167946242).
- [Pages deployment passed](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/actions/runs/38167946228).
- [Live Site Verify passed](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/actions/runs/38168050986): 301 checks, zero failures/warnings.
- [Signed production health probes passed](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/actions/runs/38163869572) at 18:28 UTC against the deployed API commit: saved state, private and public leaderboards.
- [Fresh release evidence](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/actions/runs/38169678987) is intentionally unsuccessful overall because the D1 check is unverified. Its frontend, provenance and launcher results are confirmed.

The retained production manifest and Worker evidence request still describe
August observations. Use this fresh evidence for this release; the audit does
not replace unavailable database evidence with historical claims.

## Remaining read-only check

From an authenticated local checkout of current main, run:

```sh
npx wrangler d1 migrations list wikicoms --remote --config workers/moonboys-api/wrangler.toml
```

Retain the result. If any required migrations are listed as unapplied, investigate
before applying them; several historical migrations require their own preflight.
Alternatively correct the repository Cloudflare credentials and run the existing
D1 Production Migration Verify workflow, whose remote job checks the exact
52-record contract and the identity-authority view.

No additional Worker deployment or bot restart is indicated by source/launcher
checks. The audit made no production code, database, bot-menu or deployment changes.
Genuine Telegram gameplay QA across devices is separate from these release checks.

