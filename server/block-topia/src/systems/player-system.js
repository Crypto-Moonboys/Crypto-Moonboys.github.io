// Player System Scaffold
// Handles server-authoritative movement and validation logic.

export function clampPosition(x, y, bounds = { min: 0, max: 100 }) {
  return {
    x: Math.max(bounds.min, Math.min(bounds.max, x)),
    y: Math.max(bounds.min, Math.min(bounds.max, y)),
  };
}

export function validateMovement(previous, next, maxSpeed = 5) {
  const dx = next.x - previous.x;
  const dy = next.y - previous.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance <= maxSpeed;
}
