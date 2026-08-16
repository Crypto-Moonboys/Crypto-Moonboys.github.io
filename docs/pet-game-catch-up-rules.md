# Moonpet Catch-up and Anti-runaway Rules

**Status: FUTURE.** This is the approved design boundary for later implementation. It does not add Rested XP, pace bonuses, recovery gameplay, or new reward calculations today.

## Fairness principle

A hard daily Pet XP cap punishes players whose available play time is concentrated on weekends, during events, or after an absence. It also turns play beyond the cap into a meaningless action. Completely uncapped full-rate XP creates the opposite problem: a small group can compress a 90-day journey into a few days and make community competition feel unreachable.

Season 1 therefore targets a soft-cap curve. Players may keep progressing, while calendar-gated Growth Marks and Weekly Crests preserve the season's intended pace.

## Planned soft-cap model

**IN DEVELOPMENT:** exact targets, thresholds, rates, and eligible sources will be balanced and enforced by the server in a later PR.

1. **Normal band:** award normal Pet XP up to the daily target.
2. **Reduced band:** after the target, continue awarding Pet XP at diminishing returns.
3. **Heavy-grind band:** after a high threshold, further play provides only tiny prestige or cosmetic value.

The curve must let dedicated players grind without letting full-rate XP finish the season in a week. It must not loosen the limit of one Growth Mark per pet per day or one Weekly Crest per pet per week.

## Rested XP

**FUTURE.** Rested XP is a level-pace aid accumulated and consumed for a specific `pet_id`.

- It belongs to one `pet_id`; it is not account-wide and cannot move between Moonpets.
- It helps Pet XP/level pace only.
- It cannot grant or imitate a Growth Mark.
- It cannot grant or imitate a Weekly Crest.
- It cannot grant Arcade XP.
- It cannot be bought with cash, crypto, or any paid recovery mechanism.

## Pace statuses

**FUTURE.** The server will compare a pet's remaining eligible days/weeks, current Marks and Crests, and remaining requirements. Player-facing guidance should use these statuses:

| Status | Meaning |
| --- | --- |
| **Ahead** | The pet is beyond the expected completion pace. |
| **On pace** | Ordinary continued play can meet the Legendary target with the intended buffer. |
| **Behind but recoverable** | The pet trails expected pace but can still finish through ordinary remaining opportunities and approved catch-up. |
| **At risk** | Legendary remains mathematically possible, but few missed opportunities remain and focused play is required. |
| **Cannot reach Legendary this season** | Even all legitimate remaining opportunities cannot meet a required gate. The UI must say so plainly rather than imply a paid rescue. |

Statuses are guidance, not rewards, and must be calculated from authoritative records rather than client claims.

## Other catch-up tools

**FUTURE.** Behind-pace bonuses may increase eligible Pet XP for a genuinely behind pet. Each `pet_id` may also have at most one difficult seasonal Crest recovery challenge. The challenge recovers one legitimate missed Crest opportunity; it does not create an unlimited Crest source.

Catch-up must never create fake Growth Marks, fake Weekly Crests, or fake Arcade XP. There is no cash/crypto shortcut and no paid recovery path.

