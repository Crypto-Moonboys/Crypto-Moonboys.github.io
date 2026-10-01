# Moonpet hard audit — 1 October 2026

Audited main commit `0c997b050514d54007bce97009fd83b8cc064f24` against permanent pets, three owned spaces, the Arcade entry gate, deleted practice/nameplate controls and reward-safe confirmed deletion.

## Findings and fixes

| Finding | Fix |
| --- | --- |
| Hidden Breeding, Traits, Lineage, Fusion, Sanctuary and Prestige capability projections | Removed their runtime projections, stubs, recommendations and public roadmap panels. |
| Unreferenced Breeding engine and test-only Prestige mutation | Deleted implementations and their obsolete implementation tests. |
| Removed floating nameplate still sold and equippable through direct actions | Removed its catalog entry and style projection; stale purchases/equips reject without charging. Saved ownership remains historical data. |
| Story chains advertised unused final outcomes, including Prestige | Removed that unused metadata; actual authored scene choices and rewards remain. |
| Bound Daily Completion reward had no claim row yet when deletion ran | Added a transactional source-record blocker and interruption/race regression. Settle the bonus before deleting its source pet. |
| Archived pets could start/retry a finale | Require active instance and active owned space in mutations. Archived saved battles are history without play controls; won reward recovery remains available. |
| Telegram game launcher and Worker launcher used different URL versions | Aligned both with the refreshed Mini App assets. |
| Reset-era progression guidance | Updated lifetime guidance and confirmed deletion instructions. |

## Verified contracts

- New adoption requires **1,000 server-recorded lifetime Arcade XP**, without spending it. Existing owners retain access. Concurrent adoption uses the canonical onboarding receipt.
- At most three new owned spaces; extra spaces cost 500 and 1,000 spendable Arcade XP. Missing paid instances require recovery and cannot trigger another charge.
- Competition scoring follows award time; pet XP, age, Journey evidence and evolution retain their ownership-period authority across quarters.
- No automatic pet replacement, expiry or Sanctuary retirement. Confirmed deletion creates a new egg in the same immutable owned space.
- Deletion preserves reward/event receipts, archived XP and account inventory/wallet balances. Active sessions, pre-claim combat/boss payouts and recoverable rejected settlements remain blockers.
- Signed Telegram Mini App or linked website Telegram authentication remains required for private state and mutations. Public ranking is server-owned. No local XP or supplied identity becomes write authority.
- Core/Missions hydration stays separate; existing query-budget and failed-read tests remain enabled.
- Import traversal from the Worker reaches every remaining pet gameplay module. The two remaining test-only modules are ownership classification and economy reachability audits, used by verification tools.

## Data deliberately retained

Historical SQL migrations, retired schema columns/tables and immutable snapshots remain for production migration verification, safe ownership recovery and reward history. They expose no removed gameplay option. Dated historical reports remain evidence, not current rules. No new migration is required for this cleanup.

## Remaining work and limits

**Year-long evolution pacing is not implemented.** Existing evolution minimum ages are 14, 28, 49, 64 and 78 days, with additional XP, item and achievement gates. The requested one-week egg, three-week second stage and later stages across roughly a year need a separate balance change and migration-safe plan.

The read-only production probe confirmed the deployed Worker commit matched audited main, but failed the launch-URL parity check. The branch fixes that mismatch; it is not deployed. Private production pet state was not inspected or modified. Local Chromium was unavailable; mobile/browser validation runs in GitHub CI before release.

## Validation

Focused SQLite regressions exercise bonus interruption and deletion races, retained reward history, immutable space order, archived finale rejection, removed style rejection, entry/concurrent adoption, rollover ownership and lifetime/competition accounting. Domain suites and CI results are recorded in the pull request.

After approval and merge, publish Pages and deploy `moonboys-api`; no new D1 migration is needed. Verify Profile slots/deletion, Daily Cache, Missions, combat unlocks and Telegram launch links with a signed-in account.
