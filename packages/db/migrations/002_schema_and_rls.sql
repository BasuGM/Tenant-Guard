-- Application role without BYPASSRLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenantguard_app') THEN
    CREATE ROLE tenantguard_app LOGIN PASSWORD 'tenantguard_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT CONNECT ON DATABASE tenantguard TO tenantguard_app;
GRANT USAGE ON SCHEMA public TO tenantguard_app;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL,
  subject text NOT NULL,
  email text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  active_tenant_id uuid REFERENCES tenants(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  session_id uuid NOT NULL REFERENCES sessions(id),
  token_hash text NOT NULL UNIQUE,
  parent_id uuid,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oidc_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL UNIQUE,
  nonce text NOT NULL,
  code_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  system_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  role_id uuid NOT NULL REFERENCES roles(id),
  permission_id uuid NOT NULL REFERENCES permissions(id),
  UNIQUE (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS membership_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  membership_id uuid NOT NULL REFERENCES memberships(id),
  role_id uuid NOT NULL REFERENCES roles(id),
  UNIQUE (membership_id, role_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, membership_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  email text NOT NULL,
  role_system_key text NOT NULL,
  token_hash text NOT NULL,
  invited_by uuid REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  actor_user_id uuid,
  action text NOT NULL,
  resource_type text,
  resource_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  format text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  idempotency_key text,
  object_key text,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  created_by uuid REFERENCES users(id),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tenant-owned tables: FORCE RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE POLICY tenant_isolation_tenants ON tenants
  USING (id = app_current_tenant_id())
  WITH CHECK (id = app_current_tenant_id());

CREATE POLICY tenant_isolation_memberships ON memberships
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY tenant_isolation_roles ON roles
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY tenant_isolation_role_permissions ON role_permissions
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY tenant_isolation_membership_roles ON membership_roles
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY tenant_isolation_projects ON projects
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY tenant_isolation_project_members ON project_members
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY tenant_isolation_invitations ON invitations
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY tenant_isolation_export_jobs ON export_jobs
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY tenant_isolation_api_keys ON api_keys
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- SECURITY DEFINER identity helpers (fixed search_path)
CREATE OR REPLACE FUNCTION app_get_session(p_session_id uuid)
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  email text,
  display_name text,
  active_tenant_id uuid,
  expires_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, u.id, u.email, u.display_name, s.active_tenant_id, s.expires_at, s.revoked_at
  FROM sessions s
  INNER JOIN users u ON u.id = s.user_id
  WHERE s.id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_get_membership(p_user_id uuid, p_tenant_id uuid)
RETURNS TABLE (
  membership_id uuid,
  permissions text[],
  system_roles text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    COALESCE(array_agg(DISTINCT p.key) FILTER (WHERE p.key IS NOT NULL), '{}'),
    COALESCE(array_agg(DISTINCT r.system_key) FILTER (WHERE r.system_key IS NOT NULL), '{}')
  FROM memberships m
  LEFT JOIN membership_roles mr ON mr.membership_id = m.id
  LEFT JOIN roles r ON r.id = mr.role_id
  LEFT JOIN role_permissions rp ON rp.role_id = r.id
  LEFT JOIN permissions p ON p.id = rp.permission_id
  WHERE m.user_id = p_user_id
    AND m.tenant_id = p_tenant_id
    AND m.deactivated_at IS NULL
  GROUP BY m.id;
END;
$$;

CREATE OR REPLACE FUNCTION app_list_my_tenants(p_user_id uuid)
RETURNS TABLE (
  tenant_id uuid,
  name text,
  slug text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name, t.slug
  FROM tenants t
  INNER JOIN memberships m ON m.tenant_id = t.id
  WHERE m.user_id = p_user_id
    AND m.deactivated_at IS NULL
  ORDER BY t.name;
END;
$$;

CREATE OR REPLACE FUNCTION app_accept_invitation(
  p_user_id uuid,
  p_email text,
  p_token_hash text
)
RETURNS TABLE (
  tenant_id uuid,
  membership_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite invitations%ROWTYPE;
  v_membership_id uuid;
  v_role_id uuid;
BEGIN
  SELECT * INTO v_invite
  FROM invitations
  WHERE token_hash = p_token_hash
    AND lower(email) = lower(p_email)
  FOR UPDATE;

  IF NOT FOUND OR v_invite.accepted_at IS NOT NULL OR v_invite.expires_at <= now() THEN
    RETURN;
  END IF;

  INSERT INTO memberships (tenant_id, user_id)
  VALUES (v_invite.tenant_id, p_user_id)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET deactivated_at = NULL
  RETURNING id INTO v_membership_id;

  SELECT id INTO v_role_id
  FROM roles
  WHERE tenant_id = v_invite.tenant_id
    AND system_key = v_invite.role_system_key
  LIMIT 1;

  IF v_role_id IS NOT NULL THEN
    INSERT INTO membership_roles (tenant_id, membership_id, role_id)
    VALUES (v_invite.tenant_id, v_membership_id, v_role_id)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE invitations SET accepted_at = now() WHERE id = v_invite.id;

  INSERT INTO audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id)
  VALUES (v_invite.tenant_id, p_user_id, 'member.accept', 'membership', v_membership_id);

  tenant_id := v_invite.tenant_id;
  membership_id := v_membership_id;
  RETURN NEXT;
END;
$$;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tenantguard_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tenantguard_app;
GRANT EXECUTE ON FUNCTION app_get_session(uuid) TO tenantguard_app;
GRANT EXECUTE ON FUNCTION app_get_membership(uuid, uuid) TO tenantguard_app;
GRANT EXECUTE ON FUNCTION app_list_my_tenants(uuid) TO tenantguard_app;
GRANT EXECUTE ON FUNCTION app_accept_invitation(uuid, text, text) TO tenantguard_app;
GRANT EXECUTE ON FUNCTION app_current_tenant_id() TO tenantguard_app;

-- Bootstrap inserts of tenants happen as owner role during org creation.
-- tenantguard_app needs INSERT on tenants without RLS blocking the first row.
-- Allow insert when setting matches the new id via WITH CHECK above.
-- Org creation runs as migration/bootstrap connection before switching tenant context:
-- grant table privileges already cover users/sessions (no RLS).

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tenantguard_app;
