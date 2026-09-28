# Moonpet quests, endings and public synchronization audit — 28 September 2026

Base: `8c92e34667496875ed3f6ab319b6896aec8eeb4d` (merged PR #1355).
The public Worker reported that same commit, deployed at
`2026-09-28T07:30:47.974Z`. This audit combines source tracing, isolated SQLite
and browser regression suites, and read-only public endpoint checks. It does
not claim to have inspected every production account or an authenticated live
Telegram session.

## Reproduced mismatch and fix

Weekly Check In promises two different UTC days, but qualification and the
Mini App summed evidence rows. Two accepted check-in aliases on one day could
complete that objective and award a Crest early. Historical recovery used the
same event-count assumption. The normal Daily Cache already enforces one
account claim per day; this is not a newly discovered double-click cache farm.

The shared weekly progress query now counts distinct accepted source days for
Check In. Other objectives retain their sum/max rules. Both Mini App totals
and objective details use the same query as live Crest settlement. Recovery
uses distinct days before selecting award candidates, then groups evidence by
day to find the first day all five targets were actually met. Later actions
cannot shift that date. Evidence remains saved so recovery does not keep
rediscovering same-day aliases as missing work.

Weekly evidence ownership also now requires the instance and season slot to
agree on owner, pet, season and slot number. The current database foreign key
already prevents new inconsistent tuples; the runtime guard additionally
rejects simulated legacy mismatches. Progress reads require an accepted source
event for that same owner/pet/season. Missing source evidence cannot silently
count toward a new Crest. Existing Crests and historical XP are not revoked.

## Function and reward audit

| Player option | Ending, reward and saved authority | Audit result |
| --- | --- | --- |
| Egg care, incubation, hatch, adoption and pet switching | Pet lifecycle, season slots and active pointer; identity/ownership gates | Existing lifecycle, per-pet, slot and browser tests retained |
| Care, Dance, Energy Drink, Cuddles, training and items | Server eligibility, cooldowns, stats, action receipts and XP caps | Existing care/action/pose tests retained; unavailable actions remain explained by gates |
| Jobs and timed activities | Saved start and reward snapshot; claim, expiry and interrupted-claim recovery | Original-pet settlement and duplicate claims remain covered |
| Seven daily missions, daily bounties and Daily Cache | Accepted source actions, once-per-key claims, account/day cache receipt | No extra all-seven-checklist payout exists; bounty and cache rewards are separate |
| Daily Journey | Three of five objectives earn one qualified Growth Mark per UTC day | Source evidence, recovery and duplicate award tests retained |
| Weekly Journey | Five care, three training, three qualifying run finishes, one boss attempt, two check-in days; all five required | Distinct-day UI/live/recovery mismatch fixed here |
| Standard Moon Run | Saved encounters/choices, bosses, extraction or 100-room completion; banked rewards | Ending, failed settlement, replay and original-pet recovery tests retained |
| Official Daily Run | One attempt per account/UTC day; ten rooms and Alley King; terminal reward receipts | Boss/early-ending recovery and bounded recovery fairness retained from merged code |
| Continuing Contracts | Six/ten-room routes, builds, drafts, paths, preparations and field choices; final boss plus main goal required | Saved revision/ownership checks, failure endings and replay tested; unlimited Contract Rank, only three daily 20-Pet-XP bonus slots |
| Practice | Local saved run and score; freely repeatable | No official rewards, Journey credit or public XP |
| Weekly Boss, seasonal raid, district and story missions | Saved attempt/defeat/claim records and settlement receipts | Existing ending, eligibility, reward and recovery tests retained |
| Arena and Kaiju | Eligibility, reserved source pet/season, battle state and settlement | Ownership, energy, XP caps, retries and source-pet rewards retained |
| Shop, trade, market, crafting, upgrades and Style Lab | Affordability/capacity gates, inventory or unlock records, duplicate-safe system receipts | Account-owned crafting/upgrade/cosmetic events deliberately do not borrow the selected pet's identity or create XP |
| Relic Vault | Owned relic query uses the actual acquisition timestamp | Merged #1355 fix retained and regression exercised |
| Season XP tiers | Tier reward claims backed by unified settlement receipts | Rejected/paid/duplicate claim behavior retained |
| Per-pet season completion | Final evolution, 60 distinct-day Marks and 10 distinct-week Crests | Completion authority and interrupted final-award recovery retained; no additional final-season boss exists |

## Leaderboards, activity and graphs

The website, Mini App and bot continue to share the Pet ranking projection.
Daily/weekly scores use accepted XP in their recorded UTC settlement windows;
season scores use the reward's source season; all-time sums retained owned pet
instances, including archived seasons. Current-pet identity beside an account
score and original-pet identity on a historical event are intentionally distinct.
Only explicitly awarded Community XP reaches the Community leaderboard.

The public recent activity feed is a limited receipt feed, not a complete click
history. Rewarding actions enter their authoritative event/claim records;
Contract choices remain in Contract state and Practice remains local. An actual
crafting action, duplicate replay and pet switch are covered by the new audit
regression: one public crafting entry, no XP increase and no falsely borrowed
pet identity or exposed private owner ID. UNKNOWN on an account-owned receipt
does not mean the action failed.

Dance, Energy Drink and Cuddles are logged stat actions with their own cooldowns
and daily limits. They do not award XP or count as the feed/play/clean/sleep
evidence required by the official Journey care objective. Their animations and
stat benefits do not imply a leaderboard reward.

`graph.html` reads generated canonical Wiki entities and relationships. It does
not consume Pet XP, Community XP, Contract Rank or Marks/Crests. The graph on
`games/leaderboard.html` uses the selected Arcade leaderboard entry. It does not
consume Pet scores either. There is no missing Pet-to-graph synchronization job
to add. The read-only `live-graph-pets-verify.mjs` check passed against the public
site and API: 327 Wiki nodes, 1,629 edges, full/mobile graph parity and a valid
Pet leaderboard response. Graph generation reported
`2026-09-26T10:06:28.003Z`, with verification at `2026-09-28T02:40:38.068Z`.

## Deliberate feature limits

Breeding, post-season Traits, Sanctuary, Lineage, Fusion and Prestige remain
future/locked Mini App systems. Style Lab collects cosmetic unlocks but does not
equip a visible appearance or grant a combat stat effect. No new season boss,
daily completion bonus, XP type, cooldown reduction or graph score is introduced
by this correctness patch. Contracts and Practice remain the repeatable paths
when capped or timed official activities are unavailable.

## Verification and deployment

`scripts/moonpet-quest-public-sync.test.mjs` exercises real SQLite source events,
live Crest settlement, Mini App summaries, historical earning dates, duplicate
recovery, legacy authority mismatches and the public crafting boundary. Existing
weekly and Mini App fixtures now use accepted source records and distinct days;
the obsolete inline-SQL assertion is replaced by behavioral coverage. The new
suite is included in `ci:worker-api`.

Full local `npm test`, syntax/diff checks, browser coverage and GitHub checks are
recorded with their final results in the PR. The browser suites exercise the six
Mini App screens at mobile widths and the public Pet leaderboard at mobile and
desktop widths. These are isolated fixtures, not production account mutations.

After merge, deploy the Worker from clean updated main with
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`, verify its
`/deployment-info` commit, and reopen the Mini App. There is no new D1 migration,
VPS restart or frontend cache-token change. Existing production migrations must
already be applied. Live acceptance should check Weekly Check In remains 1/2 on
the first UTC day and becomes 2/2 after the next day's accepted cache claim,
with at most one Crest after the other four targets are met.
