export async function loadGameData(path) {
  const base = (window.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");

  try {
    if (base) {
      const response = await fetch(`${base}${path}?v=${Date.now()}`, { cache: "no-store" });
      if (response.ok) return await response.json();
      console.warn("R2 fetch returned non-OK, falling back to local:", response.status, path);
    }
  } catch (err) {
    console.warn("R2 fetch failed, falling back to local:", err);
  }

  const fallback = await fetch(path, { cache: "no-store" });
  if (!fallback.ok) throw new Error(`Local fallback failed for ${path}: ${fallback.status}`);
  return await fallback.json();
}
