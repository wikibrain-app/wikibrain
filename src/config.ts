import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Version: package.json version + short git hash (GIT_COMMIT / RAILWAY_GIT_COMMIT_SHA env var, or "unknown" without .git)
function readVersion() {
  let version = '0.0.0';
  try { version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version; } catch { /* fallback */ }
  // Some hosting platforms inject the deployed commit under their own variable name.
  let commit = (process.env.GIT_COMMIT || process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7);
  if (commit === 'unknown') commit = '';
  if (!commit) { try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = 'unknown'; } }
  return { version, commit };
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`缺少環境變數 ${name}（請參考 .env.example）`);
  return v;
}
const optional = (name: string) => process.env[name] || undefined;

export const config = {
  ...readVersion(),
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 3000),
  host: '0.0.0.0',
  // Public URL: session cookies, verification links and OAuth callbacks all derive from it.
  appUrl: process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
  authSecret: required('BETTER_AUTH_SECRET'),
  // Extra trusted origins (comma-separated), e.g. a Tailscale URL; used by better-auth's CSRF check.
  trustedOrigins: (process.env.TRUSTED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  google: optional('GOOGLE_CLIENT_ID') && optional('GOOGLE_CLIENT_SECRET')
    ? { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! }
    : null,
  // Per-minute limits; single-VM in-memory version
  mcpRatePerMin: Number(process.env.MCP_RATE_PER_MIN ?? 120),
  ipRatePerMin: Number(process.env.IP_RATE_PER_MIN ?? 300),
  apiRatePerMin: Number(process.env.API_RATE_PER_MIN ?? 1500),
  resendApiKey: optional('RESEND_API_KEY'),
  mailFrom: process.env.MAIL_FROM ?? 'WikiBrain <no-reply@example.com>',
};
