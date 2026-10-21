-- Role użytkowników (istniejące konta zostają administratorami) oraz dziennik zmian.
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users
  ADD CONSTRAINT app_users_role_check CHECK (role IN ('admin', 'warehouse', 'viewer'));

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id BIGINT,
  username TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  entity TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  status_code INTEGER,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_log_occurred_at_idx ON audit_log (occurred_at DESC, id DESC);
