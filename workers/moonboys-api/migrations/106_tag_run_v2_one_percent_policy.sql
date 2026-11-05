-- TAG RUN V2 prospective 1% daily policy (v2). ADDITIVE. Preserve old
-- 5% records, original migration 104/105 checks, and all V1 Street Cred.
-- Never apply to live D1 without explicit owner release, backup and proof.
-- The original daily_bps=500 and five_percent_units fields are frozen
-- legacy policy-v1 metadata; they are NEVER reinterpreted as 1% evidence.
-- 1% is the current owner-approved target, NOT a payout activation.
ALTER TABLE tag_run_v2_pool_config
  ADD COLUMN active_daily_bps INTEGER NOT NULL DEFAULT 100
  CHECK(active_daily_bps=100);
ALTER TABLE tag_run_v2_pool_config
  ADD COLUMN active_policy_version INTEGER NOT NULL DEFAULT 2
  CHECK(active_policy_version=2);
ALTER TABLE tag_run_v2_snapshots
  ADD COLUMN reward_policy_bps INTEGER NOT NULL DEFAULT 500
  CHECK(reward_policy_bps IN (100,500));
ALTER TABLE tag_run_v2_snapshots
  ADD COLUMN daily_reward_units TEXT NOT NULL DEFAULT '0'
  CHECK(length(daily_reward_units) BETWEEN 1 AND 78
    AND daily_reward_units NOT GLOB '*[^0-9]*'
    AND (daily_reward_units='0' OR substr(daily_reward_units,1,1)!='0'));
ALTER TABLE tag_run_v2_draws
  ADD COLUMN reward_policy_bps INTEGER NOT NULL DEFAULT 500
  CHECK(reward_policy_bps IN (100,500));
ALTER TABLE tag_run_v2_payout_caps
  ADD COLUMN reward_policy_bps INTEGER NOT NULL DEFAULT 500
  CHECK(reward_policy_bps IN (100,500));


