-- Development migration only. Production schema is applied by Replit Publish.
CREATE TABLE IF NOT EXISTS envoi_workspaces (
  id uuid PRIMARY KEY,
  capability_hash text NOT NULL UNIQUE,
  generation integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 0,
  document jsonb NOT NULL,
  active_operation uuid,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS envoi_operations (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  generation integer NOT NULL,
  kind text NOT NULL,
  signature text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','unknown','complete','failed')),
  detail text NOT NULL DEFAULT '',
  payload jsonb,
  owner uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS envoi_operations_workspace ON envoi_operations(workspace_id);
ALTER TABLE envoi_operations ADD COLUMN IF NOT EXISTS owner uuid NOT NULL DEFAULT gen_random_uuid();
CREATE TABLE IF NOT EXISTS envoi_rate_limits (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS envoi_budgets (
  kind text PRIMARY KEY,
  approved integer NOT NULL DEFAULT 0 CHECK (approved >= 0),
  spent integer NOT NULL DEFAULT 0 CHECK (spent >= 0)
);
INSERT INTO envoi_budgets(kind) VALUES ('chain'), ('model') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS envoi_broadcasts (
  tx_hash text PRIMARY KEY,
  operation_id uuid NOT NULL,
  issuer text NOT NULL,
  nonce bigint NOT NULL,
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, nonce)
);
