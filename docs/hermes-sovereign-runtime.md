# Hermes Sovereign Runtime Architecture

Hermes now operates as a local sovereign agent runtime with real tooling.

## Core modules (`server/hermes`)
- `orchestrator.js`: routes high-level tasks to tools and role checks.
- `task-planner.js`: task classification for swarm roles.
- `agent-runtime.js`: role policies and NPC agent scope enforcement.
- `repo-indexer.js`: recursive repository index with ignored artifacts.
- `file-service.js`: safe list/read/search operations with path boundaries.
- `patch-engine.js`: diff preview, guarded patch apply, rollback snapshots.
- `git-operator.js`: guarded git branch/status/diff/commit/push operations.
- `command-runner.js`: queued allowlisted command execution with timeouts.
- `approval-gate.js`: approval queue for high-risk actions.
- `memory-store.js`: persistent operational memory and project truth.
- `swarm-registry.js`: role inventory for orchestrated multi-agent workflows.

## Safety model
- Normal chat mode: no writes.
- Agent edit mode: explicit mode + explicit confirmation for changes.
- Admin mode: intended for controlled deployment/runtime operations.
- NPC agent: restricted to NPC-related data/config and denied broader runtime edits.

## API surface (`api/hermes-api.js`)
- chat/model/policy routes
- task planning route
- index/file tools
- patch preview/apply/rollback
- git operations
- command queue operations
- approvals
- memory read/merge
- swarm view

## Deployment constraints
- Ollama remains localhost-only (`127.0.0.1`).
- Hermes backend should be deployed server-side (GitHub Pages is static).
- No direct public Ollama exposure.
