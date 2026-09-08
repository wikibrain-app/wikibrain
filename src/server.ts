import { config } from './config.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';
import { scheduleVersionPurge } from './retention.js';
import { scheduleCapacityCheck } from './capacity.js';
import { scheduleOAuthCleanup } from './oauth.js';
import { scheduleZoteroSync } from './zotero.js';
import { failStaleJobs } from './ingest.js';
import { assertEncryptionReady, encryptionVersion } from './crypto.js';

assertEncryptionReady(); // refuse to start in production without a dedicated KEY_ENCRYPTION_SECRET

process.on('unhandledRejection', err => { console.error('Unhandled rejection:', err); });
process.on('uncaughtException', err => { console.error('Uncaught exception:', err); });

const applied = await migrate();
if (applied.length) console.log(`Applied migrations: ${applied.join(', ')}`);
console.log(`Secret encryption: ${encryptionVersion()}${encryptionVersion() === 'v1' ? ' (development only; set KEY_ENCRYPTION_SECRET in production)' : ''}`);

scheduleVersionPurge();
scheduleCapacityCheck();
scheduleOAuthCleanup();
scheduleZoteroSync();
const stale = await failStaleJobs();
if (stale) console.log(`Marked ${stale} agent job(s) left unfinished before the restart as failed`);
createApp().listen(config.port, config.host, () => {
  console.log(`WikiBrain listening on http://${config.host}:${config.port} (MCP: /mcp, Auth: /api/auth, App URL: ${config.appUrl})`);
});
