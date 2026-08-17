# Moonpet Season Economy Calibration

**Authority version:** Season 1 calibration  
**Scope:** pacing and reward ownership only. No breeding, genetics, lineage, mutation, offspring, or new trait systems are introduced.

## Progression source audit

The beta's independent XP tracks allowed up to 1,620 track XP per day (Care 300, Training 240, Adventure 360, Arena 300, Job 240, Bond 180). The square-root level curve reaches level 50 at 192,080 XP and level 100 at 784,080 XP. Repeated missions, quests, exploration, care, jobs, events, boss activity, and reward settlement could therefore make levels look like the complete journey even though those actions did not prove calendar participation. Boss definitions correctly prohibit repeatable direct Pet XP, but the combined track caps and level-only evolution checks compressed the perceived journey.

Season 1 treats XP as only one input. Calendar evidence is authoritative: one Growth Mark per pet per UTC day, one Weekly Crest per pet per season week, and 60 Marks plus 10 Crests for completion. Materials and boss requirements remain additional evolution inputs. A client retry cannot mint another award because evidence keys and calendar qualification keys are unique.

| Player pattern | Beta estimate | Season 1 target |
| --- | ---: | ---: |
| Casual (3–4 active days/week) | Level milestones in 2–5 weeks | meaningful mid-season evolution; Legendary is not assumed |
| Regular (5–6 active days/week) | high levels in 1–3 weeks | Legendary around days 84–90 with 60 Marks and 10 Crests |
| Dedicated (daily) | progression could appear complete in about 7 days | eligible around days 78–84; never before ten qualifying weeks |

## Locked journey gates

- Moon Egg: days 0–13. Strong engagement permits hatch no earlier than day 7; day 14 guarantees hatch.
- Street Moonpet: target days 14–21.
- Cyber Moonpet: target days 28–42.
- Elite Moonpet: target days 49–63.
- Moon Guardian: target days 64–77.
- Legendary: target days 78–90, subject to 60 Growth Marks, 10 Weekly Crests, final evolution, materials, and boss/event evidence.

Future-compatible requirements must be additive server evidence. They must not allow a client clock, payment, active-pet switch, or repeat request to bypass a calendar gate.

## Reward authority and isolation

Pet XP, evolution records, Growth Marks, Weekly Crests, lifecycle events, cooldowns, memories, and history must resolve against the participating `pet_id`. Moon Gold, Crystals, materials, cosmetics, and spendable Arcade XP remain account-owned. Settlement looks up ownership in D1 and writes an immutable participating-pet key; switching the active pet later cannot redirect stored evidence.

## Season 0 to Season 1 deployment

1. Back up D1 and run migrations in numeric order. Migration 061 preserves every beta evidence row and qualifies only the earliest historical row per pet/day and pet/week; migration 062 then rebuilds both evolution tables non-destructively so Legendary stage 5 can persist.
2. Keep Season 0 pets and placeholder identity fields as historical records. Archive them through status/migration fields rather than deleting rows.
3. Snapshot the Season 0 leaderboard, then start a new Season 1 leaderboard namespace/season key. Do not truncate shared history tables.
4. Reconcile active slots into the Season 1 key, grant slot 1 through the existing free-season flow, and leave Sanctuary/completion snapshots immutable.
5. Verify counts before and after migration, duplicate-cap indexes, foreign keys, and a rollback backup before enabling Season 1 writes.

The transition intentionally separates leaderboard reset support (a new season namespace) from historical deletion. Placeholder pets remain auditable and may be archived without being silently rewritten as production pets.
