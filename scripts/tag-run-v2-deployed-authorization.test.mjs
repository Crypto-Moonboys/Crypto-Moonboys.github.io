// Offline probe of PUBLIC deployed bytecode. No RPC, wallet, D1 or signing.
// The host stops at require_auth; reaching this checkpoint is NOT transfer success.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const HASH = 'c08fb0c42b5b71f3b4a5c17afdeacfd9ca7036b2c1efdbd80cd91c4ad6f00408';
const original = readFileSync(new URL('./fixtures/tag-run-v2/kingsofgraff-c08fb0c4.wasm', import.meta.url));
assert.equal(createHash('sha256').update(original).digest('hex'), HASH);

function readLeb(bytes, start) {
  let value = 0, shift = 0, at = start;
  for (;;) {
    assert.ok(at < bytes.length && shift <= 28, 'bounded uint32 LEB');
    const byte = bytes[at++];
    value += (byte & 127) * 2 ** shift;
    if (!(byte & 128)) return [value, at];
    shift += 7;
  }
}
function leb(value) {
  const bytes = [];
  do {
    const byte = value % 128;
    value = Math.floor(value / 128);
    bytes.push(byte | (value ? 128 : 0));
  } while (value);
  return Buffer.from(bytes);
}
function sections(bytes) {
  const found = [];
  for (let at = 8; at < bytes.length;) {
    const id = bytes[at++];
    const [size, start] = readLeb(bytes, at);
    assert.ok(start + size <= bytes.length, 'section fits binary');
    found.push({id, payload: bytes.subarray(start, start + size)});
    at = start + size;
  }
  return found;
}
// Export only existing memory 0, so host memcpy/read_action_data can access it.
// All instructions, imports, data, tables, globals and original exports stay intact.
function exposeMemory(bytes) {
  const parts = [bytes.subarray(0, 8)];
  for (const {id, payload} of sections(bytes)) {
    let next = payload;
    if (id === 7) {
      const [count, rest] = readLeb(payload, 0);
      const label = Buffer.from('__audit_memory');
      next = Buffer.concat([leb(count + 1), payload.subarray(rest),
        leb(label.length), label, Buffer.from([2, 0])]);
    }
    parts.push(Buffer.from([id]), leb(next.length), next);
  }
  return Buffer.concat(parts);
}
const instrumented = exposeMemory(original);
const module = new WebAssembly.Module(instrumented);
function eosName(value) {
  const alphabet = '.12345abcdefghijklmnopqrstuvwxyz';
  assert.match(value, /^[a-z1-5.]{1,12}$/);
  let encoded = 0n;
  for (let i = 0; i < 13; i++) {
    encoded = (encoded << BigInt(i === 12 ? 4 : 5)) |
      BigInt(i < value.length ? alphabet.indexOf(value[i]) : 0);
  }
  return encoded;
}
function transferData({from, to, units, precision, symbol, memo = ''}) {
  const fields = Buffer.alloc(32);
  fields.writeBigUInt64LE(eosName(from), 0);
  fields.writeBigUInt64LE(eosName(to), 8);
  fields.writeBigInt64LE(BigInt(units), 16);
  fields[24] = precision;
  fields.write(symbol, 25, 'ascii');
  const text = Buffer.from(memo);
  return Buffer.concat([fields, leb(text.length), text]);
}
function probe(options = {}) {
  const input = {from:'isthatajoint', to:'gkniftyheads', units:'1',
    precision:4, symbol:'LFGK', ...options};
  const data = transferData(input), calls = [];
  let instance;
  const memory = () => new Uint8Array(instance.exports.__audit_memory.buffer);
  const cString = ptr => {
    const bytes = memory(); let end = ptr;
    while (end < bytes.length && bytes[end]) end++;
    return Buffer.from(bytes.subarray(ptr, end)).toString('utf8');
  };
  const env = {};
  for (const entry of WebAssembly.Module.imports(module)) {
    assert.equal(entry.module, 'env');
    assert.equal(entry.kind, 'function');
    env[entry.name] = () => {
      calls.push({name:entry.name});
      throw Error('UNEXPECTED_HOST_CALL:' + entry.name);
    };
  }
  Object.assign(env, {
    abort() { throw Error('ABORT'); },
    eosio_assert(ok, ptr) { if (!ok) throw Error('ASSERT:' + cString(ptr)); },
    eosio_assert_code(ok, code) { if (!ok) throw Error('ASSERT_CODE:' + code); },
    action_data_size: () => data.length,
    read_action_data(ptr, length) {
      const count = Math.min(length, data.length);
      memory().set(data.subarray(0, count), ptr);
      return count;
    },
    memcpy(dst, src, count) { memory().copyWithin(dst, src, src + count); return dst; },
    memmove(dst, src, count) { memory().copyWithin(dst, src, src + count); return dst; },
    memset(dst, value, count) { memory().fill(value & 255, dst, dst + count); return dst; },
    require_auth(value) {
      const actor = BigInt.asUintN(64, value);
      calls.push({name:'require_auth', actor});
      // Simulated host policy: no real signature validation or chain execution.
      if (options.authorizedActor && actor === eosName(options.authorizedActor))
        throw Error('AUTH_CHECKPOINT_ONLY');
      throw Error('MISSING_AUTH');
    }
  });
  instance = new WebAssembly.Instance(module, {env});
  let outcome = 'RETURNED';
  try {
    instance.exports.apply(eosName('kingsofgraff'),
      eosName(options.code || 'kingsofgraff'), eosName('transfer'));
  } catch (error) { outcome = error.message; }
  return {outcome, calls};
}
function missingAuth(result, sender = 'isthatajoint') {
  assert.equal(result.outcome, 'MISSING_AUTH');
  assert.deepEqual(result.calls, [{name:'require_auth', actor:eosName(sender)}]);
}

