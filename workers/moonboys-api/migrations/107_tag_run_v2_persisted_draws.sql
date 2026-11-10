-- Persistent owner-reviewed draw lifecycle. No signer, flags or live funding.
-- Apply only after a private backup, offline rehearsal and explicit approval.
CREATE TABLE IF NOT EXISTS tag_run_v2_draw_workflows (
  chat_id TEXT NOT NULL, day_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'committed' CHECK(state IN ('committed','revealed','reviewed','rejected')),
  committed_by TEXT NOT NULL CHECK(length(committed_by)>0), reviewed_by TEXT,
  input_json TEXT NOT NULL CHECK(json_valid(input_json) AND length(CAST(input_json AS BLOB))<=900000
    AND json_type(input_json,'$.snapshots') IS 'array' AND json_array_length(input_json,'$.snapshots') BETWEEN 1 AND 100
    AND json_type(input_json,'$.participation') IS 'array' AND json_array_length(input_json,'$.participation')<=20000
    AND json_type(input_json,'$.deposits') IS 'array' AND json_array_length(input_json,'$.deposits')<=5000
    AND json_type(input_json,'$.outstanding') IS 'array' AND json_array_length(input_json,'$.outstanding')<=20000
    AND json_extract(input_json,'$.domain') IS 'tag-run-v2:persisted-draw:v1'
    AND json_extract(input_json,'$.chatId') IS chat_id AND json_extract(input_json,'$.day') IS day_key),
  inputs_digest TEXT NOT NULL CHECK(length(inputs_digest)=64 AND inputs_digest NOT GLOB '*[^0-9a-f]*'),
  seed_commitment TEXT NOT NULL CHECK(length(seed_commitment)=64 AND seed_commitment NOT GLOB '*[^0-9a-f]*'),
  observed_head INTEGER NOT NULL CHECK(typeof(observed_head)='integer' AND observed_head>0 AND observed_head<=4294967175),
  beacon_block INTEGER NOT NULL CHECK(typeof(beacon_block)='integer' AND beacon_block>=observed_head+120 AND beacon_block<=4294967295),
  commit_not_after INTEGER NOT NULL,
  seed_reveal TEXT, beacon_id TEXT,
  bundles_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(bundles_json) AND json_type(bundles_json) IS 'array' AND json_array_length(bundles_json)<=2000
    AND length(CAST(bundles_json AS BLOB))<=300000),
  debits_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(debits_json) AND json_type(debits_json) IS 'array' AND length(CAST(debits_json AS BLOB))<=300000),
  rejection_reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(chat_id,day_key),
  FOREIGN KEY(chat_id,day_key) REFERENCES tag_run_v2_draws(chat_id,day_key)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS tag_run_v2_draw_weight_claims (
  chat_id TEXT NOT NULL, draw_day TEXT NOT NULL, source_day TEXT NOT NULL,
  telegram_id TEXT NOT NULL, units INTEGER NOT NULL CHECK(units BETWEEN 1 AND 510),
  prior_spent INTEGER NOT NULL CHECK(prior_spent>=0),
  earned_weight INTEGER NOT NULL CHECK(earned_weight BETWEEN 1 AND 510),
  source_receipts_digest TEXT NOT NULL,
  winning_asset_key TEXT NOT NULL, winning_bundle_index INTEGER NOT NULL,
  PRIMARY KEY(chat_id,draw_day,source_day,telegram_id),
  FOREIGN KEY(chat_id,draw_day) REFERENCES tag_run_v2_draw_workflows(chat_id,day_key),
  FOREIGN KEY(chat_id,source_day,telegram_id) REFERENCES tag_run_v2_participation(chat_id,day_key,telegram_id),
  FOREIGN KEY(chat_id,draw_day,winning_asset_key,winning_bundle_index)
    REFERENCES tag_run_v2_bundles(chat_id,day_key,asset_key,bundle_index)
) WITHOUT ROWID;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_workflow_insert_guard BEFORE INSERT ON tag_run_v2_draw_workflows BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows WHERE chat_id=NEW.chat_id AND day_key=NEW.day_key)
    OR NEW.state!='committed' OR NEW.reviewed_by IS NOT NULL OR NEW.seed_reveal IS NOT NULL OR NEW.beacon_id IS NOT NULL
    OR NEW.bundles_json!='[]' OR NEW.debits_json!='[]' OR NEW.rejection_reason IS NOT NULL
    OR typeof(NEW.commit_not_after)!='integer' OR unixepoch('now')>NEW.commit_not_after OR NEW.commit_not_after>unixepoch('now')+10
    THEN RAISE(ABORT,'v2_draw_invalid_initial_commit') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tag_run_v2_draws d WHERE d.chat_id=NEW.chat_id AND d.day_key=NEW.day_key
    AND d.status='preview_only' AND d.seed_reveal IS NULL AND d.reward_policy_bps=100
    AND d.seed_commitment=NEW.seed_commitment
    AND d.snapshots_digest=json_extract(NEW.input_json,'$.snapshotsDigest')
    AND d.weights_digest=json_extract(NEW.input_json,'$.weightsDigest')
    AND d.rules_digest=json_extract(NEW.input_json,'$.rulesDigest'))
    THEN RAISE(ABORT,'v2_draw_parent_mismatch') END;

  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tag_run_v2_capture_cursors c WHERE c.chat_id=NEW.chat_id AND c.last_completed_day_key>=NEW.day_key)
    THEN RAISE(ABORT,'v2_draw_capture_incomplete') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tag_run_v2_pool_config p
    WHERE p.config_id=1 AND p.wallet_account='isthatajoint' AND p.status='review_only'
      AND p.daily_bps=500 AND p.active_daily_bps=100 AND p.active_policy_version=2
      AND p.historical_ticket_bps=5000) THEN RAISE(ABORT,'v2_draw_pool_not_reviewed') END;
  SELECT CASE WHEN (SELECT count(*) FROM tag_run_v2_snapshots s WHERE s.chat_id=NEW.chat_id AND s.day_key=NEW.day_key)
    !=json_array_length(NEW.input_json,'$.snapshots') OR EXISTS(
    SELECT 1 FROM json_each(NEW.input_json,'$.snapshots') j WHERE NOT EXISTS(
      SELECT 1 FROM tag_run_v2_snapshots s JOIN tag_run_v2_assets a ON a.asset_key=s.asset_key
      WHERE s.chat_id=NEW.chat_id AND s.day_key=NEW.day_key
        AND s.asset_key=json_extract(j.value,'$.asset_key') AND s.status='verified'
        AND a.eligibility='approved' AND length(a.reviewed_by)>0 AND length(a.verified_at)>0
        AND s.reward_policy_bps=100 AND s.snapshot_digest=json_extract(j.value,'$.snapshot_digest')
        AND s.chain_irreversible_block=json_extract(j.value,'$.chain_irreversible_block')
        AND s.chain_block_id=json_extract(j.value,'$.chain_block_id')
        AND s.onchain_units=json_extract(j.value,'$.onchain_units')
        AND s.allocated_unpaid_units=json_extract(j.value,'$.allocated_unpaid_units')
        AND s.excluded_units=json_extract(j.value,'$.excluded_units')
        AND s.spendable_units=json_extract(j.value,'$.spendable_units')
        AND s.daily_reward_units=json_extract(j.value,'$.daily_reward_units')
        AND a.chain_id=json_extract(j.value,'$.chain_id')
        AND a.token_contract=json_extract(j.value,'$.token_contract')
        AND a.token_symbol=json_extract(j.value,'$.token_symbol')
        AND a.token_precision=json_extract(j.value,'$.token_precision')
    )) THEN RAISE(ABORT,'v2_draw_snapshot_changed') END;
  SELECT CASE WHEN (SELECT count(*) FROM tag_run_v2_participation p WHERE p.chat_id=NEW.chat_id AND p.day_key<=NEW.day_key)
    !=json_array_length(NEW.input_json,'$.participation') OR EXISTS(
    SELECT 1 FROM json_each(NEW.input_json,'$.participation') j WHERE NOT EXISTS(
      SELECT 1 FROM tag_run_v2_participation p WHERE p.chat_id=NEW.chat_id
        AND p.day_key=json_extract(j.value,'$.day_key') AND p.telegram_id=json_extract(j.value,'$.telegram_id')
        AND p.earned_weight=json_extract(j.value,'$.earned_weight')
        AND p.spent_historical_weight=json_extract(j.value,'$.spent_historical_weight')
        AND p.source_receipts_digest=json_extract(j.value,'$.source_receipts_digest')
    )) THEN RAISE(ABORT,'v2_draw_participation_changed') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.input_json,'$.deposits') j WHERE NOT EXISTS(
    SELECT 1 FROM tag_run_v2_deposits d WHERE d.chain_id=json_extract(j.value,'$.chain_id')
      AND d.global_action_seq=json_extract(j.value,'$.global_action_seq')
      AND d.asset_key=json_extract(j.value,'$.asset_key') AND d.units=json_extract(j.value,'$.units')
      AND d.block_num=json_extract(j.value,'$.block_num') AND d.block_id=json_extract(j.value,'$.block_id')
      AND d.transaction_id=json_extract(j.value,'$.transaction_id') AND d.memo_digest=json_extract(j.value,'$.memo_digest')
      AND d.recipient_account='isthatajoint' AND d.status='confirmed_donation'
      AND d.reviewed_at=json_extract(j.value,'$.reviewed_at')
  )) THEN RAISE(ABORT,'v2_draw_donation_revoked') END;
  SELECT CASE WHEN (SELECT count(*) FROM tag_run_v2_bundles b JOIN tag_run_v2_draws d
    ON d.chat_id=b.chat_id AND d.day_key=b.day_key LEFT JOIN tag_run_v2_payout_intents i
    ON i.chat_id=b.chat_id AND i.day_key=b.day_key AND i.asset_key=b.asset_key AND i.bundle_index=b.bundle_index
    WHERE d.status='reviewed' AND (i.status IS NULL OR i.status!='confirmed')
      AND b.asset_key IN (SELECT json_extract(value,'$.asset_key') FROM json_each(NEW.input_json,'$.snapshots')))
    !=json_array_length(NEW.input_json,'$.outstanding') OR EXISTS(
    SELECT 1 FROM json_each(NEW.input_json,'$.outstanding') j WHERE NOT EXISTS(
      SELECT 1 FROM tag_run_v2_bundles b JOIN tag_run_v2_draws d ON d.chat_id=b.chat_id AND d.day_key=b.day_key
      LEFT JOIN tag_run_v2_payout_intents i ON i.chat_id=b.chat_id AND i.day_key=b.day_key
        AND i.asset_key=b.asset_key AND i.bundle_index=b.bundle_index
      WHERE b.chat_id=json_extract(j.value,'$.chat_id') AND b.day_key=json_extract(j.value,'$.day_key')
        AND b.asset_key=json_extract(j.value,'$.asset_key') AND b.bundle_index=json_extract(j.value,'$.bundle_index')
        AND b.units=json_extract(j.value,'$.units') AND d.status='reviewed' AND (i.status IS NULL OR i.status!='confirmed')
    )) THEN RAISE(ABORT,'v2_draw_reservations_changed') END;
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_workflow_update_guard BEFORE UPDATE ON tag_run_v2_draw_workflows BEGIN
  SELECT CASE WHEN NEW.chat_id!=OLD.chat_id OR NEW.day_key!=OLD.day_key OR NEW.committed_by!=OLD.committed_by
    OR NEW.input_json!=OLD.input_json OR NEW.inputs_digest!=OLD.inputs_digest OR NEW.seed_commitment!=OLD.seed_commitment
    OR NEW.observed_head!=OLD.observed_head OR NEW.beacon_block!=OLD.beacon_block
    OR NEW.commit_not_after!=OLD.commit_not_after OR NEW.created_at!=OLD.created_at
    OR NOT ((OLD.state='committed' AND NEW.state='revealed') OR (OLD.state='revealed' AND NEW.state='reviewed')
      OR (OLD.state IN ('committed','revealed') AND NEW.state='rejected'))
    THEN RAISE(ABORT,'v2_draw_workflow_immutable') END;
  SELECT CASE WHEN NEW.state='revealed' AND (NEW.reviewed_by IS NOT NULL OR NEW.rejection_reason IS NOT NULL
    OR json_array_length(NEW.bundles_json)=0 OR NEW.seed_reveal IS NULL OR length(NEW.seed_reveal)!=64 OR NEW.seed_reveal GLOB '*[^0-9a-f]*'
    OR NEW.beacon_id IS NULL OR length(NEW.beacon_id)!=64 OR NEW.beacon_id GLOB '*[^0-9a-f]*')
    THEN RAISE(ABORT,'v2_draw_bad_reveal') END;
  SELECT CASE WHEN NEW.state IN ('reviewed','rejected') AND (NEW.seed_reveal IS NOT OLD.seed_reveal OR NEW.beacon_id IS NOT OLD.beacon_id
    OR NEW.bundles_json!=OLD.bundles_json OR NEW.debits_json!=OLD.debits_json OR length(NEW.reviewed_by)=0
    OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.committed_by
    OR (NEW.state='rejected' AND (NEW.rejection_reason IS NULL OR length(NEW.rejection_reason)=0))
    OR (NEW.state='reviewed' AND NEW.rejection_reason IS NOT NULL))
    THEN RAISE(ABORT,'v2_draw_independent_review_required') END;
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_workflow_source_guard BEFORE UPDATE ON tag_run_v2_draw_workflows
WHEN NEW.state IN ('revealed','reviewed') BEGIN

  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tag_run_v2_capture_cursors c WHERE c.chat_id=NEW.chat_id AND c.last_completed_day_key>=NEW.day_key)
    THEN RAISE(ABORT,'v2_draw_capture_incomplete') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tag_run_v2_pool_config p
    WHERE p.config_id=1 AND p.wallet_account='isthatajoint' AND p.status='review_only'
      AND p.daily_bps=500 AND p.active_daily_bps=100 AND p.active_policy_version=2
      AND p.historical_ticket_bps=5000) THEN RAISE(ABORT,'v2_draw_pool_not_reviewed') END;
  SELECT CASE WHEN (SELECT count(*) FROM tag_run_v2_snapshots s WHERE s.chat_id=NEW.chat_id AND s.day_key=NEW.day_key)
    !=json_array_length(NEW.input_json,'$.snapshots') OR EXISTS(
    SELECT 1 FROM json_each(NEW.input_json,'$.snapshots') j WHERE NOT EXISTS(
      SELECT 1 FROM tag_run_v2_snapshots s JOIN tag_run_v2_assets a ON a.asset_key=s.asset_key
      WHERE s.chat_id=NEW.chat_id AND s.day_key=NEW.day_key
        AND s.asset_key=json_extract(j.value,'$.asset_key') AND s.status='verified'
        AND a.eligibility='approved' AND length(a.reviewed_by)>0 AND length(a.verified_at)>0
        AND s.reward_policy_bps=100 AND s.snapshot_digest=json_extract(j.value,'$.snapshot_digest')
        AND s.chain_irreversible_block=json_extract(j.value,'$.chain_irreversible_block')
        AND s.chain_block_id=json_extract(j.value,'$.chain_block_id')
        AND s.onchain_units=json_extract(j.value,'$.onchain_units')
        AND s.allocated_unpaid_units=json_extract(j.value,'$.allocated_unpaid_units')
        AND s.excluded_units=json_extract(j.value,'$.excluded_units')
        AND s.spendable_units=json_extract(j.value,'$.spendable_units')
        AND s.daily_reward_units=json_extract(j.value,'$.daily_reward_units')
        AND a.chain_id=json_extract(j.value,'$.chain_id')
        AND a.token_contract=json_extract(j.value,'$.token_contract')
        AND a.token_symbol=json_extract(j.value,'$.token_symbol')
        AND a.token_precision=json_extract(j.value,'$.token_precision')
    )) THEN RAISE(ABORT,'v2_draw_snapshot_changed') END;
  SELECT CASE WHEN (SELECT count(*) FROM tag_run_v2_participation p WHERE p.chat_id=NEW.chat_id AND p.day_key<=NEW.day_key)
    !=json_array_length(NEW.input_json,'$.participation') OR EXISTS(
    SELECT 1 FROM json_each(NEW.input_json,'$.participation') j WHERE NOT EXISTS(
      SELECT 1 FROM tag_run_v2_participation p WHERE p.chat_id=NEW.chat_id
        AND p.day_key=json_extract(j.value,'$.day_key') AND p.telegram_id=json_extract(j.value,'$.telegram_id')
        AND p.earned_weight=json_extract(j.value,'$.earned_weight')
        AND p.spent_historical_weight=json_extract(j.value,'$.spent_historical_weight')
        AND p.source_receipts_digest=json_extract(j.value,'$.source_receipts_digest')
    )) THEN RAISE(ABORT,'v2_draw_participation_changed') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.input_json,'$.deposits') j WHERE NOT EXISTS(
    SELECT 1 FROM tag_run_v2_deposits d WHERE d.chain_id=json_extract(j.value,'$.chain_id')
      AND d.global_action_seq=json_extract(j.value,'$.global_action_seq')
      AND d.asset_key=json_extract(j.value,'$.asset_key') AND d.units=json_extract(j.value,'$.units')
      AND d.block_num=json_extract(j.value,'$.block_num') AND d.block_id=json_extract(j.value,'$.block_id')
      AND d.transaction_id=json_extract(j.value,'$.transaction_id') AND d.memo_digest=json_extract(j.value,'$.memo_digest')
      AND d.recipient_account='isthatajoint' AND d.status='confirmed_donation'
      AND d.reviewed_at=json_extract(j.value,'$.reviewed_at')
  )) THEN RAISE(ABORT,'v2_draw_donation_revoked') END;
  SELECT CASE WHEN (SELECT count(*) FROM tag_run_v2_bundles b JOIN tag_run_v2_draws d
    ON d.chat_id=b.chat_id AND d.day_key=b.day_key LEFT JOIN tag_run_v2_payout_intents i
    ON i.chat_id=b.chat_id AND i.day_key=b.day_key AND i.asset_key=b.asset_key AND i.bundle_index=b.bundle_index
    WHERE d.status='reviewed' AND (i.status IS NULL OR i.status!='confirmed')
      AND b.asset_key IN (SELECT json_extract(value,'$.asset_key') FROM json_each(NEW.input_json,'$.snapshots')))
    !=json_array_length(NEW.input_json,'$.outstanding') OR EXISTS(
    SELECT 1 FROM json_each(NEW.input_json,'$.outstanding') j WHERE NOT EXISTS(
      SELECT 1 FROM tag_run_v2_bundles b JOIN tag_run_v2_draws d ON d.chat_id=b.chat_id AND d.day_key=b.day_key
      LEFT JOIN tag_run_v2_payout_intents i ON i.chat_id=b.chat_id AND i.day_key=b.day_key
        AND i.asset_key=b.asset_key AND i.bundle_index=b.bundle_index
      WHERE b.chat_id=json_extract(j.value,'$.chat_id') AND b.day_key=json_extract(j.value,'$.day_key')
        AND b.asset_key=json_extract(j.value,'$.asset_key') AND b.bundle_index=json_extract(j.value,'$.bundle_index')
        AND b.units=json_extract(j.value,'$.units') AND d.status='reviewed' AND (i.status IS NULL OR i.status!='confirmed')
    )) THEN RAISE(ABORT,'v2_draw_reservations_changed') END;
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_workflow_no_delete BEFORE DELETE ON tag_run_v2_draw_workflows
BEGIN SELECT RAISE(ABORT,'v2_draw_workflow_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_workflow_reveal AFTER UPDATE ON tag_run_v2_draw_workflows WHEN NEW.state='revealed' BEGIN
  INSERT INTO tag_run_v2_bundles(chat_id,day_key,asset_key,bundle_index,telegram_id,ticket_class,units)
  SELECT NEW.chat_id,NEW.day_key,json_extract(value,'$.assetKey'),json_extract(value,'$.bundleIndex'),
    json_extract(value,'$.telegramId'),json_extract(value,'$.pool'),json_extract(value,'$.units')
    FROM json_each(NEW.bundles_json);
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_workflow_review AFTER UPDATE ON tag_run_v2_draw_workflows WHEN NEW.state='reviewed' BEGIN
  INSERT INTO tag_run_v2_draw_weight_claims(chat_id,draw_day,source_day,telegram_id,units,prior_spent,earned_weight,
    source_receipts_digest,winning_asset_key,winning_bundle_index)
  SELECT NEW.chat_id,NEW.day_key,json_extract(value,'$.sourceDay'),json_extract(value,'$.telegramId'),
    json_extract(value,'$.units'),json_extract(value,'$.priorSpent'),json_extract(value,'$.earnedWeight'),
    json_extract(value,'$.receiptDigest'),json_extract(value,'$.winningAssetKey'),json_extract(value,'$.winningBundleIndex')
    FROM json_each(NEW.debits_json);
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_draw_claim_insert_guard BEFORE INSERT ON tag_run_v2_draw_weight_claims BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_weight_claims c WHERE c.chat_id=NEW.chat_id
    AND c.draw_day=NEW.draw_day AND c.source_day=NEW.source_day AND c.telegram_id=NEW.telegram_id)
    OR NOT EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w JOIN tag_run_v2_bundles b
    ON b.chat_id=w.chat_id AND b.day_key=w.day_key WHERE w.chat_id=NEW.chat_id AND w.day_key=NEW.draw_day
    AND w.state='reviewed' AND b.asset_key=NEW.winning_asset_key AND b.bundle_index=NEW.winning_bundle_index
    AND b.ticket_class='historical' AND b.telegram_id=NEW.telegram_id AND b.units!='0')
    OR NOT EXISTS(SELECT 1 FROM tag_run_v2_participation p WHERE p.chat_id=NEW.chat_id AND p.day_key=NEW.source_day
      AND p.telegram_id=NEW.telegram_id AND p.earned_weight=NEW.earned_weight
      AND p.spent_historical_weight=NEW.prior_spent AND p.source_receipts_digest=NEW.source_receipts_digest
      AND NEW.prior_spent+NEW.units<=p.earned_weight)
    OR NEW.source_day>=NEW.draw_day
    OR NEW.units+coalesce((SELECT sum(units) FROM tag_run_v2_draw_weight_claims c
      WHERE c.chat_id=NEW.chat_id AND c.draw_day=NEW.draw_day AND c.telegram_id=NEW.telegram_id),0)>510
    THEN RAISE(ABORT,'v2_draw_historical_claim_invalid') END;
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_draw_claim_apply AFTER INSERT ON tag_run_v2_draw_weight_claims BEGIN
  UPDATE tag_run_v2_participation SET spent_historical_weight=spent_historical_weight+NEW.units
    WHERE chat_id=NEW.chat_id AND day_key=NEW.source_day AND telegram_id=NEW.telegram_id;
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_draw_claim_no_update BEFORE UPDATE ON tag_run_v2_draw_weight_claims
BEGIN SELECT RAISE(ABORT,'v2_draw_claim_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_draw_claim_no_delete BEFORE DELETE ON tag_run_v2_draw_weight_claims
BEGIN SELECT RAISE(ABORT,'v2_draw_claim_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_claimed_weight_guard BEFORE UPDATE ON tag_run_v2_participation
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_weight_claims c WHERE c.chat_id=OLD.chat_id AND c.source_day=OLD.day_key AND c.telegram_id=OLD.telegram_id)
AND (NEW.chat_id!=OLD.chat_id OR NEW.day_key!=OLD.day_key OR NEW.telegram_id!=OLD.telegram_id OR NEW.earned_weight!=OLD.earned_weight
  OR NEW.source_receipts_digest!=OLD.source_receipts_digest OR NEW.spent_historical_weight<
  (SELECT max(prior_spent+units) FROM tag_run_v2_draw_weight_claims c WHERE c.chat_id=OLD.chat_id AND c.source_day=OLD.day_key AND c.telegram_id=OLD.telegram_id))
BEGIN SELECT RAISE(ABORT,'v2_draw_claimed_source_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_claimed_weight_no_delete BEFORE DELETE ON tag_run_v2_participation
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_weight_claims c WHERE c.chat_id=OLD.chat_id AND c.source_day=OLD.day_key AND c.telegram_id=OLD.telegram_id)
BEGIN SELECT RAISE(ABORT,'v2_draw_claimed_source_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_managed_draw_update BEFORE UPDATE ON tag_run_v2_draws
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w WHERE w.chat_id=OLD.chat_id AND w.day_key=OLD.day_key) BEGIN
  SELECT CASE WHEN NEW.chat_id!=OLD.chat_id OR NEW.day_key!=OLD.day_key OR NEW.seed_commitment!=OLD.seed_commitment
    OR NEW.rules_digest!=OLD.rules_digest OR NEW.weights_digest!=OLD.weights_digest OR NEW.snapshots_digest!=OLD.snapshots_digest
    OR NEW.reward_policy_bps!=OLD.reward_policy_bps OR NEW.created_at!=OLD.created_at
    OR NOT EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w WHERE w.chat_id=OLD.chat_id AND w.day_key=OLD.day_key
      AND ((w.state='revealed' AND NEW.status='preview_only' AND OLD.seed_reveal IS NULL AND NEW.seed_reveal=w.seed_reveal AND NEW.reviewed_by IS NULL)
        OR (w.state='reviewed' AND OLD.status='preview_only' AND NEW.status='reviewed' AND NEW.seed_reveal=OLD.seed_reveal AND NEW.reviewed_by=w.reviewed_by)
        OR (w.state='rejected' AND OLD.status='preview_only' AND NEW.status='rejected' AND NEW.seed_reveal IS OLD.seed_reveal AND NEW.reviewed_by=w.reviewed_by)))
    THEN RAISE(ABORT,'v2_managed_draw_immutable') END;
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_managed_draw_no_delete BEFORE DELETE ON tag_run_v2_draws
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w WHERE w.chat_id=OLD.chat_id AND w.day_key=OLD.day_key)
BEGIN SELECT RAISE(ABORT,'v2_managed_draw_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_managed_draw_no_replace BEFORE INSERT ON tag_run_v2_draws
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w WHERE w.chat_id=NEW.chat_id AND w.day_key=NEW.day_key)
BEGIN SELECT RAISE(ABORT,'v2_managed_draw_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_managed_bundle_insert BEFORE INSERT ON tag_run_v2_bundles
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w WHERE w.chat_id=NEW.chat_id AND w.day_key=NEW.day_key) BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM tag_run_v2_bundles b WHERE b.chat_id=NEW.chat_id AND b.day_key=NEW.day_key
    AND b.asset_key=NEW.asset_key AND b.bundle_index=NEW.bundle_index) OR NOT EXISTS(
    SELECT 1 FROM tag_run_v2_draw_workflows w,json_each(w.bundles_json) j
    WHERE w.chat_id=NEW.chat_id AND w.day_key=NEW.day_key AND w.state='revealed'
      AND json_extract(j.value,'$.assetKey')=NEW.asset_key AND json_extract(j.value,'$.bundleIndex')=NEW.bundle_index
      AND json_extract(j.value,'$.telegramId')=NEW.telegram_id AND json_extract(j.value,'$.pool')=NEW.ticket_class
      AND json_extract(j.value,'$.units')=NEW.units)
    THEN RAISE(ABORT,'v2_managed_bundle_invalid') END;
