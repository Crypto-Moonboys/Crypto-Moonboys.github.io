# Summary
Briefly explain the exact change.

# Scope lock
- [ ] This PR changes only the files listed below.
- [ ] This PR does not include unrelated cleanup.
- [ ] This PR does not redesign UI unless explicitly requested.
- [ ] This PR does not change Worker/API routes unless listed below.
- [ ] This PR does not change VPS/server runtime unless listed below.

# Files changed
List every changed file and why.

# Runtime impact
Choose one:
- [ ] Static frontend only
- [ ] Worker/API change
- [ ] D1 migration
- [ ] VPS/server change
- [ ] GitHub Pages/workflow/docs only

# Deploy notes
Replace each `Yes / No` with a single value (`Yes` or `No`) for each line:
`GitHub Pages only` can be `Yes` only if `Worker deploy required`, `D1 migration required`, and `VPS restart required` are all `No`.
- Worker deploy required: Yes / No
- D1 migration required: Yes / No
- VPS restart required: Yes / No
- GitHub Pages only: Yes / No

# Tests run
Paste exact commands and results:
- [ ] git diff --check
- [ ] node --check changed JS files
- [ ] npm test
- [ ] other:

# Live verification needed
List the exact page and visible behavior to check after merge.

# Anti-drift checklist
- [ ] No fake live data added
- [ ] No stale placeholder copy added
- [ ] No dashboard player/live-feed drift
- [ ] No faction canon duplication
- [ ] No removed/retired game references
- [ ] No Worker/VPS deploy claim unless actually required

# Merge decision
Check exactly one:
- [ ] Ready to merge
- [ ] Hold merge