test('public bytecode has the two-provider observed SHA-256 and validates', () => {
  assert.equal(original.length, 74562);
  assert.equal(WebAssembly.validate(original), true);
  assert.deepEqual(WebAssembly.Module.exports(new WebAssembly.Module(original)),
    [{name:'apply', kind:'function'}]);
});
test('local instrumentation changes only the export section and adds memory access', () => {
  const before = sections(original), after = sections(instrumented);
  assert.equal(before.length, after.length);
  for (let i = 0; i < before.length; i++) {
    assert.equal(before[i].id, after[i].id);
    if (before[i].id !== 7) assert.deepEqual(before[i].payload, after[i].payload);
    else {
      const [n, a] = readLeb(before[i].payload, 0);
      const [m, b] = readLeb(after[i].payload, 0);
      assert.equal(m, n + 1);
      assert.deepEqual(after[i].payload.subarray(b, b + before[i].payload.length - a),
        before[i].payload.subarray(a));
    }
  }
  assert.deepEqual(WebAssembly.Module.exports(module),
    [{name:'apply', kind:'function'}, {name:'__audit_memory', kind:'memory'}]);
});
test('LFGK reaches sender authorization before any token table or inline action', () => {
  missingAuth(probe());
});
test('DUMPIT under the same contract reaches the same sender authorization', () => {
  missingAuth(probe({symbol:'DUMPIT', precision:8}));
});
test('changing from changes the required actor to that exact sender', () => {
  missingAuth(probe({from:'gkniftyheads', to:'isthatajoint'}), 'gkniftyheads');
});
test('recipient authorization cannot substitute for sender authorization', () => {
  missingAuth(probe({authorizedActor:'gkniftyheads'}));
});
test('contract authorization cannot substitute for sender authorization', () => {
  missingAuth(probe({authorizedActor:'kingsofgraff'}));
});
test('amount, precision, symbol and long memo cannot skip sender authorization', () => {
  for (const input of [{units:'0'}, {units:'-1'}, {units:'4611686018427387903'},
    {precision:8, symbol:'DUMPIT'}, {memo:'x'.repeat(300)}]) missingAuth(probe(input));
});
test('self transfer rejects before authorization and any token-table access', () => {
  assert.deepEqual(probe({to:'isthatajoint'}),
    {outcome:'ASSERT:cannot transfer to self', calls:[]});
});
test('matching simulated sender reaches only a checkpoint, never transfer completion', () => {
  assert.deepEqual(probe({authorizedActor:'isthatajoint'}), {
    outcome:'AUTH_CHECKPOINT_ONLY',
    calls:[{name:'require_auth', actor:eosName('isthatajoint')}]
  });
});
test('a foreign-code notification does not dispatch this contract transfer', () => {
  assert.deepEqual(probe({code:'eosio.token'}), {outcome:'RETURNED', calls:[]});
});