-- Legacy policy markers are HISTORICAL, not editable release approvals.
-- New policy rows are born as v2; UPDATE is never a supported conversion.
-- BEFORE INSERT duplicate guards also cover INSERT OR REPLACE even when
-- SQLite recursive_triggers is OFF (its internal DELETE trigger may not run).
CREATE TRIGGER IF NOT EXISTS tag_run_v2_snapshot_policy_immutable
BEFORE UPDATE OF reward_policy_bps ON tag_run_v2_snapshots
WHEN NEW.reward_policy_bps!=OLD.reward_policy_bps
BEGIN SELECT RAISE(ABORT,'v2_snapshot_policy_immutable'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_draw_policy_immutable
BEFORE UPDATE OF reward_policy_bps ON tag_run_v2_draws
WHEN NEW.reward_policy_bps!=OLD.reward_policy_bps
BEGIN SELECT RAISE(ABORT,'v2_draw_policy_immutable'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_snapshot_no_replace_policy
BEFORE INSERT ON tag_run_v2_snapshots
WHEN EXISTS (
  SELECT 1 FROM tag_run_v2_snapshots old
  WHERE old.chat_id=NEW.chat_id AND old.day_key=NEW.day_key
    AND old.asset_key=NEW.asset_key
)
BEGIN SELECT RAISE(ABORT,'v2_snapshot_policy_replacement_forbidden'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_draw_no_replace_policy
BEFORE INSERT ON tag_run_v2_draws
WHEN EXISTS (
  SELECT 1 FROM tag_run_v2_draws old
  WHERE old.chat_id=NEW.chat_id AND old.day_key=NEW.day_key
)
BEGIN SELECT RAISE(ABORT,'v2_draw_policy_replacement_forbidden'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_legacy_snapshot_no_delete
BEFORE DELETE ON tag_run_v2_snapshots
WHEN OLD.reward_policy_bps=500
BEGIN SELECT RAISE(ABORT,'v2_legacy_snapshot_immutable'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_legacy_draw_no_delete
BEFORE DELETE ON tag_run_v2_draws
WHEN OLD.reward_policy_bps=500
BEGIN SELECT RAISE(ABORT,'v2_legacy_draw_immutable'); END;

-- Replace only the two legacy 5%-specific insertion checks. Preserve all
-- other payout guards, accounting triggers, immutable records and indices.
DROP TRIGGER IF EXISTS tag_run_v2_payout_cap_source_guard;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_cap_source_guard
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
    AND (
      length(NEW.daily_limit_units)>length(NEW.per_transfer_limit_units)
      OR (length(NEW.daily_limit_units)=length(NEW.per_transfer_limit_units)
          AND NEW.daily_limit_units>=NEW.per_transfer_limit_units)
    )
) OR NOT EXISTS (
  SELECT 1 FROM tag_run_v2_deposits d
  WHERE d.asset_key=NEW.asset_key AND d.status='confirmed_donation'
) OR EXISTS (
  SELECT 1 FROM tag_run_v2_payout_caps c
  WHERE c.chat_id=NEW.chat_id AND c.day_key=NEW.day_key
    AND c.asset_key=NEW.asset_key
)
BEGIN SELECT RAISE(ABORT,'v2_payout_cap_source_unapproved_or_duplicate'); END;

DROP TRIGGER IF EXISTS tag_run_v2_payout_intent_source_guard;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_intent_source_guard
BEFORE INSERT ON tag_run_v2_payout_intents
WHEN NEW.status!='reserved' OR NEW.signed_tx_id IS NOT NULL
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
    AND s.snapshot_digest=NEW.snapshot_digest
    AND s.reward_policy_bps=100
    AND a.eligibility='approved'
) OR NOT EXISTS (
  SELECT 1 FROM tag_run_v2_payout_caps c
  WHERE c.chat_id=NEW.chat_id AND c.day_key=NEW.day_key
    AND c.asset_key=NEW.asset_key AND c.snapshot_digest=NEW.snapshot_digest
    AND c.paused=0 AND c.reward_policy_bps=100 AND c.last_intent_key=NEW.intent_key
    AND c.last_reserved_units=NEW.amount_units
    AND (
      length(c.per_transfer_limit_units)>length(NEW.amount_units)
      OR (length(c.per_transfer_limit_units)=length(NEW.amount_units)
          AND c.per_transfer_limit_units>=NEW.amount_units)
    )
) OR NOT EXISTS (
  SELECT 1 FROM tag_run_wallets w
  WHERE w.telegram_id=NEW.telegram_id AND w.wax_account=NEW.receiving_account
) OR NOT EXISTS (
  SELECT 1 FROM tag_run_v2_bundles b
  WHERE b.chat_id=NEW.chat_id AND b.day_key=NEW.day_key
    AND b.asset_key=NEW.asset_key AND b.bundle_index=NEW.bundle_index
    AND b.telegram_id=NEW.telegram_id AND b.units=NEW.amount_units
    AND b.status='preview_only'
    AND EXISTS (
      SELECT 1 FROM tag_run_v2_draws d
      WHERE d.chat_id=b.chat_id AND d.day_key=b.day_key
        AND d.status='reviewed' AND d.reward_policy_bps=100
        AND d.reviewed_by IS NOT NULL AND length(d.reviewed_by)>0
    )
) OR EXISTS (
  SELECT 1 FROM tag_run_v2_payout_intents i
  WHERE i.intent_key=NEW.intent_key
     OR (i.chat_id=NEW.chat_id AND i.day_key=NEW.day_key
       AND i.asset_key=NEW.asset_key AND i.bundle_index=NEW.bundle_index)
)
BEGIN SELECT RAISE(ABORT,'v2_payout_intent_source_unapproved_or_duplicate'); END;

-- Old caps may remain as historical evidence but can never be unpaused for
-- 1% execution. A cap from policy v2 also requires a v2 reviewed draw.
CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_cap_policy_activation_guard
BEFORE UPDATE OF paused ON tag_run_v2_payout_caps
WHEN NEW.paused=0 AND (
  NEW.reward_policy_bps!=100
  OR NOT EXISTS (
    SELECT 1 FROM tag_run_v2_draws d
    WHERE d.chat_id=NEW.chat_id AND d.day_key=NEW.day_key
      AND d.status='reviewed' AND d.reward_policy_bps=100
  )
  OR NOT EXISTS (
    SELECT 1 FROM tag_run_v2_snapshots s
    WHERE s.chat_id=NEW.chat_id AND s.day_key=NEW.day_key
      AND s.asset_key=NEW.asset_key AND s.status='verified'
      AND s.reward_policy_bps=100
      AND s.daily_reward_units=NEW.daily_limit_units
  )
)
BEGIN SELECT RAISE(ABORT,'v2_legacy_cap_cannot_activate'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_payout_cap_policy_immutable
BEFORE UPDATE OF reward_policy_bps ON tag_run_v2_payout_caps
BEGIN SELECT RAISE(ABORT,'v2_payout_cap_policy_immutable'); END;
