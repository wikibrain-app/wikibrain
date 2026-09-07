import { zipSync, strToU8 } from 'fflate';
import { pool } from './db.js';
import { assetsForExport, rewriteAssetLinks } from './assets.js';

// One-click full export (PRD R7): one Markdown file per page, laid out as raw/ wiki/ schema/, usable directly as an Obsidian vault.
export async function buildExportZip(workspaceId: string): Promise<Buffer> {
  const { rows } = await pool.query<{ path: string; content_md: string }>(
    `SELECT path, content_md FROM notes WHERE workspace_id = $1 AND deleted_at IS NULL ORDER BY path`, [workspaceId]);
  const assets = await assetsForExport(workspaceId);
  const map = new Map(assets.map(a => [a.id, a.path]));
  const files: Record<string, Uint8Array> = {};
  for (const r of rows) files[r.path] = strToU8(rewriteAssetLinks(r.content_md, map));
  for (const a of assets) files[a.path] = new Uint8Array(a.data);
  files['README.md'] = strToU8(`# WikiBrain 匯出\n\n匯出時間：${new Date().toISOString()}\n共 ${rows.length} 頁${assets.length ? `、${assets.length} 個圖片附件（raw/assets/）` : ''}。三層：raw/（原始來源）、wiki/（知識頁）、schema/（編纂規則）。[[wiki-link]] 與 Obsidian 相容。\n`);
  return Buffer.from(zipSync(files, { level: 6 }));
}
