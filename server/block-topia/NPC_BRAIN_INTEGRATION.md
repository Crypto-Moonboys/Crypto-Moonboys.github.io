# Block Topia NPC Brain Integration

## Current NPC Brain Service

Runs locally on the VPS:

http://127.0.0.1:8899

PM2 app:

moonboys-npc-brain

The live 2-player Block Topia server remains separate on port 2567.

## Purpose

This service is the first NPC brain layer for Block Topia.

It reads:

- Master Source of Truth:
  /opt/moonboys-npc-brain/source/master-source-of-truth.md

- NPC profiles:
  /opt/moonboys-npc-brain/npcs/*.json

- Training memory:
  /opt/moonboys-npc-brain/memory/npc-training.jsonl

- Player memory:
  /opt/moonboys-npc-brain/memory/conversations/<playerId>.jsonl

## Safe Rules

NPCs must not:

- Grant XP
- Grant NFTs
- Fake rewards
- Invent live quests
- Claim unfinished systems are live
- Expose OpenAI keys
- Call public APIs from the browser

NPCs may:

- Speak in-world
- Explain lore
- Give hints
- Warn players
- Remember player conversations
- Follow the Master Source of Truth

## Endpoints

### Health

GET /health

Example:

curl -s http://127.0.0.1:8899/health

### List NPCs

GET /npc/list

Example:

curl -s http://127.0.0.1:8899/npc/list

### Ask NPC

POST /npc/respond

Example:

curl -s http://127.0.0.1:8899/npc/respond \
  -H "Content-Type: application/json" \
  -d '{"playerId":"test_player_1","npcId":"signal_rick","playerMessage":"who are you?"}'

### Train NPC Brain

POST /npc/train

Example:

curl -s http://127.0.0.1:8899/npc/train \
  -H "Content-Type: application/json" \
  -d '{"source":"GK","tag":"world","note":"Block Topia is alive. NPCs must stay inside canon."}'

### Read Player Memory

GET /npc/memory?playerId=<id>

Example:

curl -s "http://127.0.0.1:8899/npc/memory?playerId=test_player_1"

## Existing NPCs

- default_npc
- signal_rick
- block_guide
- xp_keeper
- lore_rat

## Local CLI

Use:

npc-brain status
npc-brain list
npc-brain ask signal_rick test_player_1 "who are you?"
npc-brain train world "Block Topia is alive."
npc-brain memory test_player_1

## Future Game Integration

The Block Topia server should call the NPC Brain from server-side code only.

Never call the NPC brain directly from frontend browser code.

Recommended flow:

Client player interacts with NPC
→ Block Topia server receives interaction
→ Block Topia server POSTs to http://127.0.0.1:8899/npc/respond
→ Block Topia server sends NPC reply back to player

## OpenAI Mode

OpenAI is OFF by default.

Control command:

npc-brain set-key
npc-brain enable-openai
npc-brain disable-openai
npc-brain set-model gpt-5.5

OpenAI should only be enabled during controlled live AI tests.
