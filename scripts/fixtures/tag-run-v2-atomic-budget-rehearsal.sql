-- TAG RUN V2 PR5: DISPOSABLE SQLITE ATOMIC-BUDGET REHEARSAL ONLY.
-- NOT a Wrangler/D1 production migration. No funded entitlement, approvals,
-- real reservation, signer, transaction submission or payout is represented.
CREATE TABLE IF NOT EXISTS tag_run_v2_atomic_budget_rehearsal (
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL CHECK(day_key GLOB '????-??-??'),
  asset_key TEXT NOT NULL REFERENCES tag_run_v2_assets(asset_key),
  daily_limit_units TEXT NOT NULL CHECK(
    length(daily_limit_units) BETWEEN 1 AND 78 AND
    daily_limit_units NOT GLOB '*[^0-9]*' AND
    (daily_limit_units='0' OR substr(daily_limit_units,1,1)!='0')),
  per_transfer_limit_units TEXT NOT NULL CHECK(
    length(per_transfer_limit_units) BETWEEN 1 AND 78 AND
    per_transfer_limit_units NOT GLOB '*[^0-9]*' AND
    substr(per_transfer_limit_units,1,1)!='0'),
  allocated_units TEXT NOT NULL DEFAULT '0' CHECK(
    length(allocated_units) BETWEEN 1 AND 78 AND
    allocated_units NOT GLOB '*[^0-9]*' AND
    (allocated_units='0' OR substr(allocated_units,1,1)!='0')),
  outstanding_units TEXT NOT NULL DEFAULT '0' CHECK(
    length(outstanding_units) BETWEEN 1 AND 78 AND
    outstanding_units NOT GLOB '*[^0-9]*' AND
    (outstanding_units='0' OR substr(outstanding_units,1,1)!='0')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(
    revision >= 0 AND revision <= 9007199254740991),
  paused INTEGER NOT NULL DEFAULT 1 CHECK(paused IN (0,1)),
  mode TEXT NOT NULL DEFAULT 'simulation_only' CHECK(mode='simulation_only'),
  PRIMARY KEY(chat_id,day_key,asset_key)
) WITHOUT ROWID;

-- SQLite INSERT OR REPLACE can silently delete an existing budget row even
-- when recursive_triggers=OFF, resetting allocated/outstanding/revision/paused.
-- Reject scoped duplicates BEFORE INSERT, including while an unknown hold
-- still points to the same scope through its foreign key.
CREATE TRIGGER IF NOT EXISTS tag_run_v2_atomic_budget_no_replace
BEFORE INSERT ON tag_run_v2_atomic_budget_rehearsal
WHEN EXISTS (
  SELECT 1 FROM tag_run_v2_atomic_budget_rehearsal old
  WHERE old.chat_id=NEW.chat_id AND old.day_key=NEW.day_key
    AND old.asset_key=NEW.asset_key
)
BEGIN SELECT RAISE(ABORT,'atomic_rehearsal_duplicate_budget'); END;

-- One simulated intention can have at most one hold, independent of retries.
-- The mutable state is ONLY a rehearsal marker. Unknown/review allocations
-- remain outstanding and may not be cancelled or retried.
CREATE TABLE IF NOT EXISTS tag_run_v2_atomic_holds_rehearsal (
  intent_key TEXT NOT NULL PRIMARY KEY
    REFERENCES tag_run_v2_payout_intents_rehearsal(intent_key),
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  amount_units TEXT NOT NULL CHECK(
    length(amount_units) BETWEEN 1 AND 78 AND
    amount_units NOT GLOB '*[^0-9]*' AND
    substr(amount_units,1,1)!='0'),
  destination_account TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN (
    'simulation_held','simulation_cancelled','simulation_transfer_unknown',
    'simulation_reconciliation_review')),
  mode TEXT NOT NULL DEFAULT 'simulation_only' CHECK(mode='simulation_only'),
  FOREIGN KEY(chat_id,day_key,asset_key)
    REFERENCES tag_run_v2_atomic_budget_rehearsal(chat_id,day_key,asset_key)
) WITHOUT ROWID;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_atomic_holds_no_delete
BEFORE DELETE ON tag_run_v2_atomic_holds_rehearsal
BEGIN SELECT RAISE(ABORT,'atomic_rehearsal_hold_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_atomic_holds_no_insert_replace
BEFORE INSERT ON tag_run_v2_atomic_holds_rehearsal
WHEN EXISTS (
  SELECT 1 FROM tag_run_v2_atomic_holds_rehearsal h
  WHERE h.intent_key=NEW.intent_key
)
BEGIN SELECT RAISE(ABORT,'atomic_rehearsal_duplicate_hold'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_atomic_holds_protect_identity
BEFORE UPDATE ON tag_run_v2_atomic_holds_rehearsal
WHEN NEW.intent_key!=OLD.intent_key OR
  NEW.chat_id!=OLD.chat_id OR NEW.day_key!=OLD.day_key OR
  NEW.asset_key!=OLD.asset_key OR NEW.amount_units!=OLD.amount_units OR
  NEW.destination_account!=OLD.destination_account OR
  NEW.mode!=OLD.mode OR
  (OLD.state!='simulation_held' AND NEW.state!=OLD.state) OR
  (OLD.state='simulation_held' AND NEW.state NOT IN (
    'simulation_held','simulation_cancelled','simulation_transfer_unknown'))
BEGIN SELECT RAISE(ABORT,'atomic_rehearsal_hold_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_atomic_holds_match_source
BEFORE INSERT ON tag_run_v2_atomic_holds_rehearsal
WHEN NOT EXISTS (
  SELECT 1 FROM tag_run_v2_payout_intents_rehearsal src
  WHERE src.intent_key=NEW.intent_key AND
    src.chat_id=NEW.chat_id AND src.day_key=NEW.day_key AND
    src.asset_key=NEW.asset_key AND
    src.amount_units=NEW.amount_units AND
    src.destination_account=NEW.destination_account AND
    src.status='simulation_only'
)
BEGIN SELECT RAISE(ABORT,'atomic_rehearsal_source_mismatch'); END;
