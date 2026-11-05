import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTagrainIdentity, keysMatch } from './verify.mjs';
import { PublicKey } from '@greymass/eosio';
const actualKey = 'EOS8i9TNBsg1LYGntvSDKfzVhK3dmXZgkNbRPJ89n9fMMLC8iunGk';
const valid = {
  actor: 'isthatajoint', permission: 'tagrain',
  recoveredKey: PublicKey.from(actualKey), expectedKey: actualKey,
  chainId: '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4',
  expectedChainId: '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4',
  verifiedAccount: {account_name:'isthatajoint'}
};
test('valid verified identity accepted',()=>assert.equal(assertTagrainIdentity(valid),true));
for(const [label,override] of [
  ['wrong account',{actor:'attacker'}],
  ['wrong permission',{permission:'active'}],
  ['wrong key',{recoveredKey:null}],
  ['missing key',{recoveredKey:null}],
  ['wrong chain',{chainId:'0'.repeat(64)}],
  ['unverified proof',{verifiedAccount:null}],
]) test(label+' rejected',()=>assert.throws(()=>assertTagrainIdentity({...valid,...override})));
test('parsed key object equals registered EOS key',()=>assert.equal(keysMatch(PublicKey.from(actualKey),actualKey),true));
test('PUB_K1 and EOS representations compare equal',()=>assert.equal(keysMatch(PublicKey.from(actualKey).toString(),actualKey),true));
test('invalid or altered expected key is rejected',()=>assert.equal(keysMatch(PublicKey.from(actualKey),actualKey.slice(0,-1)+'X'),false));
