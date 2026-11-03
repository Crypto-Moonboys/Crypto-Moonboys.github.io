-- TAG RUN V2 PR2: DISPOSABLE/OFFLINE ACCOUNTING REHEARSAL ONLY.
-- This migration is an ADDITIVE proposal, not an instruction to apply to live D1.
-- No signer, spending authority, approved donation, final payout, or fund
-- reservation can be represented by any of these three tables.
-- Migration 104 remains the sole production observation authority.

-- Record immutable *unverified* evidence packages to allow offline scrutiny of
-- source chain transaction and donor intent. Never infer donations from a
-- positive wallet balance or a single memo. No 'approved' state is available.
CREATE TABLE IF NOT EXISTS tag_run_v2_funding_evidence_rehearsal (
  evidence_id TEXT PRIMARY KEY CHECK(length(evidence_id)=64 AND evidence_id NOT GLOB '*[^0-9a-f]*'),
  asset_key TEXT NOT NULL REFERENCES tag_run_v2_assets(asset_key),
  chain_id TEXT NOT NULL,
  global_action_seq TEXT NOT NULL,
  transaction_id TEXT NOT NULL CHECK(length(transaction_id)=64 AND transaction_id NOT GLOB '*[^0-9a-f]*'),
  irreversible_block_num INTEGER NOT NULL CHECK(irreversible_block_num>0),
  block_id TEXT NOT NULL CHECK(length(block_id)=64 AND block_id NOT GLOB '*[^0-9a-f]*'),
  donor_account TEXT NOT NULL,
  recipient_account TEXT NOT NULL CHECK(recipient_account='isthatajoint'),
  units TEXT NOT NULL CHECK(length(units) BETWEEN 1 AND 78 AND units NOT GLOB '*[^0-9]*'
    AND (units='0' OR substr(units,1,1)!='0')),
  donor_intent_digest TEXT NOT NULL CHECK(length(donor_intent_digest)=64 AND donor_intent_digest NOT GLOB '*[^0-9a-f]*'),
  custody_review_digest TEXT NOT NULL CHECK(length(custody_review_digest)=64 AND custody_review_digest NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chain_id,global_action_seq)
);

-- Irreversible block and balance arithmetic are rehearsal inputs, not verified
-- custody or approved funds. All values must be independently established;
-- onchain vs excluded + reserved arithmetic is checked in JS BigInt.
CREATE TABLE IF NOT EXISTS tag_run_v2_snapshot_evidence_rehearsal (
  snapshot_id TEXT PRIMARY KEY CHECK(length(snapshot_id)=64 AND snapshot_id NOT GLOB '*[^0-9a-f]*'),
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL CHECK(day_key GLOB '????-??-??'),
  asset_key TEXT NOT NULL REFERENCES tag_run_v2_assets(asset_key),
  irreversible_block_num INTEGER NOT NULL CHECK(irreversible_block_num>0),
  block_id TEXT NOT NULL CHECK(length(block_id)=64 AND block_id NOT GLOB '*[^0-9a-f]*'),
  onchain_units TEXT NOT NULL CHECK(length(onchain_units) BETWEEN 1 AND 78 AND onchain_units NOT GLOB '*[^0-9]*'),
  reserved_units TEXT NOT NULL CHECK(length(reserved_units) BETWEEN 1 AND 78 AND reserved_units NOT GLOB '*[^0-9]*'),
  excluded_units TEXT NOT NULL CHECK(length(excluded_units) BETWEEN 1 AND 78 AND excluded_units NOT GLOB '*[^0-9]*'),
  available_units TEXT NOT NULL CHECK(length(available_units) BETWEEN 1 AND 78 AND available_units NOT GLOB '*[^0-9]*'),
  five_percent_units TEXT NOT NULL CHECK(length(five_percent_units) BETWEEN 1 AND 78 AND five_percent_units NOT GLOB '*[^0-9]*'),
  evidence_digest TEXT NOT NULL CHECK(length(evidence_digest)=64 AND evidence_digest NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chat_id,day_key,asset_key)
);

-- Every row is explicitly NOT claimable; no transition or paid state exists.
-- Recipient is FROZEN in this record rather than re-read from /rain on retry.
-- Hash includes campaign/day/asset/slot/member/amount/account/digests, not a
-- chain transaction identity and not a permission to spend. No payout executor
-- reads this table; do not add any runtime routes or Worker bindings to it.
CREATE TABLE IF NOT EXISTS tag_run_v2_payout_intents_rehearsal (
  intent_key TEXT PRIMARY KEY CHECK(length(intent_key)=64 AND intent_key NOT GLOB '*[^0-9a-f]*'),
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL CHECK(day_key GLOB '????-??-??'),
  asset_key TEXT NOT NULL REFERENCES tag_run_v2_assets(asset_key),
  bundle_index INTEGER NOT NULL CHECK(bundle_index BETWEEN 0 AND 19),
  telegram_id TEXT NOT NULL,
  destination_account TEXT NOT NULL,
  destination_digest TEXT NOT NULL CHECK(length(destination_digest)=64 AND destination_digest NOT GLOB '*[^0-9a-f]*'),
  amount_units TEXT NOT NULL CHECK(length(amount_units) BETWEEN 1 AND 78 AND amount_units NOT GLOB '*[^0-9]*' AND amount_units!='0'),
  snapshot_digest TEXT NOT NULL CHECK(length(snapshot_digest)=64 AND snapshot_digest NOT GLOB '*[^0-9a-f]*'),
  source_receipts_digest TEXT NOT NULL CHECK(length(source_receipts_digest)=64 AND source_receipts_digest NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL DEFAULT 'simulation_only' CHECK(status='simulation_only'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chat_id,day_key,asset_key,bundle_index)
);
CREATE INDEX IF NOT EXISTS idx_tag_run_v2_rehearsal_member
  ON tag_run_v2_payout_intents_rehearsal(chat_id,telegram_id,day_key);

-- Rehearsal evidence is append-only: a second attempt either matches the
-- existing exact values (checked by JS), or must fail. No mutation can turn
-- a preview into a funded obligation or rewrite an approved destination.
CREATE TRIGGER IF NOT EXISTS tag_run_v2_funding_rehearsal_no_update
  BEFORE UPDATE ON tag_run_v2_funding_evidence_rehearsal
  BEGIN SELECT RAISE(ABORT, 'immutable_rehearsal_funding'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_funding_rehearsal_no_delete
  BEFORE DELETE ON tag_run_v2_funding_evidence_rehearsal
  BEGIN SELECT RAISE(ABORT, 'immutable_rehearsal_funding'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_snapshot_rehearsal_no_update
  BEFORE UPDATE ON tag_run_v2_snapshot_evidence_rehearsal
  BEGIN SELECT RAISE(ABORT, 'immutable_rehearsal_snapshot'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_snapshot_rehearsal_no_delete
  BEFORE DELETE ON tag_run_v2_snapshot_evidence_rehearsal
  BEGIN SELECT RAISE(ABORT, 'immutable_rehearsal_snapshot'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_rehearsal_no_update
  BEFORE UPDATE ON tag_run_v2_payout_intents_rehearsal
  BEGIN SELECT RAISE(ABORT, 'immutable_rehearsal_intent'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_rehearsal_no_delete
  BEFORE DELETE ON tag_run_v2_payout_intents_rehearsal
  BEGIN SELECT RAISE(ABORT, 'immutable_rehearsal_intent'); END;
