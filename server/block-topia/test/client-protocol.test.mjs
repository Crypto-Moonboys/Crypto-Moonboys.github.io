import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientScriptFor } from '../../../games/block-topia/colyseus-client.mjs';

test('rollout selects only the SDK matching a verified server protocol', () => {
  const health = { status: 'ok', service: 'block-topia-server' };
  assert.equal(clientScriptFor('wss://game.cryptomoonboys.com', health), 'https://unpkg.com/colyseus.js@0.16.22/dist/colyseus.js');
  assert.equal(clientScriptFor('wss://game.cryptomoonboys.com', { ...health, client_protocol: '0.17' }), 'https://game.cryptomoonboys.com/client/colyseus.js');
  assert.equal(clientScriptFor('ws://localhost:2567', { ...health, client_protocol: '0.17' }), 'http://localhost:2567/client/colyseus.js');
  assert.throws(() => clientScriptFor('wss://game.cryptomoonboys.com', { ...health, client_protocol: '0.18' }), /Refresh/);
  assert.throws(() => clientScriptFor('wss://game.cryptomoonboys.com', {}), /verify/);
});
