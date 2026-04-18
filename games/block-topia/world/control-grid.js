// Static definitions for the Live Control Grid nodes.
// These sit at key positions across the 20×20 tile map and form the interactive
// capture system that players and NPCs fight over each session.
export const CONTROL_NODES = [
  { id: 'core',  x: 10, y: 10, owner: null },
  { id: 'north', x: 10, y:  5, owner: null },
  { id: 'east',  x: 15, y: 10, owner: null },
  { id: 'south', x: 10, y: 15, owner: null },
  { id: 'west',  x:  5, y: 10, owner: null },
];
