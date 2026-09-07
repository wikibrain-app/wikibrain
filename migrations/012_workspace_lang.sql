-- Workspace language (Q10): affects only the UI, template defaults and agent system prompts; content language is unrestricted.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT 'zh-TW';
