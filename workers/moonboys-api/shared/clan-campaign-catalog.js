// Original gameplay scenarios for Clan Operations, set in the existing Battle Chamber.
export const campaignThemes = [
  { id: 'clout-war', title: 'The Clout War', artwork: 'Four-Season Campaign Across London.jpg', description: 'Crews build a presence across London, hold their gains and meet in an all-city showdown.' },
  { id: 'blackout', title: 'The Blackout', artwork: 'Power Station Arcade Showdown.jpg', description: 'London loses its relay grid. Crews trace the outage, reconnect the districts and bring the city back online.' },
];

export const campaignActs = [
  [
    ['Claim the Streets', 'Start with routes that help the whole crew get on the board.'],
    ['Hold the Districts', 'Keep the districts active across multiple shifts.'],
    ['The Last District', 'Finish strong with your locked crew roster.'],
  ],
  [
    ['Find the Signal', 'Trace the first signals through the streets and rooftops.'],
    ['Bring the Grid Back', 'Spread work across different routes and days to restore the network.'],
    ['Light Up London', 'Reconnect the last stations together.'],
  ],
];

export const campaignObjectives = [
  ['Deep Shift', 'Complete six banks in the challenge window.', 'banks', 6],
  ['Fresh Layers', 'Bank on two different routes.', 'routes', 2],
  ['Survey Patrol', 'Bank on four different UTC days.', 'days', 4],
  ['District Hold', 'Bank the final tier on three different days.', 'finalDays', 3],
  ['Trace and Confirm', 'Bank the middle tier on three different days.', 'middleDays', 3],
  ['Stable Passage', 'Bank on three consecutive UTC days.', 'streak', 3],
  ['Recovery Shift', 'Bank on two days that follow a day without a bank.', 'recoveries', 2],
  ['Spotlight Set', 'Bank all three tiers on two different days.', 'fullDays', 2],
  ['Salvage Sweep', 'Collect four distinct finds from banked tiers.', 'finds', 4],

  ['First Bank', 'Bank one tier during the challenge.', 'banks', 1],
  ['Full Shift', 'Bank all three tiers on the same day.', 'fullDays', 1],
  ['Three-Day Run', 'Bank on any three UTC days.', 'days', 3],
  ['Five-Day Run', 'Bank on any five UTC days.', 'days', 5],
  ['Final Tier Twice', 'Bank the final tier on two different days.', 'finalDays', 2],
  ['Route Collector', 'Bank on all three of your faction’s routes.', 'routes', 3],
  ['Repeat Route', 'Bank the same route on two different days.', 'repeatRoute', 2],
  ['Route Relay', 'As a crew, bank on all three routes across at least three UTC days.', 'routeRelay', 3],
  ['Collectible Set', 'Collect six distinct finds across your banked tiers.', 'finds', 6],
  ['Rotating Full Shift', 'Bank all three tiers on two different routes.', 'fullRoutes', 2],
  ['Crew Call', 'Get half the eligible roster to bank at least once.', 'participation', 50],
  ['Three-Member Relay', 'Have at least three crew members bank across at least three UTC days.', 'memberRelay', 3],
  ['Roster Coverage', 'Get three quarters of the eligible roster to bank at least once.', 'participation', 75],
  ['Handoff Across Days', 'Have new crew participants make their first bank across three different UTC days.', 'handoff', 3],
  ['Split the Load', 'Have at least two crew members bank on each of three different UTC days.', 'pairedDays', 3],
];

export const campaignEvents = [
  ['Midnight Signal', 'Bank on the first two UTC days of the event to trace the signal.', 'openingDays', 2, 'crew'],
  ['Early Chain Wake-Up', 'Bank on any two consecutive UTC days to keep the relay awake.', 'streak', 2, 'crew'],
  ['Morning Signal', 'Bank once on each of three different routes to triangulate the source.', 'routes', 3, 'crew'],
  ['Faction Rush', 'Get at least half the eligible crew to bank during the event.', 'participation', 50, 'crew'],
  ['Evening Burst', 'Bank the highest operation tier during the event.', 'finalDays', 1, 'crew'],
  ['Late Chaos Window', 'Find three different collectibles by banking during the event.', 'finds', 3, 'crew'],
  ['Grid Recovery', 'Each crew advances the city grid by banking on different days. London needs 35% of its total potential.', 'days', 3, 'city', 35],
  ['Relay Outage', 'New crew members make their first bank across successive days to reconnect the relays.', 'handoff', 3, 'crew'],
  ['District Push', 'Each of the three available routes counts as a separate district. Completing full shifts on different routes secures more districts.', 'fullRoutes', 3, 'crew'],
  ['Cross-City Convoy', 'Two crew members banking on the same day move supplies. Repeat on a second day to deliver them.', 'pairedDays', 2, 'crew'],
  ['Signal Scramble', 'Bank across three routes and three days to restore the signal nodes.', 'routeRelay', 3, 'crew'],
  ['Open Streets', 'The first bank from each crew member counts. Reach three quarters of the eligible roster.', 'participation', 75, 'crew'],
  ['Supply Drop', 'Banks across the city fill the supply meter. London needs 35% of its total potential to reveal the collectible.', 'banks', 5, 'city', 35, 'reveal-collectible'],
  ['Night Shift', 'Bank a full shift on any UTC day during the event.', 'fullDays', 1, 'crew'],
  ['Last Station', 'Bank on three distinct routes to fuel the last station. London needs 30% of its total potential.', 'routes', 3, 'city', 30],
  ['City Rebuild', 'Full shifts on two routes during the first two UTC days unlock the final stage. Then bank another full shift during the last two days.', 'rebuild', 2, 'city', 35],
];

// Selected from existing operation finds. A campaign receipt is a separate,
// season-stamped collectible entry associated with the same find title.
export const campaignCollectibles = [
  'Chrome Flake', 'Signal Outline', 'Frost Ridge Sketch', 'Market Gate Mark', 'Rail Anchor Fragment',
  'Transit Trace', 'Neon Spark Emblem', 'Swarm Marquee', 'Neon Coil', 'Glass Heart',
];

export const campaignFinales = [
  ['All-City Showdown', 'Bank with your crew over seven days. Half the score comes from roster participation and half from banks per eligible roster day.', 'showdown', 1, 'ranked'],
  ['Restore the Grid', 'Bank on different routes over seven days. Every crew has an equal share of the city meter. Reach 35% together to restore the grid.', 'routes', 3, 'city', 35],
];
