# Moonpet sanity audit — 29 September 2026

## Verdict and scope

The game routes and daily/weekly/season endings are connected, but a clean
live synchronization verdict is not justified. Two remaining stale writes can
erase earned pet state. Public rankings also show historical total discrepancies
which this code correction does not automatically repair.

Baseline main: `df2ff7358f683209f43622d1c082983e24599eb5` (#1374).
The live Worker reports `892166e666d9d85059dda04ba996a716ad7d5998`, deployed
28 September at 20:47:50 UTC. GitHub's comparison confirms no Worker changes
between that deployment and baseline main: the newer changes are background
assets, frontend, tests and documentation. The live game serves the
`20260928-bitty-background-v1` client token.

This is source tracing, real SQLite fault/concurrency fixtures, isolated browser
gameplay, and public read-only requests. No production gameplay, private D1
access, historical record mutation, merge or deployment was performed.

## Reproduced bugs and corrections

1. **Rename saves an entire stale pet snapshot.** Pause rename before persistence,
   commit a six-XP reward, then resume: baseline loses that XP while its accepted
   event and season score remain. Concurrent care/equipment and a pet switch can
   be overwritten as well. Rename now updates only the callsign on the selected,
   owned source pet. Its compatibility name mirror shares the transaction. A
   changed active pet rejects the request. XP, stats and equipment are not saved
   from the old object.
2. **Trade guards compatibility-profile XP but not authoritative instance XP.**
   A reward can increase the instance before its profile mirror catches up.
   Baseline trade passes the profile check and replaces instance XP with the
   earlier value plus its own reward. The new guard also compares the source
   instance XP before any reservation, wallet change or receipt. A conflict is
   retryable with no charge. Successful settlement adds its receipt's XP to the
   instance and mirrors the committed values, preserving current streak/date
   fields rather than writing an old snapshot.

Both XP-loss cases failed against baseline before correction. Nine new cases
cover reward overlap, all four public periods and Mini App parity, duplicate
retry, care/equipment preservation, pet-switch rejection, cap races and rename
rollback, decayed response stats and Telegram rejection messaging. Existing trade cooldown, wallet, source-pet and persistence rollback
tests remain. The trade fault injection now targets the updated mirror statement;
its rollback and exactly-once assertions are unchanged.

## User functions and endings

The literal-key scan found 62 rendered action keys, all present in the Worker
dispatcher. Dynamic finale start/retry, route/build choices and local Practice
use their existing execution tests; a string match alone is not proof of wiring.

| System | Current ending/reward contract checked |
| --- | --- |
| Adoption, incubation, hatch, roster, evolution | Owned active slot, lifecycle and level/progression gates |
| Feed, Play, Clean, Sleep, Train | Stat/cooldown costs, accepted XP, daily/weekly source evidence |
| Dance, Energy Drink, Cuddles | Stat-only actions; no Pet XP or official Journey care credit |
| Callsign | Connected action; stale full-state write corrected here |
| Jobs, timed activities, Adventures, street events, expeditions | Accepted action, costs, saved claim, original-pet rewards and retry |
| Seven daily checklist missions | Once-per-account/UTC-day 7/7 bonus: up to 25 Pet XP, 50 Gold, 1 Style; earned progress survives spending and complete unclaimed days survive midnight |
| Daily Cache and bounties | Once-per-day Cache; individual rotating bounty claims; duplicate-safe rewards |
| Daily Journey | Three of five official objectives; at most one qualified Growth Mark per pet/day |
| Weekly Journey | Five care, three training, three qualifying run finishes, one Weekly Boss attempt and two distinct check-in days; all five targets for a Crest |
| Standard Moon Run | Extraction/failure or 100-room completion; saved banked rewards and bosses |
| Official Daily Moon Run | One account attempt/day; ten-room route and Alley King; tactics and recoverable terminal rewards |
| Continuing Contracts | Six/ten-room saved routes; main goal plus final boss; repeatable Contract Rank, first three account/day bonuses of up to 20 Pet XP each |
| Practice | Repeatable local run with an ending, without official XP, rewards or quest credit |
| Districts and stories | Saved choices, mastery checkpoints/bosses, final story cycles and daily limits |
| Weekly Boss and seasonal raids | Attempt/energy gates, saved damage/victory and recoverable source-pet reward claims |
| Season XP tiers | Account season thresholds and once-per-tier claims |
| Pet season completion | Final evolution, 60 distinct-day Marks and 10 distinct-week Crests |
| Signal Sovereign finale | Three builds, saved turns, free defeat retry; first victory up to 100 Pet XP, 200 Gold, 5 Style per pet/season; explicit payout retry; optional after qualification/completion |
| Arena and Kaiju | Solo/matched routes, source-pet battle authority, saved choices/endings and recovery |
| Shop, trade, market, crafting, upgrades, inventory, cosmetics, relics | Wallet/capacity/ownership and receipt gates; trade stale XP write corrected here |

The new daily bonus and season finale already exist. Older dated reports saying
they are absent describe earlier baselines. Breeding, post-season Traits,
Sanctuary, Lineage, Fusion and Prestige remain unavailable in the Mini App.
Style Lab collects unlocks without visible equipment; passive relic powers remain
inactive. Those limits are not broken reward buttons.

## Live leaderboard discrepancy

Public responses at approximately 09:40 UTC returned valid daily, weekly,
seasonal and all-time data. For the same public player labels, three season
scores exceeded all-time totals:

| Public player | Current season | All-time | Difference |
| --- | ---: | ---: | ---: |
| Piga / PixelJourney | 9,077 | 6,935 | 2,142 |
| GKniftyHEADS.com | 4,099 | 4,027 | 72 |
| NBG Project / Charlie Buster | 2,400 | 1,901 | 499 |

Website, bot and Mini App share one projection. Daily/weekly scores use accepted
XP receipts; season uses its season counter; all-time sums retained owned pet
instances. Using the same query does not prove these stored authorities agree.
The reproduced stale writes can cause this class of divergence, but public
responses do not identify the historical cause of each account's difference.
Legacy baselines, old counters and missing pet authority must also be examined.

Community XP, Contract Rank, specialist XP, Marks and Crests are separate from
Pet XP. Activity is a recent receipt feed, not every click. Wiki entity graphs
and Arcade score graphs have separate inputs and should not receive Pet XP.

`scripts/audit-moonpet-xp-ledger.sql` is a read-only diagnostic for an authorized
production operator. It compares attributed receipts with retained pet totals,
season counters with receipt sums, and identifies unattributed XP. From clean
updated main, run:

```bat
npx wrangler d1 execute wikicoms --remote --config workers/moonboys-api/wrangler.toml --file scripts/audit-moonpet-xp-ledger.sql
```

Keep that output private. Review original reward claims, events, pet/slot
ownership and any legacy starting balances before proposing a repair. Do not
blindly take the larger leaderboard value, replace pet XP with receipt sums,
or replay rewards: those approaches can invent XP or pay currencies twice.
Historical reconciliation remains outstanding; this PR prevents the reproduced
new losses and does not claim to repair production records.

## Verification and release

The unchanged baseline Worker/API domain passed. Existing mobile gameplay passed
at 390×844 and 360×640 across all six screens, daily completion, finale builds,
saved turns, boss endings, claims and recovery. Public leaderboard browser checks
passed at 360, 390 and 1280 pixels, including all four periods, refresh, retained
stale data and outage retry. These are fixtures, not a live human-opponent match.
Focused new regressions pass. Full-suite and GitHub results are recorded in the PR.

After approved merge, deploy `moonboys-api` using the provenance wrapper from
clean main and verify `/deployment-info`. No new migration, asset, frontend
cache version or VPS restart is required. Existing migration 077 remains the
completion-feature prerequisite. Deploying this fix does not settle the
historical discrepancy described above.
