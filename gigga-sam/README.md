# gigga-sam — Signal Generator

## What It Is

`gigga-sam` is a standalone Node.js signal-generation script that uses the OpenAI API to produce intelligence signals for the Crypto Moonboys Wiki. It is a local/CI tool — **not part of the live website runtime**.

## What It Does

`generate-signals.mjs` calls the OpenAI API to generate structured signals (entity scores, trend data, keyword banks, focus plans) that can be consumed by wiki tooling or the SAM publishing pipeline.

## Current Integration Status

**This script is NOT wired to the live website at runtime.**

It is not loaded by any HTML page, not called by any Cloudflare Worker, and not part of any CI pipeline by default. It must be run manually or integrated explicitly.

## Required Environment Variables

The following environment variables are required to run the script. **Do not commit secrets to source control.**

- `OPENAI_API_KEY` — Your OpenAI API key.

Set via shell export or a local `.env` file (not committed):

```bash
export OPENAI_API_KEY=sk-...
node gigga-sam/generate-signals.mjs
```

## How to Run

```bash
cd gigga-sam
npm install
node generate-signals.mjs
```

## ⚠️ Warning

> This is not part of the live website runtime unless wired by CI or an explicit script.
> Outputs from this tool must be manually published or integrated into the wiki pipeline.

## Future Integration Options

- **Scheduled signal generation** — Run on a cron schedule (e.g., GitHub Actions `schedule:`) to auto-publish signals each cycle.
- **Manual generation** — Run locally and commit output to the repo (e.g., `main-brain-export.json`).
- **Cloudflare Worker integration** — Expose generated signals via a Worker endpoint (requires careful secret management).
- **GitHub Action generation** — Wire as a `workflow_dispatch` action so maintainers can trigger a fresh signal run on demand.
