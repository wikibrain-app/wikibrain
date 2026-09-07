-- Validate the foreign keys added NOT VALID in 002; orphan rows have been cleaned up by db:seed.
ALTER TABLE workspaces VALIDATE CONSTRAINT workspaces_owner_fk;
ALTER TABLE mcp_tokens VALIDATE CONSTRAINT mcp_tokens_user_fk;
