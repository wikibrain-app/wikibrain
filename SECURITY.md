# Security policy

WikiBrain stores personal knowledge bases and users' API keys, so we take reports seriously.

## Reporting a vulnerability

Please e-mail **hello@wikibrain.app** with a description, reproduction steps and the affected version (from `/healthz` or the page footer). Do not open a public issue for security problems. We aim to acknowledge within 3 working days and to fix confirmed issues in this repository before publishing details.

## Scope

- This repository. (The hosted service at wikibrain.app was shut down on 2026-11-09.)
- Out of scope: third-party providers you connect with your own keys (AI providers, Zotero), and self-hosted instances run by others.

## What we already do

HTTPS only; passwords hashed; user API keys encrypted (AES-256-GCM, key separate from the session secret); MCP tokens stored as hashes; OAuth 2.1 with PKCE and scoped tokens; per-workspace isolation on every query; rate limits per IP, token and user; SSRF protection with DNS pinning on all outbound fetches; a sandboxed headless browser behind a filtering proxy for imports.
