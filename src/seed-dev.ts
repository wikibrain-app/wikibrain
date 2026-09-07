import { pool } from './db.js';
import { migrate } from './migrate.js';
import { hashToken } from './auth.js';
import { auth } from './auth-web.js';
import { ensureWorkspaceFor } from './workspaces.js';

// Local development: create a dev account (verified), its workspace and one MCP token;
// and move the Phase 0 'phase0' workspace data into the dev account's workspace (once only).
await migrate();

const email = process.env.DEV_EMAIL ?? 'dev@example.com';
const password = process.env.DEV_PASSWORD ?? 'devpass123';

let user = (await pool.query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email])).rows[0];
if (!user) {
  await auth.api.signUpEmail({ body: { email, password, name: 'Dev' } });
  user = (await pool.query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email])).rows[0];
  await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE id = $1`, [user.id]);
  console.log(`Created dev account ${email} (password ${password}, marked verified)`);
}
const ws = await ensureWorkspaceFor(user.id);

const legacy = await pool.query(`SELECT 1 FROM workspaces WHERE id = 'phase0'`);
if (legacy.rowCount) {
  await pool.query(`UPDATE notes SET workspace_id = $1 WHERE workspace_id = 'phase0'`, [ws.id]);
  await pool.query(`UPDATE links SET workspace_id = $1 WHERE workspace_id = 'phase0'`, [ws.id]);
  await pool.query(`UPDATE tags SET workspace_id = $1 WHERE workspace_id = 'phase0'`, [ws.id]);
  await pool.query(`UPDATE mcp_tokens SET workspace_id = $1, user_id = $2 WHERE workspace_id = 'phase0'`, [ws.id, user.id]);
  await pool.query(`DELETE FROM workspaces WHERE id = 'phase0'`);
  console.log(`Moved phase0 workspace data to ${ws.id}`);
}

const devToken = process.env.DEV_MCP_TOKEN;
if (devToken) {
  const { rowCount } = await pool.query(
    `INSERT INTO mcp_tokens (workspace_id, user_id, token_hash, label) VALUES ($1, $2, $3, 'dev')
     ON CONFLICT (token_hash) DO NOTHING`,
    [ws.id, user.id, hashToken(devToken)],
  );
  console.log(rowCount ? 'Created dev token (from DEV_MCP_TOKEN)' : 'dev token already exists');
} else {
  console.log('DEV_MCP_TOKEN not set; sign in and create one via POST /api/tokens.');
}
console.log(`Workspace: ${ws.id}`);
await pool.end();
