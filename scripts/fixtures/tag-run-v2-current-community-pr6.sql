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
