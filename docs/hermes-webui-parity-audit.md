# Hermes WebUI Parity Audit

This repo currently vendors the `nesquena/hermes-webui` shell, but only a subset of upstream Hermes WebUI behavior is wired through the local Hermes backend.

## Parity matrix

| Feature | Upstream hermes-webui behavior | Current repo support | Backend endpoint used | Status | Required work |
|---|---|---|---|---|---|
| chat | Full chat workflow integrated with Hermes runtime | Chat works through Hermes backend | `POST /api/hermes/chat` | working | Keep reply/action/tool shape stable for UI |
| streaming/SSE | Token streaming and live tool output updates | No SSE stream path exposed | N/A | missing | Add streaming endpoint and adapter stream consumer |
| sessions | Persistent multi-session chat history | Persistent backend sessions added for WebUI session IDs/messages | `/api/hermes/sessions*` | partial | Add rename/delete/search session UX and multi-tab state handling |
| workspace file browser | Browse repo tree from UI | Adapter maps workspace list/read and status panel shows sample entries | `GET /api/hermes/files/list`, `GET /api/hermes/files/read` | partial | Add full tree explorer UI interactions and file open actions |
| file preview | Open file content in UI | Adapter route mapping exists; content can be fetched | `GET /api/hermes/files/read` | partial | Render full preview panel, syntax modes, large-file pagination |
| file edit/create/delete | Edit files from UI with guardrails | Only patch flow is supported; no direct browser write path | `POST /api/hermes/patch/preview`, `/patch/apply`, `/patch/rollback` | partial | Build editor-to-patch operation pipeline UI and approval UX |
| tool call cards | Display tool/action results per assistant message | Tool result cards now render from `toolResults` | `POST /api/hermes/chat` response `toolResults` | working | Improve card detail drilldown and pagination |
| slash commands | Command palette/slash tools | `/websearch` wired in runtime | `POST /api/hermes/webcrawl/search` | partial | Add more slash commands and discoverability |
| memory | Read/write long-term memory | Read mapping present; merge exists backend-side | `GET /api/hermes/memory`, `POST /api/hermes/memory/merge` | partial | Add memory panel editing and scoped patch operations |
| skills | Skill catalog and runner | Explicitly marked not implemented in adapter/backend parity map | N/A | missing | Implement `server/hermes/skill-loader.js` + API routes + UI panel |
| tasks/cron | Task scheduling/cron controls | Task planning and job routes exist, no cron panel parity | `/api/hermes/task/plan`, `/api/hermes/jobs/*` | partial | Add cron/task schedule persistence and UI controls |
| profiles | Agent profiles/personas | No profile backend routes | N/A | missing | Add profile store/routes and profile selector UI |
| model selector | Model list and active model controls | Model list is available; adapter reads selected model | `GET /api/hermes/models` | partial | Add persisted model selector UI and model-switch control center |
| attachments | Upload/attach files/images | No attachment ingestion path | N/A | missing | Add upload endpoints, storage, and adapter wiring |
| voice input | Mic/voice-to-text chat input | No voice pipeline | N/A | missing | Add browser capture + STT backend integration |
| settings/control center | Central runtime/admin controls | Limited policy/status surfaced | `/api/hermes/models`, `/api/hermes/policy`, `/api/hermes/swarm`, `/api/hermes/webui/capabilities` | partial | Build full control center panel parity |
| websearch/webcrawl | Search/fetch/crawl/rss from UI | Websearch mapping and existing webcrawl suite available | `/api/hermes/webcrawl/search`, plus `/find-updates`, `/fetch`, `/crawl`, `/rss`, `/compare`, `/topics` | working | Expand UI controls for non-search webcrawl actions |
| repo tools | Repo list/active/switch/register/clone | Existing backend routes; adapter currently uses repo status surfaces | `/api/hermes/repos*` | partial | Add explicit repo tool cards/panel actions |
| patch preview/apply/rollback | Safe patch workflow with approval | Supported via existing backend endpoints | `/api/hermes/patch/preview`, `/api/hermes/patch/apply`, `/api/hermes/patch/rollback` | working | Surface full preview diff UI and approval prompts |
| git tools | Status/diff/branch/commit/push workflow | Backend routes available, not fully represented in WebUI shell panels | `/api/hermes/git/*` | partial | Add git panel and operation cards |
| Brain admin integration | Brain status/model/npcs/logs/chat integration | Working through adapter for Brain surface | `/api/brain/status`, `/api/brain/model`, `/api/brain/npcs`, `/api/brain/health`, `/api/brain/logs`, `/api/brain/chat` | working | Add richer Brain panel parity controls |

## Current honesty policy

- Vendored shell != full upstream feature parity.
- Unsupported areas are explicitly marked `missing` or `partial` in `/api/hermes/webui/capabilities` and adapter capability maps.
- File modifications must continue through Hermes patch flow, not direct browser writes.
