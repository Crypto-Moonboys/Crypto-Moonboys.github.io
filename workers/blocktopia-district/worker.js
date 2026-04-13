export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/blocktopia-district/state' && request.method === 'GET') {
      const data = await env.DISTRICTS.get('state', { type: 'json' }) || {
        districts: {
          'neon-exchange': 50,
          'mural-sector': 50,
          'dead-rail': 50,
          'black-fork-alley': 50,
          'chain-plaza': 50,
          'moon-gate': 50
        },
        faction: 'GraffPUNKS'
      };
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/api/blocktopia-district/update' && request.method === 'POST') {
      const body = await request.json();
      const state = await env.DISTRICTS.get('state', { type: 'json' }) || { districts: {} };
      const { districtId, delta } = body;

      state.districts[districtId] = Math.min(100, Math.max(0, (state.districts[districtId] || 0) + delta));
      await env.DISTRICTS.put('state', JSON.stringify(state));

      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('Not Found', { status: 404 });
  }
};