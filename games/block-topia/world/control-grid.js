// Static definitions for the Live Control Grid nodes.
// These sit at key positions across the 20×20 tile map and form the interactive
// capture system that players and NPCs fight over each session.
export const CONTROL_NODES = [
  { id: 'core',  x: 24, y: 24, owner: null, districtId: 'crypto-core' },
  { id: 'north', x: 24, y: 10, owner: null, districtId: 'signal-spire' },
  { id: 'east',  x: 38, y: 24, owner: null, districtId: 'revolt-plaza' },
  { id: 'south', x: 24, y: 38, owner: null, districtId: 'moonlit-underbelly' },
  { id: 'west',  x: 10, y: 24, owner: null, districtId: 'neon-slums' },
];
