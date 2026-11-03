-- TAG RUN V2 payout ledger foundation; PRODUCTION migration, not an offline rehearsal.
-- APPLY ONLY AFTER BACKUP, OWNER AUTHORIZATION, REVIEW, AND REQUIRED CI CHECKS.
-- This migration DOES NOT enable payout flags, keys, transfer jobs, or funding.
-- Asset, donation and irreversible snapshot approvals remain separate gates.
CREATE TABLE IF NOT EXISTS tag_run_v2_payout_caps (
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL CHECK(day_key GLOB '????-??-??'),
  asset_key TEXT NOT NULL REFERENCES tag_run_v2_assets(asset_key),
  snapshot_digest TEXT NOT NULL CHECK(length(snapshot_digest)=64 AND snapshot_digest NOT GLOB '*[^0-9a-f]*'),
  daily_limit_units TEXT NOT NULL CHECK(length(daily_limit_units) BETWEEN 1 AND 78 AND daily_limit_units NOT GLOB '*[^0-9]*' AND (daily_limit_units='0' OR substr(daily_limit_units,1,1)!='0')),
  committed_units TEXT NOT NULL DEFAULT '0' CHECK(length(committed_units) BETWEEN 1 AND 78 AND committed_units NOT GLOB '*[^0-9]*' AND (committed_units='0' OR substr(committed_units,1,1)!='0')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0 AND revision<=9007199254740991),
  paused INTEGER NOT NULL DEFAULT 1 CHECK(paused IN (0,1)),
  authorized_by TEXT NOT NULL,
  PRIMARY KEY(chat_id,day_key,asset_key),
  FOREIGN KEY(chat_id,day_key,asset_key) REFERENCES tag_run_v2_snapshots(chat_id,day_key,asset_key)
) WITHOUT ROWID;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_cap_source_guard
BEFORE INSERT ON tag_run_v2_payout_caps
WHEN NOT EXISTS (
  SELECT 1 FROM tag_run_v2_snapshots s JOIN tag_run_v2_assets a
    ON a.asset_key=s.asset_key
  WHERE s.chat_id=NEW.chat_id AND s.day_key=NEW.day_key
    AND s.asset_key=NEW.asset_key AND s.status='verified'
    AND a.eligibility='approved' AND s.snapshot_digest=NEW.snapshot_digest
) OR EXISTS (
  SELECT 1 FROM tag_run_v2_payout_caps c
  WHERE c.chat_id=NEW.chat_id AND c.day_key=NEW.day_key
    AND c.asset_key=NEW.asset_key
)
BEGIN SELECT RAISE(ABORT,'v2_payout_cap_source_unapproved_or_duplicate'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_cap_update_guard
BEFORE UPDATE ON tag_run_v2_payout_caps
WHEN NEW.chat_id!=OLD.chat_id OR NEW.day_key!=OLD.day_key
 OR NEW.asset_key!=OLD.asset_key OR NEW.snapshot_digest!=OLD.snapshot_digest
 OR NEW.daily_limit_units!=OLD.daily_limit_units OR NEW.authorized_by!=OLD.authorized_by
 OR NEW.revision!=OLD.revision+1
 OR NOT (length(NEW.committed_units)>length(OLD.committed_units)
      OR (length(NEW.committed_units)=length(OLD.committed_units)
       AND NEW.committed_units>=OLD.committed_units))
 OR NOT (length(NEW.daily_limit_units)>length(NEW.committed_units)
      OR (length(NEW.daily_limit_units)=length(NEW.committed_units)
       AND NEW.daily_limit_units>=NEW.committed_units))
 OR (NEW.committed_units!=OLD.committed_units AND (OLD.paused=1 OR NEW.paused=1))
BEGIN SELECT RAISE(ABORT,'v2_payout_cap_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_cap_no_delete
BEFORE DELETE ON tag_run_v2_payout_caps
BEGIN SELECT RAISE(ABORT,'v2_payout_cap_immutable'); END;

CREATE TABLE IF NOT EXISTS tag_run_v2_payout_intents (
  intent_key TEXT NOT NULL PRIMARY KEY CHECK(length(intent_key)=64 AND intent_key NOT GLOB '*[^0-9a-f]*'),
  chat_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  asset_key TEXT NOT NULL REFERENCES tag_run_v2_assets(asset_key),
  bundle_index INTEGER NOT NULL CHECK(bundle_index BETWEEN 0 AND 19),
  telegram_id TEXT NOT NULL,
  receiving_account TEXT NOT NULL,
  amount_units TEXT NOT NULL CHECK(length(amount_units) BETWEEN 1 AND 78 AND amount_units NOT GLOB '*[^0-9]*' AND substr(amount_units,1,1)!='0'),
  snapshot_digest TEXT NOT NULL,
  authorization_digest TEXT NOT NULL CHECK(length(authorization_digest)=64 AND authorization_digest NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','broadcast_unknown','confirmed','reconciliation_review')),
  signed_tx_id TEXT,
  approved_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chat_id,day_key,asset_key,bundle_index),
  FOREIGN KEY(chat_id,day_key,asset_key) REFERENCES tag_run_v2_payout_caps(chat_id,day_key,asset_key),
  CHECK((status='reserved' AND signed_tx_id IS NULL)
     OR (status!='reserved'))
) WITHOUT ROWID;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_intent_source_guard
BEFORE INSERT ON tag_run_v2_payout_intents
WHEN NOT EXISTS (
  SELECT 1 FROM tag_run_v2_payout_caps c
  WHERE c.chat_id=NEW.chat_id AND c.day_key=NEW.day_key
    AND c.asset_key=NEW.asset_key AND c.snapshot_digest=NEW.snapshot_digest
    AND c.paused=0
) OR NOT EXISTS (
  SELECT 1 FROM tag_run_v2_bundles b
  WHERE b.chat_id=NEW.chat_id AND b.day_key=NEW.day_key
    AND b.asset_key=NEW.asset_key AND b.bundle_index=NEW.bundle_index
    AND b.telegram_id=NEW.telegram_id AND b.units=NEW.amount_units
    AND b.status='preview_only'
) OR EXISTS (
  SELECT 1 FROM tag_run_v2_payout_intents i
  WHERE i.intent_key=NEW.intent_key
     OR (i.chat_id=NEW.chat_id AND i.day_key=NEW.day_key
       AND i.asset_key=NEW.asset_key AND i.bundle_index=NEW.bundle_index)
)
BEGIN SELECT RAISE(ABORT,'v2_payout_intent_source_unapproved_or_duplicate'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_intent_update_guard
BEFORE UPDATE ON tag_run_v2_payout_intents
WHEN NEW.intent_key!=OLD.intent_key OR NEW.chat_id!=OLD.chat_id
 OR NEW.day_key!=OLD.day_key OR NEW.asset_key!=OLD.asset_key
 OR NEW.bundle_index!=OLD.bundle_index OR NEW.telegram_id!=OLD.telegram_id
 OR NEW.receiving_account!=OLD.receiving_account OR NEW.amount_units!=OLD.amount_units
 OR NEW.snapshot_digest!=OLD.snapshot_digest
 OR NEW.authorization_digest!=OLD.authorization_digest
 OR NEW.approved_by!=OLD.approved_by
 OR NOT (
    (OLD.status='reserved' AND NEW.status='broadcast_unknown')
 OR (OLD.status='broadcast_unknown' AND NEW.status IN ('confirmed','reconciliation_review'))
 OR (OLD.status=NEW.status AND OLD.signed_tx_id IS NEW.signed_tx_id)
 )
 OR (OLD.signed_tx_id IS NOT NULL AND NEW.signed_tx_id IS NOT OLD.signed_tx_id)
BEGIN SELECT RAISE(ABORT,'v2_payout_intent_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_intent_no_delete
BEFORE DELETE ON tag_run_v2_payout_intents
BEGIN SELECT RAISE(ABORT,'v2_payout_intent_immutable'); END;
CREATE INDEX IF NOT EXISTS tag_run_v2_payout_intents_state
ON tag_run_v2_payout_intents(status,day_key);
