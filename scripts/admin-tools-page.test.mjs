import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../admin-tools.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../js/admin-blocktopia-tools.js', import.meta.url), 'utf8');

test('admin tools includes the standard site shell without a naked empty placeholder', () => {
  assert.match(html, /<link rel="stylesheet" href="\/css\/wiki\.css">/);
  assert.match(html, /<body class="page-admin page-standard-shell">/);
  assert.match(html, /<main id="content" role="main">/);
  assert.match(html, /src="\/js\/site-shell\.js"/);
  assert.match(html, /src="\/js\/admin-blocktopia-tools\.js"/);
  assert.doesNotMatch(html, /<div class="admin-page"><\/div>/);
});

test('every admin script DOM dependency exists as exactly one element', () => {
  const ids = [
    'access-state', 'refresh-auth-state', 'admin-panel',
    'arcade-grant-form', 'admin-telegram-username', 'admin-telegram-id',
    'arcade-target-telegram-id', 'arcade-grant-xp', 'arcade-grant-reason',
    'arcade-result-state', 'arcade-result-json',
    'bt-grant-form', 'bt-target-telegram-id', 'bt-grant-xp', 'bt-grant-reason',
    'bt-result-state', 'bt-result-json',
  ];
  for (const id of ids) {
    assert.match(script, new RegExp("getElementById\\('"+id+"'\\)"));
    const matches = html.match(new RegExp('id="'+id+'"', 'g')) || [];
    assert.equal(matches.length, 1, id + ' must appear exactly once');
  }
});

test('grants remain hidden until verified API admin access and use signed Telegram identity', () => {
  assert.match(html, /id="admin-panel" class="hidden"/);
  assert.match(script, /accessPayload\.admin_allowlisted/);
  assert.match(script, /postJson\('\/admin\/blocktopia\/access'/);
  assert.match(script, /telegram_auth: telegramAuth/);
  assert.match(script, /postJson\('\/admin\/arcade\/grant-xp'/);
  assert.match(script, /postJson\('\/admin\/blocktopia\/grant-xp'/);
  assert.doesNotMatch(html, /X-Admin-Secret|admin-secret/i);
  assert.match(html, /Arcade XP counts towards the Block Topia multiplayer entry requirement/);
  assert.doesNotMatch(html, /5,000 XP|5000 XP/);
});

function createAdminHarness({ restoredId = '222222222', cachedId = '111111111', serverId = restoredId } = {}) {
  const ids = [
    'access-state', 'refresh-auth-state', 'admin-panel', 'arcade-grant-form',
    'admin-telegram-username', 'admin-telegram-id', 'arcade-target-telegram-id',
    'arcade-grant-xp', 'arcade-grant-reason', 'arcade-result-state',
    'arcade-result-json', 'bt-grant-form', 'bt-target-telegram-id',
    'bt-grant-xp', 'bt-grant-reason', 'bt-result-state', 'bt-result-json',
  ];
  const nodes = new Map(ids.map((id) => {
    const classes = new Set(id === 'admin-panel' ? ['hidden'] : []);
    return [id, {
      value: '',
      textContent: '',
      className: '',
      handlers: {},
      classList: {
        add: (value) => classes.add(value),
        remove: (value) => classes.delete(value),
        contains: (value) => classes.has(value),
      },
      addEventListener(event, handler) { this.handlers[event] = handler; },
    }];
  }));
  const grantRequests = [];
  let currentId = restoredId;
  const document = {
    readyState: 'complete',
    visibilityState: 'visible',
    getElementById: (id) => nodes.get(id) || null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const window = {
    MOONBOYS_API: { BASE_URL: 'https://api.example.test' },
    MOONBOYS_IDENTITY: {
      getSyncState: () => ({ linked: true }),
      getTelegramId: () => cachedId,
      getTelegramAuthStatus: () => ({ expired: false }),
      getSignedTelegramAuth: () => null,
      getFreshTelegramAuth: async () => ({ id: currentId, username: 'reviewer', hash: 'valid', auth_date: '1000' }),
    },
    addEventListener: () => {},
  };
  async function fetch(_url, init) {
    const body = JSON.parse(init.body);
    if (_url.endsWith('/admin/blocktopia/access')) {
      return { ok: true, status: 200, json: async () => ({ admin_allowlisted: true, telegram_id: serverId }) };
    }
    grantRequests.push({ url: _url, body });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  }
  runInNewContext(script, { window, document, fetch });
  return {
    nodes,
    grantRequests,
    setRestoredId(id) { currentId = id; },
    async flush() {
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test('restored admin identity, not a stale cached identity, fills recipient fields', async () => {
  const app = createAdminHarness();
  await app.flush();
  assert.equal(app.nodes.get('admin-telegram-id').value, '222222222');
  assert.equal(app.nodes.get('arcade-target-telegram-id').value, '222222222');
  assert.equal(app.nodes.get('bt-target-telegram-id').value, '222222222');
  assert.equal(app.nodes.get('admin-panel').classList.contains('hidden'), false);
  app.nodes.get('arcade-grant-xp').value = '10';
  app.nodes.get('arcade-grant-reason').value = 'test';
  await app.nodes.get('arcade-grant-form').handlers.submit({ preventDefault() {} });
  assert.equal(app.grantRequests.length, 1);
  assert.equal(app.grantRequests[0].body.telegram_id, '222222222');
  assert.equal(app.grantRequests[0].body.telegram_auth.id, '222222222');
});

test('account switch during grant aborts before contacting the grant endpoint', async () => {
  const app = createAdminHarness();
  await app.flush();
  app.nodes.get('bt-grant-xp').value = '10';
  app.nodes.get('bt-grant-reason').value = 'test';
  app.setRestoredId('333333333');
  await app.nodes.get('bt-grant-form').handlers.submit({ preventDefault() {} });
  assert.equal(app.grantRequests.length, 0);
  assert.equal(app.nodes.get('admin-panel').classList.contains('hidden'), true);
  assert.match(app.nodes.get('access-state').textContent, /account changed/i);
});

test('mismatched verified server response never unlocks grants', async () => {
  const app = createAdminHarness({ restoredId: '222222222', serverId: '333333333' });
  await app.flush();
  assert.equal(app.nodes.get('admin-panel').classList.contains('hidden'), true);
  assert.equal(app.nodes.get('arcade-target-telegram-id').value, '');
  assert.equal(app.nodes.get('bt-target-telegram-id').value, '');
});
