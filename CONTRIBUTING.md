# Contributing

Thanks for looking. This project follows a few conventions that keep it small and reviewable.

## Ground rules

- **Surgical changes.** Touch only what the change needs; no drive-by refactors or reformatting. Every changed line should trace to the issue or feature.
- **Data access goes through one place.** Backend: `src/notes.ts` (workspace isolation and version snapshots live there; routes never write SQL for notes). Frontend: `web/src/lib/api.ts` (components never call `fetch`).
- **Security baseline.** Every query carries the workspace condition. Tokens are stored hashed. Outbound HTTP uses `safeFetch` from `src/net-guard.ts`. New user-facing errors are bilingual (`{ 'zh-TW': …, en: … }`) via `NoteError`.
- **Two languages.** Interface strings live in `web/src/i18n/*.ts` (keys must exist in both `zh-TW` and `en`). Agent prompts and MCP messages take a `lang` parameter. Wiki content is never translated.
- **Karpathy's pattern is the spec.** Three layers, `index.md`/`log.md`, Ingest/Query/Lint. Features that fight the pattern are out of scope.

## Local setup

```bash
cp .env.example .env             # DATABASE_URL, BETTER_AUTH_SECRET, DEV_MCP_TOKEN (openssl rand -hex 32)
createdb wikibrain               # PostgreSQL 16 or newer
npm install && npm run db:seed   # migrations, a verified dev account, a workspace and an MCP token
npm run dev                      # API on 3000, Vite on 5173 - open http://localhost:5173
```

Running it in Docker instead is described in [DEPLOY.md](DEPLOY.md).

## Changing the shipped rules

The pages under `templates/<id>/<lang>/schema/` are what the agent reads before it writes. Workspaces keep the copy
they were given, so improving them needs one extra step: **bump `version` in that template's `template.json`**.

Existing workspaces then see an offer in Settings:

- a page they never edited is replaced;
- a page they edited in a *different* section is merged, keeping both sides (three-way, against the text we originally
  delivered);
- a page where both sides changed the same section is left alone and shown as a difference. They can choose to replace
  it, and their text stays in the page's version history.

A merge never writes conflict markers. The result is a page an agent reads as instructions, and `<<<<<<<` in there
would be read as part of the rules. Without the version bump nothing is offered and the improvement reaches new
workspaces only.

## Workflow

1. Open an issue describing the problem and the smallest change that fixes it.
2. Branch, implement, add or update tests:
   - backend: `test/*.test.ts` (`npm test`, needs a local PostgreSQL 16; each file creates its own user and cleans up),
   - frontend: `test/e2e/m3_web.py` (Playwright; needs `npm run dev` running).
3. `npm run typecheck && npm test` must pass. Run the E2E suite when the UI changed.
4. Keep the PR description short: what, why, how verified. Screenshots for UI changes.

## Where things are

| Area | Path |
|---|---|
| MCP tools and transport | `src/mcp.ts`, `src/app.ts` |
| Notes, links, tags, versions | `src/notes.ts`, `migrations/` |
| Source import (URL/PDF/Word/…) and SSRF guard | `src/import.ts`, `src/headless.ts`, `src/net-guard.ts` |
| Bibliography, citations, Zotero | `src/bib.ts`, `src/zotero.ts`, `web/src/lib/cite.tsx` |
| Server-side agent (ingest, chat, lint) | `src/ingest.ts`, `src/chat.ts`, `src/lint.ts`, `src/ai/providers.ts` |
| Auth: sessions, bearer tokens, OAuth 2.1 | `src/auth-web.ts`, `src/auth.ts`, `src/oauth.ts` |
| Templates (rules + starter pages) | `templates/<id>/<lang>/…`, `src/templates.ts` |
| Web UI | `web/src/pages`, `web/src/components`, `web/src/i18n` |

## Reporting security issues

Please do not open a public issue. Email the maintainer (address in the repository profile) with steps to reproduce; you will get a reply within a few days.
