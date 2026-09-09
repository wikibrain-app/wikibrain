# Self-hosting WikiBrain with Docker

WikiBrain runs as one container plus a PostgreSQL database. The image contains the API, the MCP server and the built web app; database migrations are applied automatically on start. Everything below uses `docker compose` from a clone of this repository.

For local development without Docker, see [CONTRIBUTING.md](CONTRIBUTING.md). Every environment variable is listed in `.env.example`.

## Requirements

- Docker with the Compose plugin.
- About 2 GB of disk for the image. It bundles headless Chromium so that JavaScript-rendered pages can be imported; set `IMPORT_HEADLESS=0` to skip it.
- A domain and a TLS-terminating reverse proxy if you expose the instance to the internet.

## Quick start

```bash
git clone https://github.com/wikibrain-app/wikibrain.git && cd wikibrain

export BETTER_AUTH_SECRET=$(openssl rand -hex 32)
mkdir -p secrets && openssl rand -hex 32 > secrets/wikibrain_key
export APP_URL=http://localhost:3000

docker compose up -d
open http://localhost:3000
```

Register the first account. Without a mail provider configured, the verification link is printed to the container log:

```bash
docker compose logs -f app | grep -A2 'mail →'
```

## Configuration

`docker-compose.yml` starts PostgreSQL and passes these to the app. Set them in your shell, an `.env` file next to the compose file, or your orchestrator.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Set by compose to the bundled database. Point it at your own PostgreSQL 16 or newer if you have one. |
| `APP_URL` | yes | The exact URL users type in the browser, including scheme. Read the next section before changing it. |
| `BETTER_AUTH_SECRET` | yes | Signs sessions. 32 bytes of hex. |
| `KEY_ENCRYPTION_SECRET_FILE` | yes in production | Path to a file holding the key that encrypts users' stored API keys. Compose mounts `secrets/wikibrain_key`. `KEY_ENCRYPTION_SECRET` works too but keeps the key in the environment. |
| `NODE_ENV` | yes in production | With `production` the server refuses to start without a separate encryption key. |
| `PORT` | no | Defaults to 3000. The server binds `0.0.0.0`. |
| `IMPORT_HEADLESS` | no | `0` disables the headless browser used as a fallback when importing URLs. |

Mail delivery, Google sign-in, per-plan limits, rate limits and agent settings are all optional and documented in `.env.example`.

### Keep the two secrets apart

`BETTER_AUTH_SECRET` and the encryption key must be different values, and the encryption key should not live in an environment variable if you can avoid it. If the environment of a host is ever dumped, ciphertext stored in the database stays unreadable when the key came from a mounted file, a Docker secret, a Kubernetes secret volume, or a key management service written to disk at boot.

Upgrading from a version that derived the encryption key from `BETTER_AUTH_SECRET`: set the new key, then run `docker compose exec app node dist/rotate-keys.js`. It re-encrypts existing ciphertext and can be run repeatedly. (The image ships compiled JavaScript only, so `npm run keys:rotate` works from a source checkout, not inside the container.) `GET /healthz` reports which version is in use.

## Behind a reverse proxy

Terminate TLS in your proxy and forward to port 3000. The app already trusts proxy headers.

- `APP_URL` must be the public `https://` URL. Session cookies, verification links, the OAuth issuer, the consent redirect and the `/.well-known/oauth-*` documents are all built from it. A wrong value makes OAuth clients fail at the authorisation step.
- Serve the app at the root of a hostname. The OAuth endpoints (`/authorize`, `/token`, `/register`, `/revoke`, `/.well-known/…`) and `/mcp` must share the origin with the web app, not sit under a path prefix.
- Do not buffer responses. Agent runs and MCP calls stream for a minute or more; a proxy that buffers or times out early will cut them off. Allow at least 300 seconds of response time.
- `APP_URL` is also a build argument. It is baked into the prerendered public pages, so rebuild the image after changing it: `APP_URL=https://example.com docker compose build app`.

## Verify a deployment

```bash
curl -s https://example.com/healthz                                   # ok, migrations applied, encryption version
curl -s -o /dev/null -w '%{http_code}\n' https://example.com/mcp      # 401 without a token
curl -s https://example.com/.well-known/oauth-authorization-server    # issuer equals APP_URL
```

The container also has a `HEALTHCHECK`, so `docker compose ps` shows the app as healthy once migrations are applied.

## Connect an AI client

Sign in, open Settings, and generate a token. The MCP endpoint is `APP_URL/mcp` with an `Authorization: Bearer <token>` header. Clients that speak OAuth can instead be pointed at the same URL and will register themselves; approve the request on the consent screen. The six tools are `get_instructions`, `search_notes`, `read_note`, `create_note`, `update_note` and `list_folder`.

## Upgrade

```bash
git pull
docker compose build app && docker compose up -d
```

Migrations run at start under an advisory lock, so a rolling restart is safe. Back up first if you are skipping several releases.

## Back up and restore

The database holds everything: notes, versions, attachments, tokens and settings.

```bash
docker compose exec -T db pg_dump -U wikibrain --format=custom wikibrain > wikibrain-$(date +%Y%m%d).dump

docker compose exec -T db pg_restore --clean --if-exists --no-owner -U wikibrain -d wikibrain < wikibrain-20260101.dump
```

Keep the encryption key with the dump. Without it, stored API keys in the restored database cannot be decrypted. Restore into a scratch database now and then to confirm the dumps are readable.

Users can also export their own workspace as a Markdown archive from Settings, which is the portable copy: plain files with front matter, readable in any editor.

## Troubleshooting

- **The server exits at start with an encryption error.** `NODE_ENV=production` requires an encryption key that differs from `BETTER_AUTH_SECRET`. Create `secrets/wikibrain_key` and restart.
- **OAuth clients fail after signing in.** `APP_URL` does not match the URL in the browser, or the app is served under a path prefix.
- **Imported pages come back empty.** The site needs JavaScript and `IMPORT_HEADLESS` is off, or the site blocks the fetch. Paste the text instead.
- **Prerendered pages link to the wrong domain.** The image was built with a different `APP_URL`. Rebuild the app image.
- **Agent runs stop partway.** A proxy or load balancer is cutting the response short. Raise its timeouts.
- **Imports return 429 saying too many pages are queued.** More pages are waiting for the renderer than `HEADLESS_QUEUE_MAX` allows. Raise `HEADLESS_CONCURRENCY` if the host has memory to spare (about 275 MB per concurrent page), or let the queue drain.
