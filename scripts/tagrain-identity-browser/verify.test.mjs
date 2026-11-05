import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTagrainIdentity } from './verify.mjs';
const valid = {
  actor: 'isthatajoint', permission: 'tagrain',
  recoveredKey: 'EOS_TEST_KEY', expectedKey: 'EOS_TEST_KEY',
  chainId: '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4',
  expectedChainId: '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4',
  verifiedAccount: {account_name:'isthatajoint'}
};
test('valid verified identity accepted',()=>assert.equal(assertTagrainIdentity(valid),true));
for(const [label,override] of [
  ['wrong account',{actor:'attacker'}],
  ['wrong permission',{permission:'active'}],
  ['wrong key',{recoveredKey:'EOS_ATTACKER'}],
  ['missing key',{recoveredKey:null}],
  ['wrong chain',{chainId:'0'.repeat(64)}],
  ['unverified proof',{verifiedAccount:null}],
]) test(label+' rejected',()=>assert.throws(()=>assertTagrainIdentity({...valid,...override})));
