# Mobile radio: HTTPS redirect repair

The reported `RADIO CONNECTION LOST [FORMAT / 4]` is reproducible when a secure
player receives Radiojar's HTTP node redirect. On 2026-09-28, GET requests to
`https://stream.radiojar.com/2qm1fc5kb` using desktop, iPhone and Android user agents
all returned a 302 to `http://nXX.radiojar.com/2qm1fc5kb?...`. The node served
`audio/mpeg` when the same destination was requested over HTTPS. A temporary
sample was identified as 128 kbps, 44.1 kHz stereo MP3; no broadcast audio is
included in this repository.

Desktop playback can tolerate or upgrade the HTTP hop. Strict mobile media
policies reject it and can report media error 4 even though the audio codec is
valid. Reloading the same entry URL repeats the redirect. A page-level upgrade
policy did not reliably repair redirected media in the reproduction.

## Change

- Add public `GET /radio/stream` to the existing `moonboys-api` Worker.
- Resolve the fixed GraffPUNKS station server-side, upgrading every allowed
  Radiojar node hop to HTTPS. Do not send a redirect to the media element.
- Accept only the known station path and Radiojar stream/node hostnames. Ignore
  incoming query parameters; never forward user credentials, cookies, Range or
  ICY metadata requests. This is not a general-purpose proxy.
- Bound setup to four redirects and 30 seconds. Cancel discarded upstream
  bodies. Pass successful MP3 bodies through without buffering, caching or
  imposing the setup timeout on the ongoing broadcast. Client body cancellation
  cancels the upstream body. Return retryable 502 on setup/upstream failure.
- Point both Moonpet and Arcade radio players at the same HTTPS Worker route.
  Moonpet's existing autoplay permission, first-gesture retry, saved Off,
  generation guard and error/reconnect behavior remain in place.

Each active listener now has a streaming Worker request. The route performs no
D1 reads/writes and does not award XP or affect gameplay/leaderboards.

## Verification

`scripts/radio-stream.test.mjs` exercises the deployment entry point, redirect
upgrades/allowlist/bounds, streaming cancellation, failure/retry, credential
isolation, and method handling with no D1 access.

`scripts/moonpet-radio-browser.test.mjs` uses native browser audio at mobile size.
It disables Chrome's automatic mixed-media upgrades and enforces strict mixed
content handling. The old direct URL reproduces FORMAT / 4; the production audio
element through the deployed Worker handler plays and stops without exposing a
Radiojar redirect. Synthetic local audio keeps CI independent of station uptime.
Existing permitted autoplay, first tap, direct icon, saved Off and error cases
also run. This is browser policy coverage, not a physical iPhone/Android test.

Run the full `npm test` suite before merging.

## Deployment

Both the static Pages update and a `moonboys-api` deployment are required. No D1
migration or VPS restart. Deploy the Worker promptly after merging: the updated
radio URL will not work against the old Worker.

```bat
cd /d E:\GitHub\Crypto-Moonboys.github.io
git switch main
git pull --ff-only origin main
npm ci
node scripts/deploy-worker-with-provenance.mjs moonboys-api
```

Check `/health` and `/deployment-info`, and wait for Pages to publish the merged
HTML. Fully close and reopen the Telegram Mini App. Tap the radio icon on iPhone
and Android; confirm music plays, Off stops playback, saved Off survives reopen,
and a temporary connection loss can be retried. Check an Arcade radio as well.
