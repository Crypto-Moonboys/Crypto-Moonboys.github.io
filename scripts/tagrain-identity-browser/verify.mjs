export function assertTagrainIdentity({ actor, permission, recoveredKey, expectedKey, chainId, expectedChainId, verifiedAccount }) {
  if (String(chainId).toLowerCase() !== expectedChainId.toLowerCase()) throw new Error('Wrong chain');
  if (String(actor) !== 'isthatajoint' || String(permission) !== 'tagrain') throw new Error('Wrong account or permission');
  if (!verifiedAccount) throw new Error('On-chain proof verification missing');
  if (!recoveredKey || !expectedKey || String(recoveredKey) !== String(expectedKey)) throw new Error('Wrong signing key');
  return true;
}
