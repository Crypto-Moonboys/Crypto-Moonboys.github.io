-- OFFLINE TAG RUN V2 PR4 only. DO NOT place in workers/moonboys-api/migrations.
-- Load on disposable SQLite after migration 104 and the PR2 rehearsal fixture.
-- This journal records simulated lifecycle tests, NEVER real reservations or
-- confirmed transfers. No signer, ledger release authority or payable status.
CREATE TABLE IF NOT EXISTS tag_run_v2_lifecycle_events_rehearsal (
  -- Immutable, strictly increasing append order; timestamp and event ID
  -- are NOT reliable replay ordering keys. The offline writer inserts the
  -- next sequence in the SAME SQLite statement as the event.
  append_seq INTEGER NOT NULL UNIQUE
    CHECK(append_seq BETWEEN 1 AND 9007199254740991),
  event_id TEXT NOT NULL PRIMARY KEY
    CHECK(length(event_id)=64 AND event_id NOT GLOB '*[^0-9a-f]*'),
  intent_key TEXT NOT NULL
    REFERENCES tag_run_v2_payout_intents_rehearsal(intent_key),
  event_kind TEXT NOT NULL CHECK(event_kind IN (
    'simulate_hold','simulate_cancel','simulate_unknown','simulate_reconcile'
  )),
  amount_units TEXT NOT NULL CHECK(
    length(amount_units) BETWEEN 1 AND 78 AND
    amount_units NOT GLOB '*[^0-9]*' AND amount_units!='0' AND
    substr(amount_units,1,1)!='0'
  ),
  destination_account TEXT NOT NULL,
  chain_tx_id TEXT,
  chain_action_sequence TEXT,
  evidence_digest TEXT,
  status TEXT NOT NULL DEFAULT 'simulation_only'
    CHECK(status='simulation_only'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(intent_key,event_kind),
  CHECK((event_kind='simulate_reconcile' AND
         chain_tx_id IS NOT NULL AND
         length(chain_tx_id)=64 AND
         chain_tx_id NOT GLOB '*[^0-9a-f]*' AND
         evidence_digest IS NOT NULL AND
         length(evidence_digest)=64 AND
         evidence_digest NOT GLOB '*[^0-9a-f]*' AND
         chain_action_sequence IS NOT NULL AND
         length(chain_action_sequence) BETWEEN 1 AND 25 AND
         substr(chain_action_sequence,1,1) BETWEEN '1' AND '9' AND
         chain_action_sequence NOT GLOB '*[^0-9]*')
    OR (event_kind!='simulate_reconcile' AND
        chain_tx_id IS NULL AND evidence_digest IS NULL AND
        chain_action_sequence IS NULL))
) WITHOUT ROWID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_run_v2_lifecycle_chain_review
  ON tag_run_v2_lifecycle_events_rehearsal(chain_tx_id,chain_action_sequence)
  WHERE event_kind='simulate_reconcile';
-- WITHOUT ROWID eliminates implicit rowid conflict overwrites.
-- SQLite INSERT OR REPLACE can delete a row without invoking DELETE
-- triggers when recursive_triggers=OFF. Reject conflicts BEFORE INSERT.
CREATE TRIGGER IF NOT EXISTS tag_run_v2_lifecycle_no_replace
BEFORE INSERT ON tag_run_v2_lifecycle_events_rehearsal
WHEN EXISTS (
  SELECT 1 FROM tag_run_v2_lifecycle_events_rehearsal old
  WHERE old.event_id=NEW.event_id OR
    old.append_seq=NEW.append_seq OR
    (old.intent_key=NEW.intent_key AND old.event_kind=NEW.event_kind) OR
    (NEW.event_kind='simulate_reconcile' AND
      old.event_kind='simulate_reconcile' AND
      old.chain_tx_id=NEW.chain_tx_id AND
      old.chain_action_sequence=NEW.chain_action_sequence)
)
BEGIN SELECT RAISE(ABORT,'immutable_lifecycle_event'); END;
-- Disallow backdating, sequence reuse and jumping forward. SQLite serializes
-- writes to this database: deriving MAX+1 inside one INSERT statement keeps
-- the append operation atomic even when independent attempts race.
CREATE TRIGGER IF NOT EXISTS tag_run_v2_lifecycle_append_order
BEFORE INSERT ON tag_run_v2_lifecycle_events_rehearsal
WHEN NEW.append_seq != (
  SELECT COALESCE(MAX(old.append_seq),0)+1
  FROM tag_run_v2_lifecycle_events_rehearsal old
)
BEGIN SELECT RAISE(ABORT,'invalid_lifecycle_append_sequence'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_lifecycle_no_update
BEFORE UPDATE ON tag_run_v2_lifecycle_events_rehearsal
BEGIN SELECT RAISE(ABORT,'immutable_lifecycle_event'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_lifecycle_no_delete
BEFORE DELETE ON tag_run_v2_lifecycle_events_rehearsal
BEGIN SELECT RAISE(ABORT,'immutable_lifecycle_event'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_lifecycle_source_guard
BEFORE INSERT ON tag_run_v2_lifecycle_events_rehearsal
WHEN NOT EXISTS (
  SELECT 1 FROM tag_run_v2_payout_intents_rehearsal src
  WHERE src.intent_key=NEW.intent_key AND
    src.destination_account=NEW.destination_account AND
    src.amount_units=NEW.amount_units AND
    src.status='simulation_only'
)
BEGIN SELECT RAISE(ABORT,'rehearsal_lifecycle_intent_mismatch'); END;
