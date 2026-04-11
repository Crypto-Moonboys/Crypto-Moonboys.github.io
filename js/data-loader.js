
// Moonboys Arcade - Data Loader
export async function loadGameData(path) {
  const R2_BASE = window.R2_PUBLIC_BASE_URL || '';
  try {
    const response = await fetch(`${R2_BASE}${path}?v=${Date.now()}`);
    if (!response.ok) throw new Error('R2 fetch failed');
    return await response.json();
  } catch (error) {
    console.warn('Falling back to local data:', error);
    const fallback = await fetch(path);
    return await fallback.json();
  }
}