END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_managed_bundle_no_update BEFORE UPDATE ON tag_run_v2_bundles
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w WHERE (w.chat_id=OLD.chat_id AND w.day_key=OLD.day_key)
  OR (w.chat_id=NEW.chat_id AND w.day_key=NEW.day_key))
BEGIN SELECT RAISE(ABORT,'v2_managed_bundle_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_managed_bundle_no_delete BEFORE DELETE ON tag_run_v2_bundles
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w WHERE w.chat_id=OLD.chat_id AND w.day_key=OLD.day_key)
BEGIN SELECT RAISE(ABORT,'v2_managed_bundle_immutable'); END;

CREATE TRIGGER IF NOT EXISTS tag_run_v2_claimed_weight_no_replace BEFORE INSERT ON tag_run_v2_participation
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_weight_claims c WHERE c.chat_id=NEW.chat_id AND c.source_day=NEW.day_key AND c.telegram_id=NEW.telegram_id)
BEGIN SELECT RAISE(ABORT,'v2_draw_claimed_source_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_committed_snapshot_no_delete BEFORE DELETE ON tag_run_v2_snapshots
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w,json_each(w.input_json,'$.snapshots') j
  WHERE w.chat_id=OLD.chat_id AND w.day_key=OLD.day_key AND json_extract(j.value,'$.asset_key')=OLD.asset_key)
