const DEFAULT_EDGE_WEIGHT = 0.5;
const EDGE_WEIGHT_OFFSET = 0.2;
export const LAYOUT_ITERATIONS = 400;
const REPULSION = 5000;
const ATTRACTION = 0.012;
const DAMPING = 0.88;
const CENTER_GRAVITY = 0.06;
const MAX_DISPLACEMENT = 8;

export function stepGraphLayout(nodePositions, edgeList, width, height, cool) {
  const n = nodePositions.length;
  const cx = width / 2;
  const cy = height / 2;

  for (let i = 0; i < n; i += 1) {
    nodePositions[i].fx = 0;
    nodePositions[i].fy = 0;
  }

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const pi = nodePositions[i];
      const pj = nodePositions[j];
      const dx = pi.x - pj.x;
      const dy = pi.y - pj.y;
      const dist2 = dx * dx + dy * dy + 1;
      const force = REPULSION / dist2;
      const fx = force * dx;
      const fy = force * dy;
      pi.fx += fx;
      pi.fy += fy;
      pj.fx -= fx;
      pj.fy -= fy;
    }
  }

  for (const edge of edgeList) {
    const pi = nodePositions[edge.si];
    const pj = nodePositions[edge.ti];
    const dx = pi.x - pj.x;
    const dy = pi.y - pj.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 1;
    const force = ATTRACTION * dist * ((edge.weight || DEFAULT_EDGE_WEIGHT) + EDGE_WEIGHT_OFFSET);
    pi.fx -= force * dx;
    pi.fy -= force * dy;
    pj.fx += force * dx;
    pj.fy += force * dy;
  }

  for (let i = 0; i < n; i += 1) {
    const p = nodePositions[i];
    p.fx += CENTER_GRAVITY * (cx - p.x);
    p.fy += CENTER_GRAVITY * (cy - p.y);
  }

  const maxD = MAX_DISPLACEMENT * (cool * 0.7 + 0.3);
  for (let i = 0; i < n; i += 1) {
    const p = nodePositions[i];
    p.vx = (p.vx + p.fx) * DAMPING;
    p.vy = (p.vy + p.fy) * DAMPING;
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (speed > maxD) {
      p.vx = (p.vx / speed) * maxD;
      p.vy = (p.vy / speed) * maxD;
    }
    p.x += p.vx;
    p.y += p.vy;
  }
}
