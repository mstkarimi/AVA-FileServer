import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { getDb } from '../db';
import { config } from '../config';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { Role } from '../services/permissionService';

const router = Router();

// Brute-force throttle. Keyed on the real client IP (app sets `trust proxy`).
// IMPORTANT: an entire office often shares ONE public NAT IP, so the bucket is
// effectively per-site, not per-user. Two safeguards keep that from locking a
// whole team out during a burst of fresh logins (e.g. onboarding a new domain):
//   - skipSuccessfulRequests: a correct login does NOT consume the bucket, so
//     any number of legitimate users can sign in without exhausting it.
//   - a roomier max: only FAILED attempts count, and 20 wrong tries / 15 min
//     from a single IP still throttles real brute-forcing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts', code: 'RATE_LIMITED' },
});

router.post('/login', loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required', code: 'MISSING_FIELDS' });
    return;
  }

  const user = getDb()
    .prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?')
    .get(username) as
    | { id: number; username: string; password_hash: string; role: Role }
    | undefined;

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    return;
  }

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry }
  );

  res.json({ token, role: user.role, username: user.username });
});

router.post('/logout', (_req: Request, res: Response): void => {
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req: AuthRequest, res: Response): void => {
  res.json({ username: req.username, role: req.role });
});

export default router;
