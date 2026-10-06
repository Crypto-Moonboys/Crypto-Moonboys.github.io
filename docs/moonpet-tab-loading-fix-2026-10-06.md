# Moonpet tab loading repair — 6 October 2026

## Defect

Core startup deliberately loads Home first. Other tab data was only requested after navigation. In addition, Missions always requested its partial projection even after a full snapshot had loaded, making later visits to other tabs repeat full hydration.

## Change

- Start one background full projection shortly after core Home renders; retain interactive Home controls.
- Share the in-flight projection across tabs, with no additional read on subsequent navigation once it installs.
- Keep full snapshots full during Missions refreshes, cooldown/care reads and actions.
- Cancel speculative requests on a newer state generation, including fetch/body reads when cancellation is ignored by the transport.
- Preserve existing authority checks, retry limits, request deadlines and uncertainty locks. Background warmup waits are bounded; failure leaves Home usable and foreground retry available.
- Missions deep links retain their lighter initial projection.

## Validation

Real client regression tests cover loaded Missions refresh/action paths, shared warmup, refresh guards, cancellation and failure. Chromium regressions cover Home availability during a delayed full response, every tab, and Missions Refresh at 390×844 and 360×640. Full Moonpet and required CI checks must pass before merge.

## Release

Client/launch token: `20261006-tab-warmup-v1`. The art loader remains on its previous unchanged version. GitHub Pages publishes frontend changes after merge; deploy moonboys-api to publish its updated Telegram launch URL. No migration or production data repair is required.

## Limit

This removes repeated hydration and starts the initial full read earlier. It does not establish a production latency measurement or eliminate the first wait when a player immediately opens an unloaded tab. The full backend recovery work is unchanged.
