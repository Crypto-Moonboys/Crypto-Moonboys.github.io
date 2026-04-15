export const DISTRICTS = [
  { id: 'central_plaza', name: 'Central Plaza', x: 50, y: 50, radius: 10 },
  { id: 'graffiti_ward', name: 'Graffiti Ward', x: 25, y: 75, radius: 12 },
  { id: 'signal_heights', name: 'Signal Heights', x: 75, y: 25, radius: 12 },
  { id: 'null_yard', name: 'Null Yard', x: 78, y: 78, radius: 10 },
];

export function getDistrictForPosition(x, y) {
  for (const district of DISTRICTS) {
    const dx = x - district.x;
    const dy = y - district.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= district.radius) {
      return district;
    }
  }
  return null;
}

export function createDistrictPayload(playerId, district) {
  return {
    playerId,
    districtId: district?.id || null,
    districtName: district?.name || null,
  };
}
