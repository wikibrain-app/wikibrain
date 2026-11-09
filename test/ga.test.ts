import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';

/* GA4 is opt-in for the deployment: /api/config hands the measurement ID to the frontend only when GA_MEASUREMENT_ID
   is set and well-formed, so a self-hosted build never loads Google's script. */
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '';
const saved = process.env.GA_MEASUREMENT_ID;
const gaId = async () => (await (await fetch(base + '/api/config')).json()).gaId;

before(async () => {
  await migrate();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  if (saved === undefined) delete process.env.GA_MEASUREMENT_ID; else process.env.GA_MEASUREMENT_ID = saved;
  server.close();
  await pool.end();
});

test('/api/config exposes the GA measurement ID only when it is set and well-formed', async () => {
  delete process.env.GA_MEASUREMENT_ID;
  assert.equal(await gaId(), null);
  process.env.GA_MEASUREMENT_ID = ' G-ABC123XYZ ';
  assert.equal(await gaId(), 'G-ABC123XYZ');
  process.env.GA_MEASUREMENT_ID = 'G-ABC"><script>';
  assert.equal(await gaId(), null);
  process.env.GA_MEASUREMENT_ID = 'UA-12345-1';
  assert.equal(await gaId(), null);
});
