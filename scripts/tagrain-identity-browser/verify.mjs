import { PublicKey } from '@greymass/eosio';

export function keysMatch(recoveredKey, expectedKey) {
  if (!recoveredKey || !expectedKey) return false;
  try {
    return PublicKey.from(recoveredKey).equals(PublicKey.from(expectedKey));
  } catch {
    return false;
  }
}

export function assertTagrainIdentity({ actor, permission, recoveredKey, expectedKey, chainId, expectedChainId, verifiedAccount }) {
  if (String(chainId).toLowerCase() !== expectedChainId.toLowerCase()) throw new Error('Wrong chain');
  if (String(actor) !== 'isthatajoint' || String(permission) !== 'tagrain') throw new Error('Wrong account or permission');
  if (!verifiedAccount) throw new Error('On-chain proof verification missing');
  if (!keysMatch(recoveredKey, expectedKey)) throw new Error('Wrong signing key');
  return true;
}
