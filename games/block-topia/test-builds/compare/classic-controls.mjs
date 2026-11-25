const DISTRICT_LAYOUT = [
  { id: 'neon-slums', col: 0, row: 0, w: 24, h: 18, primaryType: 'relay' },
  { id: 'signal-spire', col: 24, row: 0, w: 24, h: 18, primaryType: 'ai' },
  { id: 'crypto-core', col: 0, row: 18, w: 16, h: 30, primaryType: 'mining' },
  { id: 'moonlit-underbelly', col: 16, row: 18, w: 16, h: 30, primaryType: 'district-core' },
  { id: 'revolt-plaza', col: 32, row: 18, w: 16, h: 30, primaryType: 'control' },
];

const NODE_TYPE_RING = ['ai', 'mining', 'relay', 'control', 'district-core'];
const DISTRICT_SPACING = 6;

function districtFor(col, row) {
  return DISTRICT_LAYOUT.find((district) => (
    col >= district.col
    && row >= district.row
    && col < district.col + district.w
    && row < district.row + district.h
  ));
}

function nodeTypeFor(col, row, district) {
  if (!district) return NODE_TYPE_RING[(col + row) % NODE_TYPE_RING.length];
  const ringType = NODE_TYPE_RING[(Math.floor(col / 2) + Math.floor(row / 3)) % NODE_TYPE_RING.length];
  return ((col + row + district.id.length) % 2 === 0) ? district.primaryType : ringType;
}

function buildControlNodes() {
  const nodes = [];
  let districtCounts = Object.create(null);

  for (let row = 3; row < 48; row += DISTRICT_SPACING) {
    for (let col = 3; col < 48; col += DISTRICT_SPACING) {
      const district = districtFor(col, row);
      if (!district) continue;
      const districtCount = districtCounts[district.id] || 0;
      districtCounts[district.id] = districtCount + 1;
      nodes.push({
        id: `n-${district.id}-${districtCount + 1}`,
        x: col,
        y: row,
        owner: null,
        districtId: district.id,
        nodeType: nodeTypeFor(col, row, district),
      });
    }
  }

  // Keep canonical ids for compatibility and for visually obvious anchors.
  nodes.push(
    { id: 'core', x: 24, y: 24, owner: null, districtId: 'crypto-core', nodeType: 'control' },
    { id: 'north', x: 24, y: 9, owner: null, districtId: 'signal-spire', nodeType: 'ai' },
    { id: 'east', x: 39, y: 24, owner: null, districtId: 'revolt-plaza', nodeType: 'relay' },
    { id: 'south', x: 24, y: 39, owner: null, districtId: 'moonlit-underbelly', nodeType: 'mining' },
    { id: 'west', x: 9, y: 24, owner: null, districtId: 'neon-slums', nodeType: 'district-core' },
  );

  return nodes;
}

function pairKey(aId, bId) {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

function buildControlLinks(nodes) {
  const links = [];
  const used = new Set();
  const byDistrict = new Map();

  for (const node of nodes) {
    const districtNodes = byDistrict.get(node.districtId) || [];
    districtNodes.push(node);
    byDistrict.set(node.districtId, districtNodes);
  }

  function pushLink(a, b) {
    if (!a || !b || a.id === b.id) return;
    const key = pairKey(a.id, b.id);
    if (used.has(key)) return;
    used.add(key);
    links.push({
      id: `l-${links.length + 1}`,
      from: { x: a.x, y: a.y, id: a.id },
      to: { x: b.x, y: b.y, id: b.id },
    });
  }

  // Dense local district links.
  for (const districtNodes of byDistrict.values()) {
    for (const node of districtNodes) {
      const neighbors = districtNodes
        .filter((candidate) => candidate.id !== node.id)
        .sort((a, b) => ((a.x - node.x) ** 2 + (a.y - node.y) ** 2) - ((b.x - node.x) ** 2 + (b.y - node.y) ** 2))
        .slice(0, 3);
      for (const neighbor of neighbors) {
        pushLink(node, neighbor);
      }
    }
  }

  // Cross-district backbone keeps global traversal connected.
  const anchorIds = ['north', 'east', 'south', 'west', 'core'];
  const anchors = anchorIds.map((id) => nodes.find((node) => node.id === id)).filter(Boolean);
  for (let i = 0; i < anchors.length; i += 1) {
    const current = anchors[i];
    const next = anchors[(i + 1) % anchors.length];
    pushLink(current, next);
    if (current.id !== 'core') pushLink(current, anchors[4]);
  }

  return links;
}

export const CONTROL_NODES = buildControlNodes();
export const CONTROL_LINKS = buildControlLinks(CONTROL_NODES);
