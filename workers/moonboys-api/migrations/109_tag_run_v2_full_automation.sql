-- TAG RUN V2 automatic payout custody and contract pinning.
-- Apply only after a production D1 backup and rehearsal. The Worker remains
-- fail-closed until its separate automation flags and encrypted secrets exist.
ALTER TABLE tag_run_v2_assets
  ADD COLUMN approved_code_hash TEXT;
ALTER TABLE tag_run_v2_assets
  ADD COLUMN approved_abi_hash TEXT;

ALTER TABLE tag_run_v2_payout_intents
  ADD COLUMN submission_tx_id TEXT;
ALTER TABLE tag_run_v2_payout_intents
  ADD COLUMN signed_transaction_json TEXT;
ALTER TABLE tag_run_v2_payout_intents
  ADD COLUMN reconcile_after TEXT;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_asset_contract_pin_guard
BEFORE UPDATE ON tag_run_v2_assets
WHEN NEW.eligibility='approved' AND (
  NEW.approved_code_hash IS NULL
  OR length(NEW.approved_code_hash)!=64
  OR NEW.approved_code_hash GLOB '*[^0-9a-f]*'
  OR NEW.approved_abi_hash IS NULL
  OR length(NEW.approved_abi_hash)!=64
  OR NEW.approved_abi_hash GLOB '*[^0-9a-f]*'
)
BEGIN SELECT RAISE(ABORT,'v2_asset_contract_pin_required'); END;

DROP TRIGGER IF EXISTS tag_run_v2_payout_intent_update_guard;
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
 OR (OLD.status='reconciliation_review' AND NEW.status='confirmed')
 OR (OLD.status=NEW.status AND OLD.signed_tx_id IS NEW.signed_tx_id)
 )
 OR (
   NEW.status='broadcast_unknown' AND NOT (
     (NEW.submission_tx_id IS NULL AND NEW.signed_transaction_json IS NULL)
     OR (
       NEW.submission_tx_id IS NOT NULL
       AND length(NEW.submission_tx_id)=64
       AND NEW.submission_tx_id NOT GLOB '*[^0-9a-f]*'
       AND NEW.signed_transaction_json IS NOT NULL
       AND json_valid(NEW.signed_transaction_json)
       AND length(CAST(NEW.signed_transaction_json AS BLOB)) BETWEEN 100 AND 20000
     )
   )
 )
 OR (NEW.status='confirmed' AND (
      NEW.signed_tx_id IS NULL
      OR length(NEW.signed_tx_id)!=64
      OR NEW.signed_tx_id GLOB '*[^0-9a-f]*'
      OR (NEW.submission_tx_id IS NOT NULL
          AND NEW.signed_tx_id!=NEW.submission_tx_id)
 ))
 OR (OLD.signed_tx_id IS NOT NULL AND NEW.signed_tx_id IS NOT OLD.signed_tx_id)
 OR (OLD.submission_tx_id IS NOT NULL
     AND NEW.submission_tx_id IS NOT OLD.submission_tx_id)
 OR (OLD.signed_transaction_json IS NOT NULL
     AND NEW.signed_transaction_json IS NOT OLD.signed_transaction_json)
BEGIN SELECT RAISE(ABORT,'v2_payout_intent_immutable'); END;

CREATE INDEX IF NOT EXISTS tag_run_v2_payout_submission_tx
ON tag_run_v2_payout_intents(submission_tx_id);

CREATE INDEX IF NOT EXISTS tag_run_v2_payout_reconcile_queue
ON tag_run_v2_payout_intents(status,reconcile_after,updated_at);

-- This is the durable policy-state transition only. Runtime automation still
-- fails closed until all release flags and both Worker secrets are present.
UPDATE tag_run_v2_pool_config
SET status='review_only',revision=revision+1,updated_at=CURRENT_TIMESTAMP
WHERE config_id=1 AND wallet_account='isthatajoint' AND status='paused'
  AND daily_bps=500 AND active_daily_bps=100
  AND active_policy_version=2 AND historical_ticket_bps=5000;
