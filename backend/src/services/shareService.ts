import crypto from 'crypto';
import path from 'path';
import { getDb } from '../db';
import { config } from '../config';

export type ShareType = 'file' | 'folder';

export function generateHash(): string {
  return crypto.randomBytes(16).toString('base64url');
}

export function shareUrl(hash: string, filePath: string, shareType: ShareType): string {
  if (shareType === 'folder') {
    return `${config.publicUrl}/${hash}/`;
  }
  const ext = path.extname(filePath);
  return `${config.publicUrl}/${hash}${ext}`;
}

export interface Share {
  id: number;
  hash: string;
  file_path: string;
  share_type: ShareType;
  created_by: number;
  created_at: number;
  download_count: number;
  last_accessed_at: number | null;
}

export function createShare(
  filePath: string,
  userId: number,
  shareType: ShareType = 'file'
): Share {
  const db = getDb();
  const hash = generateHash();
  const now = Date.now();
  const relative = path.relative(config.filesRoot, filePath);

  db.prepare(
    'INSERT INTO shares (hash, file_path, share_type, created_by, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(hash, relative, shareType, userId, now);

  return db.prepare('SELECT * FROM shares WHERE hash = ?').get(hash) as Share;
}

export function getShareByHash(hash: string): Share | undefined {
  return getDb().prepare('SELECT * FROM shares WHERE hash = ?').get(hash) as Share | undefined;
}

/**
 * Look up the latest share for each given relative path. Used to enrich file listings
 * so viewers can copy a previously-published link without contacting the admin.
 */
export function getSharesForPaths(paths: string[]): Map<string, Share> {
  const map = new Map<string, Share>();
  if (paths.length === 0) return map;
  const placeholders = paths.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`SELECT * FROM shares WHERE file_path IN (${placeholders}) ORDER BY created_at DESC`)
    .all(...paths) as Share[];
  for (const r of rows) {
    if (!map.has(r.file_path)) map.set(r.file_path, r); // most recent (DESC ordering)
  }
  return map;
}

export function listShares(): Share[] {
  return getDb().prepare('SELECT * FROM shares ORDER BY created_at DESC').all() as Share[];
}

export function deleteShare(id: number): boolean {
  return getDb().prepare('DELETE FROM shares WHERE id = ?').run(id).changes > 0;
}

export function incrementDownload(id: number): void {
  getDb()
    .prepare(
      'UPDATE shares SET download_count = download_count + 1, last_accessed_at = ? WHERE id = ?'
    )
    .run(Date.now(), id);
}
