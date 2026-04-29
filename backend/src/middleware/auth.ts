import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { Role } from '../services/permissionService';

export interface AuthRequest extends Request {
  userId?: number;
  username?: string;
  role?: Role;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  // Also accept token via query param so media elements can attach auth (preview)
  const queryToken = typeof req.query['t'] === 'string' ? req.query['t'] : undefined;
  const raw = header?.startsWith('Bearer ') ? header.slice(7) : queryToken;

  if (!raw) {
    res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });
    return;
  }

  try {
    const payload = jwt.verify(raw, config.jwtSecret) as unknown as {
      sub: number;
      username: string;
      role: Role;
    };
    req.userId = payload.sub;
    req.username = payload.username;
    req.role = payload.role;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
    return;
  }
  next();
}
