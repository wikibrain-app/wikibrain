-- OAuth-granted scopes must actually be enforced (security review S1): PATs always get full access.
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT '{notes:read,notes:write}';
