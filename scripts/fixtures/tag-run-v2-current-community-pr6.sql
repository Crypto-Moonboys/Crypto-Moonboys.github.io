-- TAG RUN V2 PR6 - ONE CONFIGURED TELEGRAM COMMUNITY ONLY.
-- Offline SQLite fixture. NEVER apply as a production D1 migration.
-- This does not approve donor consent, fund tokens, reserve wallet balances,
-- operate a signer, or enable WAX transfers.
CREATE TABLE tag_run_v2_current_community_scope_rehearsal (
  scope_id INTEGER NOT NULL PRIMARY KEY CHECK(scope_id=1),
  group_chat_id TEXT NOT NULL UNIQUE CHECK(
    length(group_chat_id) BETWEEN 9 AND 24 AND
    substr(group_chat_id,1,4)='-100' AND
    substr(group_chat_id,5) NOT GLOB '*[^0-9]*'
  ),
  mode TEXT NOT NULL DEFAULT 'simulation_only' CHECK(mode='simulation_only')
) WITHOUT ROWID;
-- Fail CLOSED when the PR2/PR5 disposable tables were populated before
-- this fixture was installed. INSERT-only guards below cannot quarantine
-- pre-existing foreign-group rows, and existing holds can still be mutated.
-- Check all three sources before permitting the one immutable group binding.
-- No deletes, reassignment, sweeping or background cleanup are performed.
CREATE TRIGGER tag_run_v2_current_community_existing_rows_guard
BEFORE INSERT ON tag_run_v2_current_community_scope_rehearsal
WHEN EXISTS (
  SELECT 1 FROM tag_run_v2_payout_intents_rehearsal i
  WHERE i.chat_id!=NEW.group_chat_id
) OR EXISTS (
  SELECT 1 FROM tag_run_v2_atomic_budget_rehearsal b
  WHERE b.chat_id!=NEW.group_chat_id
) OR EXISTS (
  SELECT 1 FROM tag_run_v2_atomic_holds_rehearsal h
  WHERE h.chat_id!=NEW.group_chat_id
)
BEGIN SELECT RAISE(ABORT,'current_community_existing_foreign_rows'); END;
CREATE TRIGGER tag_run_v2_current_community_no_replace
BEFORE INSERT ON tag_run_v2_current_community_scope_rehearsal
WHEN EXISTS (SELECT 1 FROM tag_run_v2_current_community_scope_rehearsal)
BEGIN SELECT RAISE(ABORT,'current_community_scope_locked'); END;
CREATE TRIGGER tag_run_v2_current_community_no_update
BEFORE UPDATE ON tag_run_v2_current_community_scope_rehearsal
BEGIN SELECT RAISE(ABORT,'current_community_scope_locked'); END;
CREATE TRIGGER tag_run_v2_current_community_no_delete
BEFORE DELETE ON tag_run_v2_current_community_scope_rehearsal
BEGIN SELECT RAISE(ABORT,'current_community_scope_locked'); END;

-- The existing PR2 intents and PR5 budgets/holds must all share the same
-- authenticated Telegram group. These triggers protect DIRECT SQL writes as
-- well as the Node rehearsal API. A second group cannot enrol in this model.
CREATE TRIGGER tag_run_v2_current_community_intent_guard
BEFORE INSERT ON tag_run_v2_payout_intents_rehearsal
WHEN NOT EXISTS (
  SELECT 1 FROM tag_run_v2_current_community_scope_rehearsal g
  WHERE g.scope_id=1 AND g.group_chat_id=NEW.chat_id
)
BEGIN SELECT RAISE(ABORT,'current_community_mismatch'); END;
CREATE TRIGGER tag_run_v2_current_community_budget_guard
BEFORE INSERT ON tag_run_v2_atomic_budget_rehearsal
WHEN NOT EXISTS (
  SELECT 1 FROM tag_run_v2_current_community_scope_rehearsal g
  WHERE g.scope_id=1 AND g.group_chat_id=NEW.chat_id
)
BEGIN SELECT RAISE(ABORT,'current_community_mismatch'); END;
CREATE TRIGGER tag_run_v2_current_community_hold_guard
BEFORE INSERT ON tag_run_v2_atomic_holds_rehearsal
WHEN NOT EXISTS (
  SELECT 1 FROM tag_run_v2_current_community_scope_rehearsal g
  WHERE g.scope_id=1 AND g.group_chat_id=NEW.chat_id
)
BEGIN SELECT RAISE(ABORT,'current_community_mismatch'); END;
