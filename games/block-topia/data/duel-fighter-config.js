export const DUEL_FIGHTER_CONFIG = {
  // Edit only this file to swap in final PFP-derived fighter art.
  // All assets are expected to use transparent backgrounds.
  placeholders: {
    fallback: '/games/block-topia/assets/duel-fighters/fighter-fallback.svg',
    player: '/games/block-topia/assets/duel-fighters/fighter-player-placeholder.svg',
    opponent: '/games/block-topia/assets/duel-fighters/fighter-opponent-placeholder.svg',
  },
  // Optional lightweight display labels. Values should be one of:
  // common | rare | epic | glitch
  labels: {
    player: 'common',
    opponent: 'rare',
  },
  // Optional custom overrides keyed by player id or display name.
  // Example:
  // byPlayerId: {
  //   "session-123": { asset: "/games/block-topia/assets/duel-fighters/my-pfp-a.png", label: "epic" }
  // }
  byPlayerId: {},
  byName: {},
};
