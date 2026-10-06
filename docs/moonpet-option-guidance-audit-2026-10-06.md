# Moonpet live option guidance audit — 6 October 2026

Base: `b4d760898a1a2355c4db6a762373e61b965619b2` (merged #1448). Scope is the current Telegram Mini App and its live actions. Breeding, Lineage, Fusion, Sanctuary and Prestige are outside this release.

## Evidence and limits

The deployed public Mini App JavaScript matched the base byte for byte (SHA-256 `63ea8a2201c5da914493e204ccc3c43113a5461187613b2624568fd601b55815`). The production API health response was OK. Action descriptions were checked against the local Worker dispatch and handlers, live-shaped state projections, and the actual client renderers. Browser interaction used isolated SQLite fixtures at 390×844 and 360×640; it did not mutate production accounts or spend player resources. This is a source and fixture audit of the deployed build, not an authenticated audit of every player's private production save.

## Findings corrected

- Bare action labels made outcomes hard to predict. All 69 rendered action keys now have a visible purpose sentence, with contextual descriptions for abandoned Contracts, saved run delivery, activity recovery, wider Arena matchmaking and notification changes.
- Claims, resource spending, committed choices and irreversible or risky actions lacked consistent emphasis. Text badges accompany color: CLAIM READY, CHECK COST, COMMIT CHOICE, REVIEW RISK and UNAVAILABLE. The current availability, costs, reward previews and payloads remain attached to the same button.
- Screen reader descriptions now reference the actual purpose and live requirements text, including prices, rewards, changing cooldowns and disabled reasons. Legacy red styling no longer classifies reversible alerts or queue controls as risky; abandoned Contracts remain explicit forfeitures.
- Disabled text was too faint. Disabled buttons keep a readable purpose and their server-driven lock reason; uncertain saves consistently show REFRESH REQUIRED, including egg actions.
- Menu routes looked like gameplay actions. Routes now say OPEN [MENU] // NO COST and explain what the destination contains. The six dock tabs have short purpose labels; Audio, Radio and Refresh have visible labels beside their icons.
- Immediate Sleep and background Sleep were easy to confuse. Immediate Sleep restores energy now; Work timers explain duration previews and returning to claim. Stat-only Energy Drink is distinguished from consuming a bag item.
- Kaiju card choices explicitly disclose the Worker’s outcome-dependent settlement cost: loss 4 energy, draw 5 energy, win 6 energy, in visible and accessible purpose text. A regression compares this copy to the actual Worker reward constants for both solo and player modes.
- Incubation copy implied that hatch revealed identity; it now identifies breakout and Stage 3 reveal separately, including the HATCH BOT action label, Home/Profile/Explore prompts, hatch-age timing and locked state. Weekly Journey copy uses the listed objective count instead of a fixed five. Jobs copy describes the actual level, specialist and cooldown gates and base rewards rather than claiming an energy charge.
- Old lightweight navigation copy described internal loading. Recommended and Play Now explain the player destination; pet routes focus the visible Pet Spaces selector.

## Navigation and non-action controls

| Control | What, how and why |
| --- | --- |
| Home / Missions / Explore / Work / Economy / Profile | Care / Goals / Runs / Timers / Gear / Pets labels; route descriptions name the destination and say navigation is free. |
| Panel summaries | Existing icons and purpose lines identify care, saved quests, goals, risk, rewards, inventory and progression before expansion. |
| Contract build, difficulty, route length, optional objective | Existing option details explain effects, room counts and rank; saved setup buttons say select a setup, then tap a quest. Selection itself does not spend resources. |
| Crafting goal | Existing tracked-recipe progress and material routes explain what to gather; crafting remains a separate resource-spending action. |
| Callsign input | Existing labelled input is followed by a Save Callsign button explaining the change and separate canonical identity. |
| Say Hello / canvas interaction | Say Hello explicitly says animation only, with no XP or stat change. |
| Audio / Radio / Refresh | Visible icon labels and live accessible names retain on/off state; the in-app guide explains where they are and how to toggle or reread the save. |
| Guide / complete website guide | Buttons explain reading help or opening the website guide. |
| Full leaderboard / period controls | Explain competition scores, XP versus run depth, and viewing without changing the pet. Period selection keeps its existing accessible pressed state. |
| Retry module / connection / leaderboard | Explain rereading saved state or ranks; recovery does not repeat a gameplay action. |
| Close utility dialog | Existing Close label, Escape support and focus return remain intact. |

## Rendered action matrix

Each row below is the actual button registry. Payload-specific effects, costs, requirements, previews, caps and cooldowns still appear from existing live state rather than being replaced by this copy. A READY badge describes the current client gate; the Worker still validates the action on submission.

| Action key | Consequence class | Purpose shown |
| --- | --- | --- |
| `adopt` | progress | Create your first Secret Bot once Arcade entry is unlocked. Your Arcade XP is kept. |
| `incubate` | care | Add the selected care signal to your egg. Mix care types to prepare its breakout. |
| `hatch` | progress | Start EGGYONE breakout when its signal is ready. Its identity stays hidden until Stage 3. |
| `feed` | care | Reduce hunger and restore some energy so your pet is ready for more activities. |
| `play` | care | Spend some energy to raise happiness and earn capped care rewards. |
| `clean` | care | Raise cleanliness to keep your pet in good condition; this uses a little energy. |
| `sleep` | care | Restore energy now so your pet can keep playing. This is separate from timed Sleep in Work. |
| `train` | spend | Spend energy to earn training rewards and build your pet’s progression. |
| `energy_drink` | care | Restore energy without using a bag item. This Care action awards no XP. |
| `dance` | care | Raise happiness and play the radio for this dance. It stops with the animation; the Radio control can override it. No XP or incubation signal. |
| `cuddles` | care | Raise happiness with affection. This Care action awards no XP or incubation signal. |
| `daily_chest` | claim | Collect today’s Daily Cache once per account. Check the displayed rewards and XP allowance. |
| `buy_pet_slot` | spend | Spend the displayed Arcade XP to unlock this permanent space and create its egg. |
| `switch_pet_slot` | manage | Make this saved pet active for care and new activities. Its existing progress is kept. |
| `delete_pet_slot` | risk | Permanently delete this pet after confirmation. Its training is lost; the owned space and account reward history stay. |
| `contract_start` | progress | Start this quest using your selected build, difficulty and route length. No pet energy cost; earn Contract rank. |
| `contract_step` | choice | Commit this saved quest choice. Compare its effect on route health, supplies and your goal before choosing. |
| `contract_claim` | claim | Finish delivery of a saved Contract XP bonus to its original pet. No new quest is needed. |
| `daily_completion_claim` | claim | Collect a saved daily 7/7 bonus. Complete and claim the daily missions to qualify. |
| `finale_start` | combat | Start the finale with this build when its requirements are met. Battle health is separate from pet energy. |
| `finale_retry` | combat | Retry the finale with this build after a failed attempt. No pet energy cost. |
| `finale_step` | choice | Choose the next finale move. Compare damage, defense and kit use to survive the saved battle. |
| `finale_claim` | claim | Collect the reward from your saved finale victory. You do not need to fight again. |
| `event_recover` | claim | Finish the original saved Street Event for the pet that started it. No new choice or attempt. |
| `event_close` | risk | Give up this unverifiable old event after confirmation. No reward or refund; its original history is kept. |
| `random_event` | choice | Commit this Street Event choice. Review its costs, possible reward and setback before choosing. |
| `adventure` | choice | Take this adventure route. Compare the entry requirement, costs and risk before committing. |
| `run_start` | spend | Begin a repeatable Moon Run. Clear rooms, then extract to bank rewards before a failed room loses the bag. |
| `daily_run_start` | spend | Use your one official attempt for this UTC day. Cleared rooms count toward Daily Journey objectives. |
| `run_step` | choice | Resolve the next saved room with this choice. Compare clear chance, costs and failure damage first. |
| `daily_run_tactic` | choice | Choose this checkpoint tactic for the rest of your official run. Compare its bonuses and trade-offs. |
| `run_extract` | risk | End this saved run now. Check the displayed payout and whether this ends today’s official attempt. |
| `arena_matchmake` | combat | Join player matchmaking for an Arena battle. You can leave the queue before a match starts. |
| `arena_start` | combat | Start an Arena battle against the CRT rival. Choose one move at a time to win the battle. |
| `arena_ready` | combat | Confirm you are ready to start this player match. The battle begins when both players are ready. |
| `arena_move` | choice | Lock your move for this round. Balance damage, stamina and defense before committing. |
| `arena_forfeit` | risk | Concede this active Arena battle. This ends your fight instead of preserving it for later. |
| `arena_queue_cancel` | manage | Leave Arena matchmaking before a battle starts. Rejoin later when you want to play. |
| `kaiju_matchmake` | combat | Join player matchmaking for Kaiju cards. Compare your cards once the match category appears. |
| `kaiju_start` | combat | Start a Kaiju card match against the CRT rival. Play for the strongest active category. |
| `kaiju_card` | choice | Lock this card for the active category. Settlement costs 4 energy for a loss, 5 for a draw or 6 for a win. Compare ACTIVE values; your rival’s card stays hidden. |
| `kaiju_queue_cancel` | manage | Leave Kaiju matchmaking before a match starts. You can join again later. |
| `kaiju_match_cancel` | manage | Cancel this eligible solo Kaiju match instead of submitting a card. |
| `district_mission` | choice | Take this district approach to build mastery and earn capped rewards. Compare the cost and setback risk. |
| `event_chain` | choice | Save this choice in the current story. Compare its listed reward and bonus before committing. |
| `seasonal_boss` | combat | Make this raid attack. Review energy, damage and cooldowns to work toward the saved boss reward. |
| `seasonal_boss_claim` | claim | Collect a saved raid reward for its original pet. No second attack or energy payment. |
| `weekly_boss` | combat | Make this weekly boss attack. Compare its cost and damage to work toward the displayed victory reward. |
| `weekly_boss_claim` | claim | Collect the reward from a saved weekly boss victory. No second fight is needed. |
| `work` | progress | Do this job now for its displayed base rewards. Check level, specialist requirements and cooldown. |
| `activity_start` | progress | Start one background activity. It continues while you play or close the app; return here to claim it. |
| `activity_claim` | claim | Collect this activity’s saved reward and end its timer. Waiting longer can change rewards until the duration cap. |
| `activity_cancel` | risk | End this background activity without collecting its rewards. Start another activity after it closes. |
| `bounty_claim` | claim | Collect this completed daily bounty’s listed rewards. Progress is shared across your account. |
| `market_buy` | spend | Spend the displayed currency on this whole bundle. Check the contents and storage space before buying. |
| `buy` | spend | Buy this permanent equipment with the displayed currency. Equip it to use its bonuses. |
| `equip` | manage | Equip this owned item on your selected pet for its bonuses. Switching is free and keeps mastery. |
| `use_item` | spend | Consume one bag item now for its listed effect. Check the description before spending it. |
| `expedition` | spend | Spend the listed energy and one shared daily attempt for a possible find. Compare destinations first. |
| `gear_upgrade` | spend | Spend the quoted resources to improve this item. Its higher level strengthens its equipment bonus. |
| `craft` | spend | Spend the listed ingredients to make the displayed item. Check output space, then use it from your bag. |
| `cosmetic_unlock` | spend | Spend the displayed resources to unlock this style. Equip it in Style Lab to use its appearance. |
| `style_equip` | manage | Change your selected pet’s visible style for free. Owned style unlocks remain available. |
| `trade` | risk | Risk the displayed Moon Gold stake for a random profit or loss. A loss spends your stake. |
| `notification_set` | manage | Choose whether Moonpet can send you Telegram reminders. This does not change your pet’s progress. |
| `evolve` | progress | Advance to the next lifetime stage once the listed age and progression requirements are met. |
| `season_claim` | claim | Collect this unlocked competition tier’s reward. Your pet’s lifetime progress continues separately. |
| `rare_morph` | progress | Answer the unlocked rare signal to transform your pet. The route opens from its saved traits and history. |
| `rename` | manage | Save the callsign entered above for this pet. Its canonical identity and progression stay separate. |

## Validation

- 69 action descriptions exercised through the real button renderer; 81 purpose, payload, availability, escaping and consequence regressions passed.
- Full non-browser Moonpet suite: 69 test files, 1,262 passed, zero failures or skips.
- Actual browser fixture flows passed at 390×844 and 360×640 across all six screens, including keyboard disclosure controls, saved/recovered rewards, Contracts, Daily Run, bosses, crafting, market capacity, pet spaces, busy/energy locks and combat. New checks require button purpose, badge and accessible descriptions in every screen, NO COST navigation, wrapping within mobile buttons, valid purpose/requirements description references and actual browser accessibility-tree announcements.
- Browser art recovery now waits for its authoritative save response and replacement render before interacting; this removes a fixture race against the full refresh.
- Domain-runner registration, JavaScript syntax and whitespace checks passed. The PR records final-head CI separately.

## Release

Client, stylesheet and Telegram launch URL cache key: `20261006-option-guidance-v1`. The existing art loader, renderer and run module versions remain unchanged. GitHub Pages publishes the frontend after merge. Deploy `workers/moonboys-api` to update the Telegram bot's launch URL only; no API routes, gameplay rewards, auth, D1 schema or VPS runtime change. No D1 migration is needed. This audit does not merge or deploy the release.

After publishing, open the Mini App from Telegram and inspect Home, Missions, Explore, Work, Economy and Profile: purpose text, live costs/locks, free navigation, claim and risk badges, audio/radio/refresh labels, and the active tab should all remain clear on a narrow screen. The account's saved pets and progression should remain unchanged.

## Dance radio follow-up

Dance now starts temporary radio playback in the original button gesture and stops at the actual dance animation deadline, including reduced motion. Replacing the pose, a rejected action or leaving the game stops temporary playback. The Radio control cancels the automatic timer and takes ownership. Temporary playback leaves the saved manual radio preference unchanged. A pending action has a bounded fallback and late playback or stale animation timers cannot restart or stop newer playback.

This follow-up uses client and Telegram launch cache key `20261006-dance-radio-v1`; the unchanged stylesheet remains `20261006-option-guidance-v1`. The Worker change only updates its Telegram launch URL; no migration is needed. Regression coverage includes the shared action handler and native mobile media playback.
