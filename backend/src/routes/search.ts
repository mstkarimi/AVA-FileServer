import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { config } from '../config';
import { getUserPermissions } from '../services/permissionService';

const router = Router();
router.use(requireAuth);

const MAX_RESULTS = 50;
const MAX_DEPTH = 8;

interface SearchResult {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size: number;
  modified: number;
}

function inScope(rel: string, scope: string[]): boolean {
  if (scope.length === 0) return false;
  if (scope.includes('')) return true;
  return scope.some(p => rel === p || rel.startsWith(p + '/') || p.startsWith(rel + '/'));
}

function walk(
  rootAbs: string,
  rel: string,
  query: string,
  depth: number,
  out: SearchResult[],
  scope: string[] | null
): void {
  if (out.length >= MAX_RESULTS || depth > MAX_DEPTH) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(path.join(rootAbs, rel), { withFileTypes: true });
  } catch {
    return;
  }

  for (const e of entries) {
    if (e.name === '.tmp' || e.name.startsWith('.')) continue;
    if (out.length >= MAX_RESULTS) return;

    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (scope && !inScope(childRel, scope)) continue;

    const lower = e.name.toLowerCase();
    if (lower.includes(query)) {
      try {
        const stat = fs.statSync(path.join(rootAbs, childRel));
        out.push({
          path: '/' + childRel,
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
          size: stat.size,
          modified: stat.mtimeMs,
        });
      } catch {
        /* skip unreadable */
      }
    }

    if (e.isDirectory()) walk(rootAbs, childRel, query, depth + 1, out, scope);
  }
}

router.get('/', (req: AuthRequest, res: Response): void => {
  const q = ((req.query['q'] as string) || '').trim().toLowerCase();
  if (q.length < 2) {
    res.json([]);
    return;
  }

  const out: SearchResult[] = [];
  const scope = req.role === 'admin' ? null : getUserPermissions(req.userId!);
  if (scope && scope.length === 0) {
    res.json([]);
    return;
  }

  walk(config.filesRoot, '', q, 0, out, scope);
  res.json(out);
});

export default router;
