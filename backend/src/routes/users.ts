import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import { getDb } from '../db';
import { setUserPermissions, getUserPermissions, Role } from '../services/permissionService';

const router = Router();
router.use(requireAuth, requireAdmin);

interface UserRow {
  id: number;
  username: string;
  role: string;
  created_at: number;
}

function isValidRole(r: unknown): r is Role {
  return r === 'admin' || r === 'viewer' || r === 'teacher';
}

router.get('/', (_req, res: Response) => {
  const users = getDb()
    .prepare('SELECT id, username, role, created_at FROM users ORDER BY id')
    .all() as UserRow[];
  const result = users.map(u => ({
    id: u.id,
    username: u.username,
    role: u.role,
    createdAt: u.created_at,
    permissions: getUserPermissions(u.id),
  }));
  res.json(result);
});

router.post('/', async (req, res: Response) => {
  const { username, password, role, permissions } = req.body as {
    username?: string;
    password?: string;
    role?: string;
    permissions?: string[];
  };

  if (!username || !password || !role) {
    res.status(400).json({ error: 'username, password, role required', code: 'MISSING_FIELDS' });
    return;
  }
  if (!isValidRole(role)) {
    res.status(400).json({ error: 'invalid role', code: 'INVALID_ROLE' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'password too short (min 6)', code: 'WEAK_PASSWORD' });
    return;
  }

  const db = getDb();
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    res.status(409).json({ error: 'username exists', code: 'EXISTS' });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const result = db
    .prepare('INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)')
    .run(username, hash, role, Date.now());

  const id = result.lastInsertRowid as number;
  if (Array.isArray(permissions) && (role === 'viewer' || role === 'teacher')) {
    setUserPermissions(id, permissions);
  }

  res.json({
    id,
    username,
    role,
    createdAt: Date.now(),
    permissions: getUserPermissions(id),
  });
});

router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params['id'], 10);
  const { password, role, permissions } = req.body as {
    password?: string;
    role?: string;
    permissions?: string[];
  };

  if (isNaN(id)) {
    res.status(400).json({ error: 'invalid id', code: 'INVALID_ID' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id) as
    | { id: number; role: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'not found', code: 'NOT_FOUND' });
    return;
  }

  // last-admin protection
  if (id === req.userId && role && role !== 'admin') {
    const adminCount = (db
      .prepare("SELECT COUNT(*) AS c FROM users WHERE role='admin'")
      .get() as { c: number }).c;
    if (adminCount <= 1) {
      res.status(400).json({ error: 'cannot demote last admin', code: 'LAST_ADMIN' });
      return;
    }
  }

  const set: string[] = [];
  const params: unknown[] = [];

  if (password) {
    if (password.length < 6) {
      res.status(400).json({ error: 'password too short', code: 'WEAK_PASSWORD' });
      return;
    }
    set.push('password_hash = ?');
    params.push(await bcrypt.hash(password, 12));
  }

  if (role) {
    if (!isValidRole(role)) {
      res.status(400).json({ error: 'invalid role', code: 'INVALID_ROLE' });
      return;
    }
    set.push('role = ?');
    params.push(role);
  }

  if (set.length > 0) {
    params.push(id);
    db.prepare(`UPDATE users SET ${set.join(', ')} WHERE id = ?`).run(...params);
  }

  // Always honour permissions update for viewer/teacher; admin gets cleared
  const updatedRole = role || existing.role;
  if (Array.isArray(permissions)) {
    if (updatedRole === 'admin') {
      setUserPermissions(id, []);
    } else {
      setUserPermissions(id, permissions);
    }
  }

  const updated = db
    .prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
    .get(id) as UserRow;

  res.json({
    id: updated.id,
    username: updated.username,
    role: updated.role,
    createdAt: updated.created_at,
    permissions: getUserPermissions(id),
  });
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params['id'], 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'invalid id', code: 'INVALID_ID' });
    return;
  }
  if (id === req.userId) {
    res.status(400).json({ error: 'cannot delete yourself', code: 'SELF_DELETE' });
    return;
  }

  const db = getDb();
  const u = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string } | undefined;
  if (!u) {
    res.status(404).json({ error: 'not found', code: 'NOT_FOUND' });
    return;
  }

  if (u.role === 'admin') {
    const adminCount = (db
      .prepare("SELECT COUNT(*) AS c FROM users WHERE role='admin'")
      .get() as { c: number }).c;
    if (adminCount <= 1) {
      res.status(400).json({ error: 'cannot delete last admin', code: 'LAST_ADMIN' });
      return;
    }
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
