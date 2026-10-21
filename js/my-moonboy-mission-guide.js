/* #1552 follow-up: public source-backed economy guidance, private read-only checklist UI.
 * No account data is stored here; no gameplay, award, claim or wallet actions. */
(function () {
  'use strict';
  const SOURCES = Object.freeze([["onboarding.telegram","Identity","Telegram account"],["onboarding.faction","Identity","Join a faction"],["onboarding.pet-entry","Identity","First MoonPet qualification"],["telegram.daily-claim","Community","Telegram daily claim"],["faction.daily-missions","Faction","Daily faction missions"],["faction.seasonal-mission","Faction","Seasonal faction mission"],["faction.weekly-war","Faction","Weekly faction competition"],["battle.wtf-windows","Battle Chamber","WTF event windows"],["battle.missed-opportunities","Battle Chamber","Missed opportunity history"],["arcade.daily-opportunity","Arcade","Daily Arcade opportunity"],["arcade.roguelite-objectives","Arcade","Roguelite objectives"],["moonpet.adoption-incubation","MoonPet","Adoption and incubation"],["moonpet.daily-seven-missions","MoonPet","Daily seven-mission checklist"],["moonpet.seven-of-seven-claim","MoonPet","Daily completion bonus"],["moonpet.daily-journey","MoonPet","Daily Journey"],["moonpet.weekly-journey","MoonPet","Weekly Journey"],["moonpet.care","MoonPet","Care and cooldowns"],["moonpet.claimable-rewards","MoonPet","Ordinary daily bounty rewards"],["moonpet.daily-cache","MoonPet","Daily Cache claim evidence"],["moonpet.season-tier-claims","MoonPet","Season-tier saved claims"],["moonpet.finale-claim","MoonPet","Finale victory rewards"],["moonpet.extra-bounty-claims","MoonPet","Extra daily bounty progress"],["moonpet.weekly-bounty-claims","MoonPet","Weekly bounty block progress"],["moonpet.saved-run","MoonPet","Saved Moon Runs"],["moonpet.contracts","MoonPet","Saved contracts"],["moonpet.jobs","MoonPet","Jobs and timed activities"],["moonpet.bosses-combat","MoonPet","Bosses and saved combat rewards"],["moonpet.garden-kitchen-gym","MoonPet","Garden, Kitchen and Gym"],["moonpet.evolution","MoonPet","Permanent evolution"],["wiki.accepted-missions","Wiki","Accepted Wiki missions"],["championship.verified-clout","Championship","Verified Championship Clout"],["games.dead-run","Other Games","Dead Run"],["games.nbg-london","Other Games","NBG London"]].map(([key, group, label]) =>
    Object.freeze({ key, group, label })));
  const SAVED_ONLY = Object.freeze([["daily_cache","Daily Cache readiness","The signed Action Plan can verify a completed cache opening, but only MoonPet confirms whether a new chest can be opened."],["extra_bounty_claim","Extra daily bounty readiness","Accepted event progress is shown, but exact claim receipts and eligibility remain in MoonPet Saved Status."],["weekly_bounty_claim","Weekly bounty readiness","Accepted event progress is advisory only; weekly boss-attempt and settlement proof remain in MoonPet Saved Status."]].map(([key, label, description]) =>
    Object.freeze({ key, label, description })));
  const ECONOMY = Object.freeze([["arcade-earned","Arcade, Community & Clout","Lifetime Arcade XP","Eligible linked, server-accepted Arcade play increases lifetime XP. 1,000 lifetime Arcade XP qualifies first-pet entry.","First-pet entry does not deduct lifetime Arcade XP. Pet 2 and Pet 3 use a separate spendable Arcade XP balance.","Rejected or unverified scores award no official XP; do not infer an XP debit merely from losing a game.","/games/","workers/moonboys-api/pets/entry-requirement.js","PET_ENTRY_ARCADE_XP = 1000"],["arcade-wallet","Arcade, Community & Clout","Spendable Arcade XP","Accumulates from eligible accepted Arcade progression, separately from lifetime earned XP.","Unlocking Pet 2 costs 500 spendable Arcade XP; Pet 3 costs 1,000. No cash purchase is involved.","Unlocking slots debits only the spendable wallet; the lifetime qualification counter is preserved.","/moonpet-game.html","docs/pet-game-seasonal-model.md","spending 500"],["scores","Arcade, Community & Clout","Game scores and ranked points","Play supported games; only validated server-accepted scores and source proof count for official rankings.","A raw score is not a spendable currency, Community XP or Championship Clout.","A loss or rejected submission can fail to earn points. No global score-to-XP conversion is guaranteed.","/games/leaderboard.html","js/leaderboard-client.js","submitScore"],["community","Arcade, Community & Clout","Community XP","Verified Telegram /daily grants 20 Community XP once per UTC day; other approved source events can award separately.","Community XP is distinct from Pet XP, Arcade XP, faction contribution and Championship Clout.","A missing claim or unconfirmed event earns nothing; this guide has no authority to claim a balance decreased.","/community.html","workers/moonboys-api/community-xp-awards.js","awardCommunityXp"],["faction","Arcade, Community & Clout","Faction contribution and faction clout","Signed, source-recorded faction signals and eligible crew activity support faction contribution; public weekly standings are separate.","These are competition/contribution measures, not a spendable player currency.","Advisory local mission progress is not a verified payout. A missed window does not automatically deduct clout.","/community.html","js/faction-operations.js","Today’s Faction Signal contribution"],["championship","Arcade, Community & Clout","Championship Clout","Only explicitly enabled, receipt-verified source actions under the Championship pilot policy may count.","Non-spendable; cannot be bought or converted from ordinary Arcade, Pet or Community XP.","Do not count a browser click, speculative score or local mission as verified Clout. Unverified sources stay preview/unavailable.","/community.html","workers/moonboys-api/championship/clout-pilot.js","non-spendable Championship Clout pilot"],["petxp","MoonPet resources","Pet XP and level","Accepted MoonPet care, missions, saved rewards and eligible game actions award Pet XP to the original source MoonPet.","Pet XP supports levels and evolution eligibility. It is not the account's Moon Gold, Crystals or Arcade wallet.","Resource use and run failure may cost energy or loot; do not present unverified Pet XP loss or transfers.","/moonpet-game.html","workers/moonboys-api/pets/completion-policy.js","DAILY_COMPLETION_REWARD"],["specialistxp","MoonPet resources","Specialist XP tracks","Original pet's accepted Care, Training, Adventure, Arena, Job and Bond actions grow their distinct specialist tracks.","Not a shared account wallet and cannot pay shop costs or be converted to Community/Arcade XP.","Do not assume a missed action deducts accumulated specialist XP; the source game confirms caps and readiness.","/moonpet-game.html","docs/moonpet-source-of-truth.md","Specialist XP"],["journeymarks","MoonPet resources","Growth Marks and Weekly Crests","Eligible accepted Daily and pet-specific Weekly Journey milestones award Growth Marks and Weekly Crests under their own calendar policies.","Required alongside pet age, levels, materials and bosses for permanent evolution; not spendable Gems or tokens.","A reset or missed milestone does not erase previously earned permanent marks or crests; never fabricate a catch-up award.","/moonpet-game.html","docs/moonpet-season-economy-calibration.md","Growth Mark"],["seasonxp","MoonPet resources","Account Season XP","Aggregates eligible awarded Pet XP into the original earning competition quarter for shared season standings and tier rewards.","Not a spendable wallet; season tier claims occur in the MoonPet Saved Status flow.","A quarter rollover does not delete permanent pet XP or old earned/unclaimed rewards.","/moonpet-game.html","docs/moonpet-source-of-truth.md","Account Season XP"],["gold","MoonPet resources","Moon Gold","Source-settled care, jobs, timed activities, bounties, Daily Cache, runs, bosses and events can add Gold.","Shop/Market, equipment upgrades, housing and some trade/choices can spend Gold; verify each quoted source cost before confirming.","Risky trades and failed unbanked run outcomes can reduce the relevant stake or unbanked loot. No automatic 75 Gold Standard Run fee is live.","/moonpet-game.html","workers/moonboys-api/pets/economy-expansion.js","PET_ECONOMY_ROUTES"],["crystals","MoonPet resources","Moon Crystals","Eligible jobs, timed activities, bounties, expeditions, boss/event rewards and season claims may grant Moon Crystals.","Account-owned; some gear, market offers and cosmetics require them. They are NOT Block Topia Gems.","Never infer a Crystal deduction from a preview; confirm an accepted purchase/action and its actual cost.","/moonpet-game.html","workers/moonboys-api/pets/economy-expansion.js","gold/crystals/style"],["style","MoonPet resources","Style Tokens","Earned in specific daily completion bonuses, bounties, rewards and eligible consumable use.","Account-owned; certain permanent Style Lab/cosmetic purchases spend tokens. Equipping owned cosmetics can be free.","A blocked or failed purchase must not be shown as a successful token deduction.","/moonpet-game.html","workers/moonboys-api/pets/economy-phase-3.js","PET_COSMETIC_SINKS"],["materials","MoonPet resources","Crafting materials, relics and items","Accepted runs, battles, districts, expeditions, events and other source-defined drops can add materials.","Crafting and gear upgrades consume exact required materials; using consumables removes inventory.","Unbanked run loot may be lost on failure. Wrong original pet or season must not transfer saved drops.","/moonpet-game.html","workers/moonboys-api/pets/economy-phase-3.js","PET_CRAFTING_RECIPES"],["needs","MoonPet resources","Energy, health and care needs","Care, rest, items and permitted activities restore source-defined needs; play and care can also progress missions.","Runs, battles, jobs and other activities may use energy or consumables; needs can decay with elapsed time.","These are pet stats, not token balances. Availability and cooldowns must be checked in the live MoonPet game.","/moonpet-game.html","workers/moonboys-api/pets/economy-expansion.js","energy + bank risk"],["dailycompletion","MoonPet resources","Daily completion and saved claims","The game's legacy 7/7 bonus requires its canonical completion flags and an explicit server-accepted claim; the reward is 25 Pet XP, 50 Moon Gold and 1 Style Token.","Claims are settled in MoonPet, never by the My Moonboy checklist. Account bonuses must not duplicate for multiple pets.","Missing/preview claims must not be represented as claimed or forfeited. Use MoonPet Saved Status for unsupported classes.","/moonpet-game.html","workers/moonboys-api/pets/completion-policy.js","moon_gold: 50"],["bt-xp","Block Topia (separate game)","Block Topia game XP","Validated mini-game wins and accepted Block Topia progression can increase its own XP subject to source caps.","Entry, mini-game play, skip choices and active progression drain can use this XP.","A minigame loss can apply an additional XP penalty. Costs depend on tier and state; inspect the game before playing.","/games/block-topia/","workers/moonboys-api/blocktopia/routes.js","xpLossPenalty = action === 'mini_game_loss'"],["bt-gems","Block Topia (separate game)","Block Topia Gems","Eligible successful mini-games have a server-defined chance of a Gem drop; this is not a guaranteed payout.","Gems fund verified Block Topia upgrades at the current source-quoted cost. Gems are NOT Moon Crystals or Moon Gold.","Drop chance is not a guaranteed award; insufficient-gems and unsuccessful actions must never appear as earned.","/games/block-topia/","workers/moonboys-api/blocktopia/routes.js","Not enough gems for upgrade"],["bt-standings","Block Topia (separate game)","Tier, streak, pressure and progress","The source tracks tier and streak outcomes independently of wallet and lifetime Arcade XP.","Upgrades and attempted activities have source-defined requirements.","Streaks and source-specific pressure can worsen after losses; never display them as money or Championship Clout.","/games/block-topia/","workers/moonboys-api/blocktopia/routes.js","win_streak"]].map(([id, group, title, gain, spend, risk, href, sourceFile, sourceMarker]) =>
    Object.freeze({ id, group, title, gain, spend, risk, href, sourceFile, sourceMarker })));
  const ROUTES = Object.freeze([["care","Care actions","earn","Pet XP, Gold and mission progress may apply only on accepted care actions; cooldowns and caps apply."],["jobs","Pet jobs","earn","Earn eligible Gold, Crystals or Style rewards after server settlement; level/stage gates."],["activities","Timed activities","earn","Claim saved timed jobs/activity rewards in MoonPet; use original pet and recovery rules."],["events","Random events","earn","Outcome-dependent rewards and costs; inspect risk preview."],["runs","Moon Runs","earn","Bank/extract saved loot when supported; failure can lose unbanked rewards and uses energy."],["boss","Weekly Boss","earn","Server-accepted original-pet victory/claim; one attack per day where applicable."],["season","Season rewards","earn","Claim eligible saved reward tiers in MoonPet Saved Status; dashboard cannot verify their claim state."],["bounties","Daily Bounty Board","earn","Ordinary daily bounty source is projected; extra/weekly bounties require Saved Status."],["expeditions","Crystal Expeditions","earn","Eligible expeditions can provide Gold/Crystals/materials; daily attempt cap."],["shop","Equipment shop","spend","Account resource costs and source-level purchase/upgrade gates."],["market","Moon Market","spend","Rotating server-defined offers; eligibility, balances, and limits checked in game."],["trade","Moon Gold trade","spend","Risk/reward; source outcome can increase or reduce committed Gold."],["evolution","Evolution","upgrade","Original pet's level/age/marks/crests/material gates; not a free daily claim."],["gear","Equipment mastery","upgrade","Equipment progression consumes exact source-owned Gold/material upgrade costs and respects equipment level gates."],["unlock","Level and stage unlocks","unlock","Progression grants access when server eligibility is satisfied, not cash credit."]].map(([key, label, loop, description]) =>
    Object.freeze({ key, label, loop, description })));
  // Wiki engagement is a distinct per-page/per-UTC-day receipt authority.
  // /player/action-plan currently returns only a daily Wiki receipt COUNT, not
  // the individual page/mission IDs; no row below can be ticked from that sum.
  const WIKI_ENGAGEMENT = Object.freeze([{"id":"engage","label":"Engage — comment on a Wiki article","action":"Open a Wiki article with Comments and submit a useful comment. Anonymous/email-only comments can be posted but do not establish a mission reward.","reward":"A signed, linked account may earn the source-defined Wiki Engage mission reward only after Worker acceptance and an eligible saved receipt. Comment visibility or moderation is a separate state.","status":"Individual comment/Engage completion for a particular page and UTC day is not projected here. Repeated comments do not automatically pay a second reward.","href":"/wiki/wuffi.html","missionId":"engage","sourceFile":"js/battle-layer.js","sourceMarker":"id: 'engage'"},{"id":"signal","label":"Signal — like a Wiki article","action":"Open a Wiki article and use the Like this article button while signed into the linked Telegram identity.","reward":"Only a server-accepted like linked to the eligible Signal mission can produce the source-defined Wiki XP receipt.","status":"One saved like per player/page and source-window deduplication prevent arbitrary repeat rewards. Per-page Signal receipt status is not projected here.","href":"/wiki/wuffi.html","missionId":"signal","sourceFile":"js/engagement.js","sourceMarker":"moonboys:page-liked"},{"id":"cite","label":"Cite — vote on a listed Wiki citation","action":"On a Wiki article with a citations/sources list, vote on an existing citation. The Cite mission refers to a citation vote, not automatically adding or editing source text.","reward":"Only a verified signed source action and an accepted Cite mission receipt can award the source-defined Wiki XP.","status":"Each page/citation/player vote is individually persisted. The Action Plan currently lacks per-citation and per-page Cite completion status.","href":"/wiki/wuffi.html","missionId":"cite","sourceFile":"js/engagement.js","sourceMarker":"moonboys:citation-voted"},{"id":"comment-vote","label":"Vote on a Wiki comment","action":"Upvote or downvote an existing Wiki comment where controls are enabled and the Telegram-linked gate permits the action.","reward":"Comment voting is a recorded engagement action; no separate XP-paying mission is proven for this click.","status":"A comment vote is not the same as Engage, Signal or Cite; do not count it as a verified task completion.","href":"/wiki/wuffi.html","missionId":null,"sourceFile":"js/comments.js","sourceMarker":"/comments/' + cid + '/vote"},{"id":"citation-submission","label":"Submit or correct a source citation","action":"Help improve factual sources through an authorized Wiki contribution workflow. The in-article Cite mission instead votes on citations already present.","reward":"No accepted XP award is established solely for submitting, opening or editing a citation.","status":"Editorial publishing and moderation are not equivalent to the per-page citation-vote receipt.","href":"/wiki/wuffi.html","missionId":null,"sourceFile":"js/battle-layer.js","sourceMarker":"id: 'cite'"},{"id":"reading-sharing","label":"Read, share or bookmark Wiki pages","action":"Read articles, follow links and share useful pages; these are navigation and community discovery actions.","reward":"No verified per-view, per-link, share or bookmark XP/Clout payout exists in this Action Plan.","status":"Do not call browser visits, local bookmarking or a citation link click a completed paid mission.","href":"/search.html","missionId":null,"sourceFile":"docs/community-clout-authority-audit-2026-10-16.md","sourceMarker":"Wiki Engage/Signal/Cite"}].map(item => Object.freeze(item)));
  const ALLOWED_GROUPS = Object.freeze(['Identity', 'Community', 'Faction', 'Battle Chamber', 'Arcade', 'MoonPet', 'Wiki', 'Championship', 'Other Games']);
  const resources = ['Arcade, Community & Clout', 'MoonPet resources', 'Block Topia (separate game)'];
  const exact = text => String(text == null ? '' : text);
  const escape = text => exact(text).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const STATUS_DONE = new Set(['claimed', 'complete']);
  const canonicalLink = source => source.key.startsWith('moonpet.') ? '/moonpet-game.html'
    : source.key.startsWith('games.nbg-') ? '/games/nbg-london/'
    : source.key === 'games.dead-run' ? '/games/dead-run/'
    : source.key.startsWith('games.') || source.key.startsWith('arcade.') ? '/games/'
    : source.key.startsWith('onboarding.telegram') ? '/gkniftyheads-incubator.html'
    : source.key.startsWith('onboarding.pet-entry') ? '/games/'
    : '/community.html';
  // Completion is display-only and must come from a fresh, accepted
  // server receipt or an explicitly verified server projection. A browser
  // mirror, preview, progress counter or claim-ready reward is NOT completed.
  function verifiedDone(task) {
    return !!task && STATUS_DONE.has(task.status) &&
      task.source_health === 'live' &&
      ['server_receipt', 'server_projection'].includes(task.evidence?.kind) &&
      task.evidence.verified_completion === true;
  }
  function simpleStatus(task, stale) {
    if (stale) return 'Previous snapshot — refresh';
    if (!task || typeof task !== 'object') return 'Status unavailable';
    if (verifiedDone(task)) return '✅ Completed';
    const name = exact(task.status || 'sync_unavailable').replace(/_/g, ' ');
    if (task.source_health === 'preview' || task.evidence?.kind === 'client_mirror' ||
        task.evidence?.kind === 'schedule_preview') return name + ' — advisory only';
    if (['query_failed', 'migration_pending', 'unavailable'].includes(task.source_health))
      return 'Source unavailable — not complete';
    return name + ' — read-only source status';
  }
  function currentTaskList(tasks, top) {
    const seen = new Set();
    const results = [];
    for (const entry of [].concat(Array.isArray(top) ? top : [], Array.isArray(tasks) ? tasks : [])) {
      if (!entry || typeof entry.source_key !== 'string' ||
          typeof entry.task_id !== 'string' || seen.has(entry.task_id)) continue;
      seen.add(entry.task_id);
      results.push(entry);
    }
    return results;
  }
  function renderRules(target) {
    if (!target) return;
    target.innerHTML = resources.map((group, index) => {
      const cards = ECONOMY.filter(entry => entry.group === group).map(entry =>
        '<article class="mm-economy-item"><h3>' + escape(entry.title) + '</h3>' +
        '<p><strong>Gain / earn:</strong> ' + escape(entry.gain) + '</p>' +
        '<p><strong>Spend / use:</strong> ' + escape(entry.spend) + '</p>' +
        '<p><strong>Lose / risk / limits:</strong> ' + escape(entry.risk) + '</p>' +
        '<p><a href="' + escape(entry.href) + '">Open original source</a></p></article>').join('');
      return '<details class="mm-economy-group"' + (index === 0 ? ' open' : '') + '><summary>' +
        escape(group) + ' · ' + ECONOMY.filter(x => x.group === group).length +
        ' resource guides</summary><div class="mm-economy-grid">' + cards + '</div></details>';
    }).join('') +
    '<details class="mm-economy-group"><summary>MoonPet gameplay earning and spending routes · ' +
      ROUTES.length + ' types</summary><div class="mm-economy-grid">' +
      ROUTES.map(route => '<article class="mm-economy-item"><h3>' +
        escape(route.label) + '</h3><p><strong>' + escape(route.loop) +
        ' / source rules:</strong> ' + escape(route.description) +
        '</p><p><a href="/moonpet-game.html">Check current source eligibility in MoonPet</a></p></article>').join('') +
      '</div></details>' +
    '<details class="mm-economy-group"><summary>Wiki likes, comments, citations and other engagement · ' +
      WIKI_ENGAGEMENT.length + ' actions</summary>' +
      '<p class="mm-muted">Only source-accepted, linked Wiki Engage / Signal / Cite receipts can support a Wiki mission reward. Amount and status must come from the actual Worker response, not a local page counter or old marketing copy.</p>' +
      '<div class="mm-economy-grid">' +
      WIKI_ENGAGEMENT.map(entry =>
        '<article class="mm-economy-item"><h3>' + escape(entry.label) + '</h3>' +
        '<p><strong>How:</strong> ' + escape(entry.action) + '</p>' +
        '<p><strong>XP / proof:</strong> ' + escape(entry.reward) + '</p>' +
        '<p><strong>Limits:</strong> ' + escape(entry.status) + '</p>' +
        '<p><a href="' + escape(entry.href) + '">Open Wiki source</a></p></article>'
      ).join('') + '</div></details>';
  }
  function renderChecklist(target, tasks, options) {
    if (!target) return;
    const opts = options || {};
    // Background signed refresh must not collapse open groups or steal keyboard
    // focus from a reader navigating this long, read-only checklist.
    const existingDetails = Array.from(target.querySelectorAll('details[data-mm-checklist-key]'));
    const hadPrevious = existingDetails.length > 0;
    const openKeys = new Set(existingDetails.filter(node => node.open)
      .map(node => node.getAttribute('data-mm-checklist-key')));
    const active = document.activeElement;
    const focusedDetail = active && target.contains(active) &&
      typeof active.closest === 'function'
      ? active.closest('details[data-mm-checklist-key]') : null;
    const focusedKey = focusedDetail?.getAttribute('data-mm-checklist-key') || null;
    // Href alone is ambiguous: every Saved Status action links to MoonPet,
    // and Wiki action links also repeat. Stable row identities survive refresh.
    const focusedLinkId = active?.tagName === 'A'
      ? active.getAttribute('data-mm-focus-link') : null;
    const stale = Boolean(opts.stale || opts.offline);
    const all = currentTaskList(tasks, opts.topActions);
    const bySource = new Map(SOURCES.map(source => [source.key, []]));
    all.forEach(item => { if (bySource.has(item.source_key)) bySource.get(item.source_key).push(item); });
    const heading = '<p class="mm-muted">Checklist statuses are read-only. A Completed tick requires verified server completion evidence; no self-completion controls exist. Claim-ready, previews and local progress do not count as completed. Source details are read from the signed account only.</p>' +
      (opts.moreAvailable ? '<p class="mm-source-warning">More tasks exist beyond this page. Expand the mission ledger and choose Load more until all source pages are loaded. Absence never means complete.</p>' : '') +
      (stale ? '<p class="mm-source-warning">Offline or stale: the statuses below are historical only. No current claims are verified until the next signed read.</p>' : '');
    const groups = ALLOWED_GROUPS.map(group => {
      const items = SOURCES.filter(source => source.group === group);
      return '<details class="mm-checklist-group" data-mm-checklist-key="' + escape('group:' + group) +
        '"' + (hadPrevious ? (openKeys.has('group:' + group) ? ' open' : '') : group === 'MoonPet' ? ' open' : '') +
        '><summary>' +
        escape(group) + ' · ' + items.length + ' tracked sources</summary>' +
        '<div class="mm-checklist-sources">' + items.map(source => {
          const entries = bySource.get(source.key) || [];
          const done = !stale ? entries.filter(verifiedDone).length : 0;
          const sourceHeading = '<strong>' + escape(source.label) + '</strong>' +
            '<span class="mm-muted"> · ' + done + ' verified complete / ' + entries.length +
            ' loaded task' + (entries.length === 1 ? '' : 's') + '</span>';
          const rows = entries.length
            ? '<ul class="mm-checklist-tasks">' + entries.map(task => {
              // petScopeLabel lives inside the signed controller, whose roster
              // assigns safe human-readable labels. Never expose the opaque
              // source_pet_ref in this read-only presentation.
              const safePetLabel = typeof opts.petLabel === 'function'
                ? opts.petLabel(task) : null;
              const petLabel = typeof safePetLabel === 'string' && safePetLabel.trim()
                ? safePetLabel : ['pet', 'original_pet'].includes(task.owner_scope)
                  ? 'Pet attribution not supplied by this source' : null;
              const period = task.period && typeof task.period === 'object' ? task.period : null;
              const periodLabel = period?.kind
                ? String(period.kind).replace(/[_-]+/gu, ' ') +
                  (period.key ? ' · ' + String(period.key) : ' · no recorded period key') +
                  (period.origin_timezone ? ' · ' + String(period.origin_timezone) : '')
                : 'Not supplied by this source';
              return '<li><span class="mm-checklist-mark" aria-hidden="true">' +
              (stale ? '–' : verifiedDone(task) ? '✅' : '○') + '</span><span>' +
              '<strong>' + escape(task.title || 'Unnamed source action') + '</strong> · ' +
              escape(simpleStatus(task, stale)) +
              (task.progress && task.progress.current != null
                ? ' · ' + escape(task.progress.current) +
                  (task.progress.target != null ? ' / ' + escape(task.progress.target) : '') +
                  ' ' + escape(task.progress.unit || 'progress') : '') +
              (task.blocking_reason_code ? ' · Reason: ' + escape(task.blocking_reason_code.replace(/_/g, ' ')) : '') +
              (petLabel ? '<span class="mm-checklist-context"><strong>Pet attribution:</strong> ' +
                escape(petLabel) + '</span>' : '') +
              '<span class="mm-checklist-context"><strong>Source period:</strong> ' +
                escape(periodLabel) + '</span>' +
              '</span></li>';
            }).join('') + '</ul>'
            : '<p class="mm-muted">No task in loaded results; status unknown, not completed.</p>';
          return '<details class="mm-checklist-source" data-mm-checklist-key="' + escape('source:' + source.key) +
            '"' + (openKeys.has('source:' + source.key) ? ' open' : '') +
            '><summary>' + sourceHeading +
            '</summary>' + rows + '<p><a href="' + escape(canonicalLink(source)) +
            '" data-mm-focus-link="' + escape('source:' + source.key) +
            '">Open source</a> · See Mission Ledger for full what, why, reward, cost and expiry.</p></details>';
        }).join('') + '</div></details>';
    }).join('');
    const gaps = '<details class="mm-checklist-group" data-mm-checklist-key="gap:saved-status"' +
      (hadPrevious ? (openKeys.has('gap:saved-status') ? ' open' : '') : ' open') +
      '><summary>Saved Status follow-up checks · ' + SAVED_ONLY.length +
      ' source limitations</summary><p class="mm-source-warning">These three source limitations remain: an accepted event can prove completion, but cannot by itself prove claim readiness. Open MoonPet Saved Status for the authoritative eligibility and settlement state.</p>' +
      '<ul class="mm-checklist-gaps">' + SAVED_ONLY.map(g =>
        '<li><strong>' + escape(g.label) + '</strong> — ' + escape(g.description) +
        ' <span class="mm-tag mm-tag--unknown">Claim readiness unverified here</span>' +
        ' <a href="/moonpet-game.html" data-mm-focus-link="' +
          escape('saved:' + g.key) + '">Check Saved Status</a></li>').join('') + '</ul></details>';
    // This is a separate SOURCE CHECKLIST, not six fake actionable tasks.
    // The current API aggregates Wiki mission completions; even a verified
    // total of three cannot prove which page/action supplied the receipts.
    const wikiTask = (bySource.get('wiki.accepted-missions') || []).find(entry =>
      entry?.source_health === 'live' && entry?.evidence?.kind === 'server_receipt' &&
      entry?.evidence?.verified_completion === true);
    const wikiCount = !stale && wikiTask && Number.isSafeInteger(Number(wikiTask.progress?.current))
      ? Number(wikiTask.progress.current) : null;
    const wikiStatus = wikiCount === null
      ? 'Individual Wiki mission source receipts are not available in this personal read.'
      : 'Signed API reports ' + wikiCount + ' accepted Wiki receipt(s) today in total. It does not identify which article, mission or citation was completed.';
    const wikiActions = '<details class="mm-checklist-group" data-mm-checklist-key="gap:wiki-engagement"' +
      (hadPrevious ? (openKeys.has('gap:wiki-engagement') ? ' open' : '') : ' open') +
      '><summary>Wiki interactions · ' + WIKI_ENGAGEMENT.length +
      ' individually unverified checks</summary><p class="mm-source-warning">' + escape(wikiStatus) +
      ' All six checks below remain unverified here; no count is assigned to Engage, Signal or Cite without their own accepted source receipt.</p>' +
      '<ul class="mm-checklist-gaps">' + WIKI_ENGAGEMENT.map(entry =>
        '<li><strong>' + escape(entry.label) + '</strong> — ' + escape(entry.action) +
        ' <span class="mm-tag mm-tag--unknown">Individual status not projected</span>' +
        ' <a href="' + escape(entry.href) + '" data-mm-focus-link="' +
          escape('wiki:' + entry.id) + '">Check original page</a></li>').join('') +
      '</ul></details>';
    const outro = '<p class="mm-muted">Block Topia Gems and XP, and some other-game rewards, are not personal balances in /player/action-plan. Check their original game screens. This checklist does not claim 100% completion or invent source records.</p>';
    target.innerHTML = heading + groups + gaps + wikiActions + outro;
    if (focusedKey) {
      const match = Array.from(target.querySelectorAll('details[data-mm-checklist-key]'))
        .find(node => node.getAttribute('data-mm-checklist-key') === focusedKey);
      const matchingLink = focusedLinkId && match
        ? Array.from(match.querySelectorAll('a[data-mm-focus-link]'))
          .find(link => link.getAttribute('data-mm-focus-link') === focusedLinkId) : null;
      (matchingLink || match?.querySelector(':scope > summary'))?.focus({ preventScroll: true });
    }
  }
  window.MOONBOYS_MISSION_GUIDE = Object.freeze({
    version: 1,
    sources: SOURCES,
    savedOnly: SAVED_ONLY,
    economy: ECONOMY,
    routes: ROUTES,
    wikiEngagement: WIKI_ENGAGEMENT,
    renderRules,
    renderChecklist,
    verifiedDone,
  });
  const start = () => renderRules(document.getElementById('mm-economy-guide'));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}());
