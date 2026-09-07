import { randomBytes } from 'node:crypto';
import { pool } from './db.js';
import { NoteError } from './notes.js';
import { safeFetch } from './net-guard.js';

/* ── Image attachments (Karpathy: download article images locally) ──
   Stored as Postgres bytea, isolated per workspace, referenced from notes as /api/assets/<id>; rewritten to raw/assets/<filename> on export. */

export const ASSET_LIMITS = { bytes: 5 * 1024 * 1024, perImport: 10, importBytes: 2 * 1024 * 1024 };
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' };

export interface AssetInfo { id: string; filename: string; mime: string; size: number; source_url: string | null; created_at: Date }

export function sniffImageMime(buf: Buffer, hinted?: string): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6 && buf.subarray(0, 6).toString('latin1').startsWith('GIF8')) return 'image/gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.length >= 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp' && buf.subarray(8, 12).toString('latin1').startsWith('avif')) return 'image/avif';
  const head = buf.subarray(0, 512).toString('utf8').trim().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  void hinted; // Trust content sniffing only, never the mime claimed by the browser or origin site
  return null;
}

// SVG may carry scripts / external references: strip them roughly before storing.
function sanitizeSvg(buf: Buffer): Buffer {
  const s = buf.toString('utf8')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  return Buffer.from(s, 'utf8');
}

export async function storeAsset(ws: string, buf: Buffer, filename: string, hintedMime?: string, sourceUrl?: string): Promise<AssetInfo> {
  if (buf.length > ASSET_LIMITS.bytes) throw new NoteError('BAD_PATH', { 'zh-TW': `圖片超過 ${ASSET_LIMITS.bytes / 1024 / 1024} MB 上限`, en: `Image exceeds the ${ASSET_LIMITS.bytes / 1024 / 1024} MB limit` });
  const mime = sniffImageMime(buf, hintedMime);
  if (!mime) throw new NoteError('BAD_PATH', { 'zh-TW': '只接受 PNG、JPEG、GIF、WebP、SVG、AVIF 圖片', en: 'Only PNG, JPEG, GIF, WebP, SVG and AVIF images are accepted' });
  const data = mime === 'image/svg+xml' ? sanitizeSvg(buf) : buf;
  const id = randomBytes(12).toString('hex');
  const base = (filename.split('/').pop() ?? 'image').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').replace(/\.[a-z0-9]+$/i, '').slice(0, 60) || 'image';
  const name = `${base}.${EXT[mime]}`;
  const { rows } = await pool.query<AssetInfo>(
    `INSERT INTO assets (id, workspace_id, filename, mime, size, data, source_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, filename, mime, size, source_url, created_at`,
    [id, ws, name, mime, data.length, data, sourceUrl ?? null],
  );
  return rows[0];
}

export async function getAsset(ws: string, id: string): Promise<(AssetInfo & { data: Buffer }) | null> {
  const { rows } = await pool.query<AssetInfo & { data: Buffer }>(`SELECT id, filename, mime, size, source_url, created_at, data FROM assets WHERE workspace_id = $1 AND id = $2`, [ws, id]);
  return rows[0] ?? null;
}
export async function listAssets(ws: string): Promise<AssetInfo[]> {
  const { rows } = await pool.query<AssetInfo>(`SELECT id, filename, mime, size, source_url, created_at FROM assets WHERE workspace_id = $1 ORDER BY created_at DESC`, [ws]);
  return rows;
}
export async function deleteAsset(ws: string, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM assets WHERE workspace_id = $1 AND id = $2`, [ws, id]);
  return (rowCount ?? 0) > 0;
}
export const assetUrl = (id: string) => `/api/assets/${id}`;

// On import, download external images in the Markdown as attachments and rewrite the links (at most N, each size-capped; failures keep the original URL).
export async function localizeImages(ws: string, markdown: string, opts: { allowPrivate?: boolean } = {}): Promise<{ markdown: string; downloaded: number }> {
  const re = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const seen = new Map<string, string>();
  let downloaded = 0;
  const matches = [...markdown.matchAll(re)];
  for (const m of matches) {
    const url = m[2];
    if (downloaded >= ASSET_LIMITS.perImport) break;
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    try {
      const res = await safeFetch(url, { allowPrivate: opts.allowPrivate, maxBytes: ASSET_LIMITS.importBytes, timeoutMs: 10_000, headers: { accept: 'image/*' } });
      if (!res.ok) continue;
      const mime = res.headers.get('content-type')?.split(';')[0].trim();
      const a = await storeAsset(ws, res.body, new URL(url).pathname.split('/').pop() || 'image', mime, url);
      seen.set(url, assetUrl(a.id));
      downloaded++;
    } catch { /* keep the original URL if the download fails */ }
  }
  const out = markdown.replace(re, (whole, alt: string, url: string) => (seen.has(url) ? `![${alt}](${seen.get(url)})` : whole));
  return { markdown: out, downloaded };
}

// Export: rewrite /api/assets/<id> to raw/assets/<filename> and return the list of attachments to bundle.
export async function assetsForExport(ws: string): Promise<{ id: string; path: string; data: Buffer }[]> {
  const { rows } = await pool.query<{ id: string; filename: string; data: Buffer }>(`SELECT id, filename, data FROM assets WHERE workspace_id = $1 ORDER BY created_at`, [ws]);
  const used = new Set<string>();
  return rows.map(r => {
    let name = r.filename, i = 2;
    while (used.has(name)) { name = r.filename.replace(/(\.[a-z0-9]+)$/i, `-${i++}$1`); }
    used.add(name);
    return { id: r.id, path: `raw/assets/${name}`, data: r.data };
  });
}
export function rewriteAssetLinks(markdown: string, map: Map<string, string>): string {
  return markdown.replace(/\/api\/assets\/([0-9a-f]{24})/g, (whole, id: string) => map.get(id) ?? whole);
}
