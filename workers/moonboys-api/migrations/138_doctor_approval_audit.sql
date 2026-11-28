ALTER TABLE doctor_merge_approvals ADD COLUMN decision_actor TEXT;
ALTER TABLE doctor_merge_approvals ADD COLUMN merge_sha TEXT;

CREATE TABLE doctor_approval_audit (
  approval_id INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('approved','rejected','fix_requested','invalidated','merged','merge_evidence')),
  source_revision INTEGER NOT NULL,
  repo TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  actor_telegram_id TEXT,
  merge_sha TEXT,
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY (approval_id, revision, action)
);

-- Keep the audit insert in the same statement as the state transition.
CREATE TRIGGER doctor_approval_audit_transition
AFTER UPDATE ON doctor_merge_approvals
WHEN NEW.revision > OLD.revision AND NEW.state IN ('approved','rejected','fix_requested','invalidated','merged')
BEGIN
  INSERT INTO doctor_approval_audit
  VALUES (NEW.id, NEW.revision, NEW.state, OLD.revision, NEW.repo, NEW.pr_number,
          NEW.head_sha, NEW.base_sha,
          CASE WHEN NEW.state IN ('approved','rejected','fix_requested') THEN NEW.decision_actor END,
          NEW.merge_sha, NEW.updated_at);
END;

-- A mixed-version rollout can report a merge before its commit is supplied.
CREATE TRIGGER doctor_approval_audit_merge_evidence
AFTER UPDATE OF merge_sha ON doctor_merge_approvals
WHEN OLD.state = 'merged' AND NEW.state = 'merged' AND OLD.merge_sha IS NULL AND NEW.merge_sha IS NOT NULL
BEGIN
  INSERT INTO doctor_approval_audit
  VALUES (NEW.id, NEW.revision, 'merge_evidence', OLD.revision, NEW.repo, NEW.pr_number,
          NEW.head_sha, NEW.base_sha, NULL, NEW.merge_sha, NEW.updated_at);
END;

CREATE TRIGGER doctor_approval_audit_no_update
BEFORE UPDATE ON doctor_approval_audit
BEGIN
  SELECT RAISE(ABORT, 'Doctor approval audit is append-only');
END;

CREATE TRIGGER doctor_approval_audit_no_delete
BEFORE DELETE ON doctor_approval_audit
BEGIN
  SELECT RAISE(ABORT, 'Doctor approval audit is append-only');
END;
