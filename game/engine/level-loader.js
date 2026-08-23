// NBG Game Level Loader

export async function loadLevel(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Unable to load level: ${path}`);
  }
  return await response.json();
}

export function createLondonLevel(levelData) {
  return {
    name: levelData.name || 'London Graffiti',
    entities: levelData.entities || [],
    objects: levelData.objects || [],
    theme: 'london-night-graffiti'
  };
}
