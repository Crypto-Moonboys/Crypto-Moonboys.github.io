import { Link } from 'anchor-link';
import BrowserTransport from 'anchor-link-browser-transport';

const CHAIN_ID = '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4';
const ACTOR = 'isthatajoint';
const PERMISSION = 'tagrain';
const EXPECTED_KEY = 'EOS8i9TNBsg1LYGntvSDKfzVhK3dmXZgkNbRPJ89n9fMMLC8iunGk';
const status = document.getElementById('status');
const button = document.getElementById('verify');
button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Waiting for Anchor identity approval...';
  try {
    const link = new Link({
      chains: [{ chainId: CHAIN_ID, nodeUrl: 'https://wax.greymass.com' }],
      transport: new BrowserTransport(),
    });
    // Unlike login(identifier), identify enforces a specific account and permission.
    const proof = await link.identify({ actor: ACTOR, permission: PERMISSION });
    const signer = proof.res?.signer;
    const recovered = String(proof.signerKey ?? '');
    if (String(signer?.actor) !== ACTOR || String(signer?.permission) !== PERMISSION) {
      throw new Error('Unexpected identity signer');
    }
    if (recovered !== EXPECTED_KEY) throw new Error('Recovered key does not match registered TAGRAIN key');
    status.textContent = 'PASS: Anchor identity proof verified for isthatajoint@tagrain. No transaction broadcast.';
  } catch (error) {
    status.textContent = 'FAIL: ' + (error instanceof Error ? error.message : 'Identity verification failed');
  } finally {
    button.disabled = false;
  }
});
