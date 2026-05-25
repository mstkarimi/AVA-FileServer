import { getDb } from '../db';

export type Role = 'admin' | 'viewer' | 'teacher';

function normalize(p: string): string {
  return p.replace(/^\/+|\/+$/g, '');
}

export function getUserPermissions(userId: number): string[] {
  const rows = getDb()
    .prepare('SELECT folder_path FROM user_permissions WHERE user_id = ?')
    .all(userId) as { folder_path: string }[];
  return rows.map(r => normalize(r.folder_path));
}

export interface AccessOptions {
  /** "access": direct read of this path. "navigate": listing/browsing toward a permitted child. */
  mode?: 'access' | 'navigate';
}

export function userCanAccess(
  userId: number,
  role: Role,
  requestPath: string,
  opts: AccessOptions = {}
): boolean {
  if (role === 'admin') return true;
  // teacher has same scoped-access rules as viewer

  const perms = getUserPermissions(userId);
  if (perms.length === 0) return false;
  if (perms.includes('')) return true;

  const target = normalize(requestPath);

  // direct: target equals OR is within a permission
  const direct = perms.some(p => target === p || target.startsWith(p + '/'));
  if (direct) return true;

  // navigate: target is an ancestor of a permission (so you can list it to reach perms inside)
  if (opts.mode === 'navigate') {
    return perms.some(p => target === '' || p.startsWith(target + '/'));
  }
  return false;
}

export function setUserPermissions(userId: number, folders: string[]): void {
  const db = getDb();
  const now = Date.now();

  const normalized = [...new Set(folders.map(normalize))].filter(Boolean);
  // Drop redundant nested perms (parent already grants child)
  const minimal = normalized.filter(
    p => !normalized.some(other => other !== p && p.startsWith(other + '/'))
  );

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(userId);
    const ins = db.prepare(
      'INSERT INTO user_permissions (user_id, folder_path, created_at) VALUES (?, ?, ?)'
    );
    for (const f of minimal) ins.run(userId, f, now);
  });
  tx();
}

/**
 * Filter listing results for viewers — show only entries reachable within their scope.
 * Folders are visible if they contain (or equal) any granted scope; files only when within a scope.
 */
export function filterListing<T extends { name: string; type: 'file' | 'dir' }>(
  userId: number,
  role: Role,
  currentPath: string,
  entries: T[]
): T[] {
  if (role === 'admin') return entries;
  // teacher has same scoped-listing rules as viewer
  const perms = getUserPermissions(userId);
  if (perms.length === 0) return [];
  if (perms.includes('')) return entries;

  const cur = normalize(currentPath);

  return entries.filter(e => {
    const child = cur ? `${cur}/${e.name}` : e.name;
    if (e.type === 'dir') {
      return perms.some(
        p => child === p || child.startsWith(p + '/') || p.startsWith(child + '/')
      );
    }
    return perms.some(p => child === p || child.startsWith(p + '/'));
  });
}