BEGIN SELECT RAISE(ABORT,'v2_committed_snapshot_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_committed_snapshot_no_replace BEFORE INSERT ON tag_run_v2_snapshots
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w,json_each(w.input_json,'$.snapshots') j
  WHERE w.chat_id=NEW.chat_id AND w.day_key=NEW.day_key AND json_extract(j.value,'$.asset_key')=NEW.asset_key)
BEGIN SELECT RAISE(ABORT,'v2_committed_snapshot_immutable'); END;
CREATE TRIGGER IF NOT EXISTS tag_run_v2_committed_snapshot_update BEFORE UPDATE ON tag_run_v2_snapshots
WHEN EXISTS(SELECT 1 FROM tag_run_v2_draw_workflows w,json_each(w.input_json,'$.snapshots') j
  WHERE w.chat_id=OLD.chat_id AND w.day_key=OLD.day_key AND json_extract(j.value,'$.asset_key')=OLD.asset_key)
AND (NEW.chat_id!=OLD.chat_id OR NEW.day_key!=OLD.day_key OR NEW.asset_key!=OLD.asset_key
  OR NEW.wallet_account!=OLD.wallet_account OR NEW.chain_irreversible_block!=OLD.chain_irreversible_block
  OR NEW.chain_block_id!=OLD.chain_block_id OR NEW.onchain_units!=OLD.onchain_units
  OR NEW.allocated_unpaid_units!=OLD.allocated_unpaid_units OR NEW.excluded_units!=OLD.excluded_units
  OR NEW.spendable_units!=OLD.spendable_units OR NEW.daily_reward_units!=OLD.daily_reward_units
  OR NEW.reward_policy_bps!=OLD.reward_policy_bps OR NEW.snapshot_digest!=OLD.snapshot_digest)
BEGIN SELECT RAISE(ABORT,'v2_committed_snapshot_immutable'); END;

CREATE INDEX IF NOT EXISTS tag_run_v2_weight_claim_source ON tag_run_v2_draw_weight_claims(chat_id,source_day,telegram_id);
CREATE INDEX IF NOT EXISTS tag_run_v2_bundle_asset_journal ON tag_run_v2_bundles(asset_key,chat_id,day_key,bundle_index);
