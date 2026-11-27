# Telegram support cases

Community members can open a direct message with `@WIKICOMSBOT` and send `/report` followed by the game or art builder page, the steps, and what went wrong. Use one report per issue. The bot checks current membership in the same configured Telegram group used by the site. Reports should contain no credentials, wallet recovery phrases, or private account details.

| Owner action | Result |
| --- | --- |
| **Look into it** or `LOOK #12` | The Brain reads the report and relevant source for a private diagnosis. |
| `/review 12 What about touchscreen?` | The Brain revises its findings and any proposed fix. An earlier approval button expires. |
| **Approve fix** or `FIX #12 3` | Queues the exact fix and file list shown in review revision `3`. |
| **Approve merge** | Authorizes merging the Codex-reviewed commit and running the normal website release workflow. GitHub rules and required checks still apply. |
| **Decline** or `DECLINE #12` | Closes a case before repair approval and sends the player a short closure notice. |
| `/resolved 12` | After GitHub reports a merge and the owner checks the live change, tells the player it is fixed. |

The owner receives private findings and Doctor status updates, including the PR link and any reason Doctor needs help. A website PR goes through the existing review, merge and release rules. The Brain routes account access, security, rewards, scoring and custody problems to the owner. The first release can propose fixes to existing, small game UI and Moonboy PFP Builder files. A change to `main` before Doctor starts requires a fresh review.

## Activate after GK approves the release

1. In a clean, updated website checkout, verify the current `wikicoms` migration state. Apply the reviewed `133_support_cases.sql` migration using the [Worker migration and release procedure](../workers/moonboys-api/README.md). Keep the existing Telegram webhook, group and secrets.
2. Configure the `moonboys-api` Worker with `SUPPORT_OWNER_TELEGRAM_ID` set to GK's numeric Telegram user ID and `SUPPORT_BRAIN_TOKEN` set to the shared random token stored on the Brain host. Use a Worker secret for the shared token. GK must have opened a direct chat with the bot so it can send notices.
3. Install the Brain host services. Set `SUPPORT_CASES_ENABLED=true` on the Worker when the host is ready and deploy through the existing provenance wrapper. The internal route uses `X-Doctor-Support-Token`. Without the feature flag and complete settings it returns 503.
4. Watch the Brain service journal while a community member submits a normal test report. Approve **Look into it**, request a follow-up, then decline the test. For an actual small UI issue, use **Approve fix**, verify the PR and its review, and check production before `/resolved`.

To pause intake, clear `SUPPORT_CASES_ENABLED` and stop the Brain support timer. Leave the D1 case records in place. If a website Doctor job has already been approved, inspect its queue and PR separately. The primary Doctor supervisor and the Brain recovery timer are independent of this support flow.

For Telegram merge approval on an existing installation, apply migration `134_support_merge_approval.sql`, deploy the matching Worker, and then update the Brain support bridge. An approval becomes stale if the reviewed commit changes. If GitHub blocks a merge, inspect the linked PR checks and rules.

## SAM Wiki drafts

HAY-MUM forwards validated editorial payloads through `/internal/sam-wiki-drafts`.
Set a separate `SAM_WIKI_DRAFT_TOKEN` on the Worker and in HAY-MUM Actions.
The intake credential can only submit drafts. The Brain service uses the existing
support credential to deliver notices and track work.

The owner receives the section excerpt, GitHub PR and reviewed revision in a
private WikicomsBot chat. **Edit** asks for instructions and starts a new Codex
review. **Merge** is available after Codex clears that revision and still needs
GitHub's required checks. **Leave** pauses the case. **Close** closes the linked
PR. If website main advances, SAM refreshes the proposed PR when the target page
is unchanged. The refreshed commit requires Codex and owner approval again. New
routes require an entry in the owner-approved Wiki publication register.
Changes to owned canon prose also use the website's existing GitHub approval
label. First Witness and NFT specialist pages use their dedicated review paths.

Apply migration `135_sam_wiki_drafts.sql` and deploy the reviewed Worker through
the normal release process. Set `SAM_WIKI_DRAFTS_ENABLED=true` only after the
Brain's separate SAM editorial timer is configured. The support repair queue
continues to use its original route.

### Test private Telegram delivery

After the Worker release, run **SAM Draft-Only Crawl** on HAY-MUM's `main`
with **Send a private Telegram delivery test** checked. The real D1 queue and
Brain timer deliver a single labelled message to the configured owner.
The Actions job waits for Telegram to acknowledge the send. The test has no
publication controls and does not create a Wiki PR or run the crawler.
A timeout means delivery was unconfirmed during the four-minute wait.
