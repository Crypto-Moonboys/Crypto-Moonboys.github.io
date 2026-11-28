ALTER TABLE doctor_merge_approvals ADD COLUMN auto_allowed INTEGER NOT NULL DEFAULT 0 CHECK(auto_allowed IN (0,1));
ALTER TABLE doctor_merge_approvals ADD COLUMN decision_mode TEXT NOT NULL DEFAULT 'manual' CHECK(decision_mode IN ('manual','auto'));
ALTER TABLE doctor_approval_audit ADD COLUMN decision_mode TEXT NOT NULL DEFAULT 'manual' CHECK(decision_mode IN ('manual','auto'));

DROP TRIGGER doctor_approval_audit_transition;
CREATE TRIGGER doctor_approval_audit_transition
AFTER UPDATE ON doctor_merge_approvals
WHEN NEW.revision > OLD.revision AND NEW.state IN ('approved','rejected','fix_requested','invalidated','merged')
BEGIN
  INSERT INTO doctor_approval_audit
  VALUES (NEW.id, NEW.revision, NEW.state, OLD.revision, NEW.repo, NEW.pr_number,
          NEW.head_sha, NEW.base_sha,
          CASE WHEN NEW.state IN ('approved','rejected','fix_requested') THEN NEW.decision_actor END,
          NEW.merge_sha, NEW.updated_at, NEW.decision_mode);
END;

DROP TRIGGER doctor_approval_audit_merge_evidence;
CREATE TRIGGER doctor_approval_audit_merge_evidence
AFTER UPDATE OF merge_sha ON doctor_merge_approvals
WHEN OLD.state = 'merged' AND NEW.state = 'merged' AND OLD.merge_sha IS NULL AND NEW.merge_sha IS NOT NULL
BEGIN
  INSERT INTO doctor_approval_audit
  VALUES (NEW.id, NEW.revision, 'merge_evidence', OLD.revision, NEW.repo, NEW.pr_number,
          NEW.head_sha, NEW.base_sha, NULL, NEW.merge_sha, NEW.updated_at, NEW.decision_mode);
END;
