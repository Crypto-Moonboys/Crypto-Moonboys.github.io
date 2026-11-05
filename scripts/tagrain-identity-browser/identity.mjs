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
    // login provides the identity scope required by Anchor Link. Verify the returned authority strictly.
    const proof = await link.login('tagraintest');
    const signer = proof.session?.auth;
    const recovered = proof.signerKey ?? proof.session?.publicKey;
    const recoveredText = recovered == null ? '' : String(recovered);
    const normalizedKey = recovered && typeof recovered.equals === 'function'
      ? recovered.equals(EXPECTED_KEY)
      : recoveredText === EXPECTED_KEY;
    if (String(signer?.actor) !== ACTOR || String(signer?.permission) !== PERMISSION) {
      throw new Error('Unexpected identity signer');
    }
    if (!normalizedKey) {
      throw new Error(recovered == null
        ? 'No signer public key returned by Anchor login'
        : 'Returned signer key does not match registered TAGRAIN key');
    }
    status.textContent = 'PASS: Anchor identity proof verified for isthatajoint@tagrain. No transaction broadcast.';
  } catch (error) {
    status.textContent = 'FAIL: ' + (error instanceof Error ? error.message : 'Identity verification failed');
  } finally {
    button.disabled = false;
  }
});
