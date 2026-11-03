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
  -- Irreversible incident floor: cumulative unknown allocations cannot be
  -- erased by resetting outstanding or even by cancelling other known holds.
  unknown_floor_units TEXT NOT NULL DEFAULT '0' CHECK(
    length(unknown_floor_units) BETWEEN 1 AND 78 AND
    unknown_floor_units NOT GLOB '*[^0-9]*' AND
    (unknown_floor_units='0' OR substr(unknown_floor_units,1,1)!='0')),
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

-- Freeze scope, caps, mode and counters against direct UPDATE/UPDATE OR
-- REPLACE, including replacement of a spent budget by a new budget scope.
-- Comparisons use canonical decimal TEXT (length + lexical), never SQLite
-- floating point, so large token units retain exact ordering.
CREATE TRIGGER IF NOT EXISTS tag_run_v2_atomic_budget_update_guard
BEFORE UPDATE ON tag_run_v2_atomic_budget_rehearsal
WHEN NEW.chat_id!=OLD.chat_id OR NEW.day_key!=OLD.day_key OR
  NEW.asset_key!=OLD.asset_key OR NEW.mode!=OLD.mode OR
  NEW.daily_limit_units!=OLD.daily_limit_units OR
  NEW.per_transfer_limit_units!=OLD.per_transfer_limit_units OR
  NEW.revision!=OLD.revision+1 OR
  NOT (length(NEW.allocated_units)>length(OLD.allocated_units) OR (length(NEW.allocated_units)=length(OLD.allocated_units) AND NEW.allocated_units>=OLD.allocated_units)) OR
  NOT (length(NEW.daily_limit_units)>length(NEW.allocated_units) OR (length(NEW.daily_limit_units)=length(NEW.allocated_units) AND NEW.daily_limit_units>=NEW.allocated_units)) OR
  NOT (length(NEW.allocated_units)>length(NEW.outstanding_units) OR (length(NEW.allocated_units)=length(NEW.outstanding_units) AND NEW.allocated_units>=NEW.outstanding_units)) OR
  NOT (length(NEW.unknown_floor_units)>length(OLD.unknown_floor_units) OR (length(NEW.unknown_floor_units)=length(OLD.unknown_floor_units) AND NEW.unknown_floor_units>=OLD.unknown_floor_units)) OR
  NOT (length(NEW.outstanding_units)>length(NEW.unknown_floor_units) OR (length(NEW.outstanding_units)=length(NEW.unknown_floor_units) AND NEW.outstanding_units>=NEW.unknown_floor_units)) OR
  ((OLD.paused=1 OR NEW.paused=1) AND
    (length(NEW.allocated_units)>length(OLD.allocated_units) OR (length(NEW.allocated_units)=length(OLD.allocated_units) AND NEW.allocated_units>OLD.allocated_units))) OR
  ((length(NEW.allocated_units)>length(OLD.allocated_units) OR (length(NEW.allocated_units)=length(OLD.allocated_units) AND NEW.allocated_units>OLD.allocated_units)) AND
    NOT (length(NEW.outstanding_units)>length(OLD.outstanding_units) OR (length(NEW.outstanding_units)=length(OLD.outstanding_units) AND NEW.outstanding_units>OLD.outstanding_units))) OR
  ((length(OLD.outstanding_units)>length(NEW.outstanding_units) OR (length(OLD.outstanding_units)=length(NEW.outstanding_units) AND OLD.outstanding_units>NEW.outstanding_units)) AND
    NOT EXISTS (
      SELECT 1 FROM tag_run_v2_atomic_holds_rehearsal h
      WHERE h.chat_id=OLD.chat_id AND h.day_key=OLD.day_key AND
        h.asset_key=OLD.asset_key AND h.state='simulation_held'
    ))
BEGIN SELECT RAISE(ABORT,'atomic_rehearsal_budget_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_atomic_budget_no_delete
BEFORE DELETE ON tag_run_v2_atomic_budget_rehearsal
BEGIN SELECT RAISE(ABORT,'atomic_rehearsal_budget_immutable'); END;

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

-- The UNKNOWN accounting floor is enforced inside SQLite, not just the
-- Node helper. A direct held->unknown UPDATE (including UPDATE OR REPLACE)
-- also adds this hold's full base-unit amount to the non-refundable floor.
-- Decimal digit recursion avoids SQLite REAL and 64-bit integer overflow.
-- The budget UPDATE guard rejects floors exceeding outstanding units;
-- failure aborts and rolls back the originating hold-state change.
CREATE TRIGGER IF NOT EXISTS tag_run_v2_atomic_holds_auto_unknown_floor
AFTER UPDATE OF state ON tag_run_v2_atomic_holds_rehearsal
WHEN OLD.state='simulation_held' AND
     NEW.state='simulation_transfer_unknown'
BEGIN
  UPDATE tag_run_v2_atomic_budget_rehearsal
  SET unknown_floor_units=(
    WITH RECURSIVE digit_add(pos,carry,digits) AS (
      SELECT 0,0,''
      UNION ALL
      SELECT pos+1,
        (CAST(CASE WHEN pos < length(tag_run_v2_atomic_budget_rehearsal.unknown_floor_units) THEN substr(tag_run_v2_atomic_budget_rehearsal.unknown_floor_units,length(tag_run_v2_atomic_budget_rehearsal.unknown_floor_units)-pos,1) ELSE '0' END AS INTEGER) + CAST(CASE WHEN pos < length(NEW.amount_units) THEN substr(NEW.amount_units,length(NEW.amount_units)-pos,1) ELSE '0' END AS INTEGER) + carry)/10,
        CAST((CAST(CASE WHEN pos < length(tag_run_v2_atomic_budget_rehearsal.unknown_floor_units) THEN substr(tag_run_v2_atomic_budget_rehearsal.unknown_floor_units,length(tag_run_v2_atomic_budget_rehearsal.unknown_floor_units)-pos,1) ELSE '0' END AS INTEGER) + CAST(CASE WHEN pos < length(NEW.amount_units) THEN substr(NEW.amount_units,length(NEW.amount_units)-pos,1) ELSE '0' END AS INTEGER) + carry)%10 AS TEXT)||digits
      FROM digit_add
      WHERE pos < max(
        length(tag_run_v2_atomic_budget_rehearsal.unknown_floor_units),
        length(NEW.amount_units))
    )
    SELECT (CASE WHEN carry>0 THEN CAST(carry AS TEXT) ELSE '' END)||digits
    FROM digit_add ORDER BY pos DESC LIMIT 1
  ),revision=revision+1
  WHERE chat_id=NEW.chat_id AND day_key=NEW.day_key AND
        asset_key=NEW.asset_key;
  SELECT CASE WHEN changes()!=1
    THEN RAISE(ABORT,'atomic_rehearsal_unknown_floor_missing_budget')
  END;
END;
