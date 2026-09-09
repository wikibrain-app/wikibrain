import pg from 'pg';
import { config } from './config.js';

/* The pool size caps how many queries run at once. The default of 10 is fine while queries are milliseconds, but a
   large workspace's search can take hundreds of milliseconds, and then everything else queues behind it. Keep it well
   under the server's max_connections, and remember every process (web, cron, backups) has its own pool. */
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: Math.max(1, Number(process.env.PG_POOL_MAX ?? 20)) });
