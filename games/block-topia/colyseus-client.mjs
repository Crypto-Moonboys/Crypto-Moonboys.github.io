// The Pages frontend and VPS deploy independently. Ask the server which wire
// protocol it speaks before selecting a client; never guess after a failed read.
const pendingScripts = new Map();

export function clientScriptFor(endpoint, health) {
  const base = new URL(endpoint.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:').replace(/\/?$/, '/'));
  if (health?.status !== 'ok' || health?.service !== 'block-topia-server') {
    throw new Error('Unable to verify the multiplayer server. Please retry.');
  }
  if (health.client_protocol === '0.17') return new URL('client/colyseus.js', base).href;
  // Old servers do not advertise a protocol. Keep them playable during rollout
  // and rollback; this version is the last client on the existing 0.16 line.
  if (health.client_protocol == null || health.client_protocol === '0.16') {
    return 'https://unpkg.com/colyseus.js@0.16.22/dist/colyseus.js';
  }
  throw new Error('The multiplayer server has changed. Refresh the game to reconnect.');
}

export async function loadColyseusClient(endpoint) {
  const base = endpoint.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:').replace(/\/?$/, '/');
  const response = await fetch(new URL('health', base), { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Multiplayer server unavailable. Please retry.');
  const src = clientScriptFor(endpoint, await response.json());
  if (!pendingScripts.has(src)) {
    const pending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => finish(new Error('Multiplayer client download timed out. Please retry.')), 10000);
      function finish(error) {
        clearTimeout(timeout);
        script.onload = script.onerror = null;
        script.remove();
        if (error) reject(error); else resolve(window.Colyseus);
      }
      script.onload = () => finish(typeof window.Colyseus?.Client === 'function' ? null : new Error('Multiplayer client unavailable.'));
      script.onerror = () => finish(new Error('Multiplayer client download failed. Please retry.'));
      script.src = src;
      document.head.append(script);
    });
    pendingScripts.set(src, pending);
    pending.catch(() => pendingScripts.delete(src));
  }
  return pendingScripts.get(src);
}
