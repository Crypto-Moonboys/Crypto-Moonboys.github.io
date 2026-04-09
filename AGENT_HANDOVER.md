# 🤖 Agent Handover — Crypto Moonboys Wiki

## 📌 Repository Status

**Version:** v1.0.0  
**Status:** Stable & Production Ready  

This repository represents a deterministic, self-evolving lore ecosystem. All core systems have been stabilized and validated.

## 🧠 Core Systems

### 1. Generated Assets
The following files are authoritative and must remain consistent with their generators:

- `js/wiki-index.json`
- `js/entity-map.json`
- `js/entity-graph.json`
- `js/link-graph.json`
- `js/link-map.json`
- `js/content-gaps.json`
- `js/expansion-plan.json`
- `js/page-drafts.json`
- `js/draft-index.json`
- `js/growth-priority.json`
- `js/site-stats.json`
- `sitemap.xml`

### 2. Deterministic Principles
- No randomness in generation.
- Same input must always produce the same output.
- Frontend logic (`wiki.js`) must remain aligned with generated data.
- Avoid manual overrides of generated assets.

### 3. Branding Consistency
Ensure consistent usage of canonical names:
- **GraffPUNKS**
- **HODL Wars**
- **HODL Warriors**
- **Crypto Moonboys**

### 4. Validation Requirements
Before any change is merged, run:

```bash
node scripts/validate-generated-assets.js
node scripts/smoke-test.js
