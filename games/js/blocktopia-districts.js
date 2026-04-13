const API_BASE = '/api/blocktopia-district';

export async function fetchDistrictState() {
  try {
    const res = await fetch(`${API_BASE}/state`);
    if (!res.ok) throw new Error('Failed to fetch district state');
    return await res.json();
  } catch {
    return {
      districts: {
        'neon-exchange': 50,
        'mural-sector': 60,
        'dead-rail': 45,
        'black-fork-alley': 40,
        'chain-plaza': 55,
        'moon-gate': 30
      },
      faction: 'GraffPUNKS'
    };
  }
}

export async function updateDistrictControl(districtId, delta, player) {
  try {
    await fetch(`${API_BASE}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ districtId, delta, player })
    });
  } catch (err) {
    console.warn('District update failed', err);
  }
}

export function calculateDistrictBonus(controlPercent) {
  return Math.round(controlPercent * 2);
}
