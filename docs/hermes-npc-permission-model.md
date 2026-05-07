# Hermes and NPC Agent Permission Model

## 1) Normal Hermes chat
- Read/answer only.
- No file writes.
- No repo mutation.

## 2) Hermes agent edit mode
- Explicit mode for edits and system management.
- Requires explicit user instruction and `confirmEdit=true`.
- Main Hermes may manage/update NPC Agent rules, behavior, and configuration.
- Main Hermes may override NPC restrictions only when explicitly instructed by the user in agent edit mode.

## 3) NPC Agent scope
Allowed:
- NPC data updates
- NPC creation
- NPC profile/behavior/config updates

Not allowed:
- Website shell or page edits
- Repo-wide refactors
- Global runtime/shell changes
- Worker/API runtime edits unrelated to NPC data/config
- Arcade/Block Topia runtime edits unless the target file is explicitly NPC data/config

## Notes
- Public/admin chat API must proxy only to local Ollama at `127.0.0.1`.
- No direct public exposure of Ollama.
- The Brain advisor remains read-only for website/game/repo workflows, with live-write actions restricted to NPC Brain data workflows.
