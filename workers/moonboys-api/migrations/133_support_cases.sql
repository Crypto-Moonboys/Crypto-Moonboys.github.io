CREATE TABLE IF NOT EXISTS support_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intake_key TEXT NOT NULL UNIQUE,
  reporter_id TEXT NOT NULL,
  report TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'submitted',
  revision INTEGER NOT NULL DEFAULT 1,
  approved_revision INTEGER NOT NULL DEFAULT 0,
  feedback TEXT NOT NULL DEFAULT '',
  review TEXT NOT NULL DEFAULT '',
  fix TEXT NOT NULL DEFAULT '',
  paths TEXT NOT NULL DEFAULT '[]',
  base_sha TEXT NOT NULL DEFAULT '',
  doctor_status TEXT NOT NULL DEFAULT '',
  doctor_reason TEXT NOT NULL DEFAULT '',
  pr_url TEXT NOT NULL DEFAULT '',
  owner_notice INTEGER NOT NULL DEFAULT 1,
  reporter_notice INTEGER NOT NULL DEFAULT 1,
  polled_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS support_cases_reporter_created ON support_cases(reporter_id, created_at);
CREATE INDEX IF NOT EXISTS support_cases_poll ON support_cases(polled_at, id);
