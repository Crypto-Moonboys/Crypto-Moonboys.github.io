-- TAG RUN V2 token-level Community Pot funding policy.
-- Token eligibility plus an independently verified irreversible balance
-- snapshot replaces per-transfer donation approval. Draw, payout, cap and
-- reservation gates remain unchanged.
DROP TRIGGER IF EXISTS tag_run_v2_payout_cap_source_guard;

CREATE TRIGGER tag_run_v2_payout_cap_source_guard
BEFORE INSERT ON tag_run_v2_payout_caps
WHEN NEW.reward_policy_bps!=100 OR NEW.paused!=1 OR NEW.revision!=0 OR NEW.committed_units!='0'
 OR NEW.last_reserved_units!='0' OR NEW.last_intent_key!=''
 OR NOT EXISTS (
  SELECT 1 FROM tag_run_v2_pool_config p
  WHERE p.config_id=1 AND p.status='review_only'
    AND p.wallet_account='isthatajoint' AND p.daily_bps=500
    AND p.active_daily_bps=100 AND p.active_policy_version=2
    AND p.historical_ticket_bps=5000
) OR NOT EXISTS (
  SELECT 1 FROM tag_run_v2_snapshots s JOIN tag_run_v2_assets a
    ON a.asset_key=s.asset_key
  WHERE s.chat_id=NEW.chat_id AND s.day_key=NEW.day_key
    AND s.asset_key=NEW.asset_key AND s.status='verified'
    AND a.eligibility='approved' AND s.snapshot_digest=NEW.snapshot_digest
    AND s.reward_policy_bps=100 AND s.daily_reward_units=NEW.daily_limit_units
    AND s.daily_reward_units=(CASE WHEN length(s.spendable_units)<=2 THEN '0' ELSE substr(s.spendable_units,1,length(s.spendable_units)-2) END)
    AND (
      length(NEW.daily_limit_units)>length(NEW.per_transfer_limit_units)
      OR (length(NEW.daily_limit_units)=length(NEW.per_transfer_limit_units)
          AND NEW.daily_limit_units>=NEW.per_transfer_limit_units)
    )
) OR EXISTS (
  SELECT 1 FROM tag_run_v2_payout_caps c
  WHERE c.chat_id=NEW.chat_id AND c.day_key=NEW.day_key
    AND c.asset_key=NEW.asset_key
)
BEGIN SELECT RAISE(ABORT,'v2_payout_cap_source_unapproved_or_duplicate'); END;
