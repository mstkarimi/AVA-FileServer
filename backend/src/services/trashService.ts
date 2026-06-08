import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db';
import { config } from '../config';
import { safePath } from '../utils/safePath';
import { logger } from '../logger';

export interface TrashItem {
  id: number;
  token: string;
  original_path: string;   // relative path it was deleted from
  name: string;            // display basename
  type: 'file' | 'dir';
  size: number;
  deleted_by: number | null;
  deleted_at: number;
  expires_at: number;
}

export interface TrashItemWithUser extends TrashItem {
  deleted_by_username: string | null;
}

function trashAbs(token: string): string {
  return path.join(config.trashRoot, token);
}

function ensureTrashRoot(): void {
  if (!fs.existsSync(config.trashRoot)) {
    fs.mkdirSync(config.trashRoot, { recursive: true });
  }
}

/**
 * Move a file/folder into the trash instead of deleting it permanently.
 * Returns the created trash row. `relPath` is the path within filesRoot.
 */
export function moveToTrash(relPath: string, userId: number | null): TrashItem {
  const abs = safePath(relPath);
  const stat = fs.statSync(abs);
  const isDir = stat.isDirectory();

  ensureTrashRoot();

  const token = crypto.randomBytes(16).toString('hex');
  const dest = trashAbs(token);

  // Same filesystem (/data) → rename is atomic & fast. Fall back to copy+remove.
  try {
    fs.renameSync(abs, dest);
  } catch {
    fs.cpSync(abs, dest, { recursive: true });
    fs.rmSync(abs, { recursive: true, force: true });
  }

  const now = Date.now();
  const expires = now + config.trashRetentionDays * 24 * 60 * 60 * 1000;
  const rel = relPath.replace(/^\/+/, '');

  const result = getDb()
    .prepare(
      `INSERT INTO trash (token, original_path, name, type, size, deleted_by, deleted_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(token, rel, path.basename(rel), isDir ? 'dir' : 'file', isDir ? 0 : stat.size, userId, now, expires);

  return getDb().prepare('SELECT * FROM trash WHERE id = ?').get(result.lastInsertRowid) as TrashItem;
}

export function listTrash(): TrashItemWithUser[] {
  return getDb()
    .prepare(
      `SELECT t.*, u.username AS deleted_by_username
         FROM trash t
         LEFT JOIN users u ON u.id = t.deleted_by
        ORDER BY t.deleted_at DESC`
    )
    .all() as TrashItemWithUser[];
}

function getTrash(id: number): TrashItem | undefined {
  return getDb().prepare('SELECT * FROM trash WHERE id = ?').get(id) as TrashItem | undefined;
}

/**
 * Restore a trashed item back to its original location.
 * If the original parent no longer exists it is recreated. If something already
 * occupies the original path, the item is restored under a "name (restored …)" name.
 * Returns the relative path it was restored to.
 */
export function restoreTrash(id: number): string {
  const row = getTrash(id);
  if (!row) throw new Error('not found');

  const src = trashAbs(row.token);
  if (!fs.existsSync(src)) {
    // Orphaned DB row — clean it up and report.
    getDb().prepare('DELETE FROM trash WHERE id = ?').run(id);
    throw new Error('trashed data missing');
  }

  let targetRel = row.original_path;
  let targetAbs = safePath(targetRel);

  // Recreate parent directory chain if needed.
  const parent = path.dirname(targetAbs);
  fs.mkdirSync(parent, { recursive: true });

  // Avoid clobbering an existing entry at the original path.
  if (fs.existsSync(targetAbs)) {
    const ext = row.type === 'file' ? path.extname(row.name) : '';
    const base = row.type === 'file' ? row.name.slice(0, row.name.length - ext.length) : row.name;
    const suffix = ` (restored ${new Date(row.deleted_at).toISOString().slice(0, 10)})`;
    const altName = `${base}${suffix}${ext}`;
    targetAbs = path.join(parent, altName);
    targetRel = path.relative(config.filesRoot, targetAbs);
  }

  try {
    fs.renameSync(src, targetAbs);
  } catch {
    fs.cpSync(src, targetAbs, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
  }

  getDb().prepare('DELETE FROM trash WHERE id = ?').run(id);
  return targetRel.replace(/^\/+/, '');
}

/** Permanently delete a single trashed item. */
export function purgeTrash(id: number): boolean {
  const row = getTrash(id);
  if (!row) return false;
  const abs = trashAbs(row.token);
  try {
    fs.rmSync(abs, { recursive: true, force: true });
  } catch { /* already gone */ }
  getDb().prepare('DELETE FROM trash WHERE id = ?').run(id);
  return true;
}

/** Empty the entire trash (admin action). */
export function emptyTrash(): number {
  const rows = getDb().prepare('SELECT * FROM trash').all() as TrashItem[];
  for (const r of rows) {
    try { fs.rmSync(trashAbs(r.token), { recursive: true, force: true }); } catch { /* */ }
  }
  const res = getDb().prepare('DELETE FROM trash').run();
  return res.changes;
}

/** Remove items whose retention window has elapsed. Safe to call on a timer. */
export function purgeExpired(): number {
  const now = Date.now();
  const rows = getDb().prepare('SELECT * FROM trash WHERE expires_at < ?').all(now) as TrashItem[];
  for (const r of rows) {
    try { fs.rmSync(trashAbs(r.token), { recursive: true, force: true }); } catch { /* */ }
  }
  const res = getDb().prepare('DELETE FROM trash WHERE expires_at < ?').run(now);
  if (res.changes > 0) logger.info({ purged: res.changes }, 'trash: purged expired items');
  return res.changes;
}
