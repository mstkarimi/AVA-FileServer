import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import { createShare, listShares, deleteShare, revokeShare, unrevokeShare, shareUrl, ShareType } from '../services/shareService';
import { safePath } from '../utils/safePath';
import { config } from '../config';
import { userCanAccess } from '../services/permissionService';

const router = Router();
router.use(requireAuth);

// Helper: teacher can only share files/folders within their permitted scope
function requireUploadAccess(req: AuthRequest, res: Response, filePath: string): boolean {
  if (req.role === 'admin') return true;
  if (req.role === 'teacher') {
    if (!userCanAccess(req.userId!, req.role, filePath, { mode: 'access' })) {
      res.status(403).json({ error: 'No permission to share this path', code: 'FORBIDDEN' });
      return false;
    }
    return true;
  }
  res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
  return false;
}

router.post('/', (req: AuthRequest, res: Response): void => {
  const { filePath, type } = req.body as { filePath?: string; type?: ShareType };

  if (!filePath) {
    res.status(400).json({ error: 'filePath required', code: 'MISSING_FIELDS' });
    return;
  }

  if (!requireUploadAccess(req, res, filePath)) return;

  const resolved = safePath(filePath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    res.status(404).json({ error: 'file not found', code: 'NOT_FOUND' });
    return;
  }

  // Auto-detect or honor requested type
  const shareType: ShareType =
    type === 'folder' || (type !== 'file' && stat.isDirectory()) ? 'folder' : 'file';

  if (shareType === 'folder' && !stat.isDirectory()) {
    res.status(400).json({ error: 'path is not a folder', code: 'NOT_FOLDER' });
    return;
  }
  if (shareType === 'file' && stat.isDirectory()) {
    res.status(400).json({ error: 'path is a folder — use type=folder', code: 'IS_FOLDER' });
    return;
  }

  const share = createShare(resolved, req.userId!, shareType);

  res.json({
    id: share.id,
    hash: share.hash,
    type: share.share_type,
    url: shareUrl(share.hash, share.file_path, share.share_type),
  });
});

/**
 * Bulk: accepts a list of file paths AND/OR folders.
 * For files: one file-share each.
 * For folders: if `recurse=true`, walks the folder tree and creates a file-share per file inside;
 *              if `recurse=false`, creates a folder-share for the folder itself.
 */
router.post('/bulk', (req: AuthRequest, res: Response): void => {
  if (req.role !== 'admin' && req.role !== 'teacher') {
    res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    return;
  }

  const { paths, recurse, folderShare } = req.body as {
    paths?: string[];
    recurse?: boolean;
    folderShare?: boolean;
  };

  if (!Array.isArray(paths) || paths.length === 0) {
    res.status(400).json({ error: 'paths required', code: 'MISSING_FIELDS' });
    return;
  }

  const out: { sourcePath: string; id?: number; hash?: string; url?: string; type?: ShareType; error?: string }[] = [];

  function processFile(absPath: string, displayPath: string) {
    try {
      const share = createShare(absPath, req.userId!, 'file');
      out.push({
        sourcePath: displayPath,
        id: share.id,
        hash: share.hash,
        type: 'file',
        url: shareUrl(share.hash, share.file_path, 'file'),
      });
    } catch (err) {
      out.push({ sourcePath: displayPath, error: (err as Error).message });
    }
  }

  function walkAndShare(absDir: string, displayBase: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === '.tmp' || e.name.startsWith('.')) continue;
      const childAbs = path.join(absDir, e.name);
      const childDisplay = `${displayBase}/${e.name}`;
      if (e.isFile()) {
        processFile(childAbs, childDisplay);
      } else if (e.isDirectory()) {
        walkAndShare(childAbs, childDisplay);
      }
    }
  }

  for (const p of paths) {
    // Teacher permission check per path
    if (req.role === 'teacher' && !userCanAccess(req.userId!, req.role!, p, { mode: 'access' })) {
      out.push({ sourcePath: p, error: 'no permission' });
      continue;
    }

    let abs: string;
    try {
      abs = safePath(p);
    } catch {
      out.push({ sourcePath: p, error: 'invalid path' });
      continue;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      out.push({ sourcePath: p, error: 'not found' });
      continue;
    }

    if (stat.isFile()) {
      processFile(abs, p);
      continue;
    }

    // It's a directory
    if (folderShare) {
      try {
        const share = createShare(abs, req.userId!, 'folder');
        out.push({
          sourcePath: p,
          id: share.id,
          hash: share.hash,
          type: 'folder',
          url: shareUrl(share.hash, share.file_path, 'folder'),
        });
      } catch (err) {
        out.push({ sourcePath: p, error: (err as Error).message });
      }
    } else if (recurse) {
      walkAndShare(abs, p.replace(/\/+$/, ''));
    } else {
      out.push({ sourcePath: p, error: 'directory — pass recurse=true or folderShare=true' });
    }
  }

  res.json(out);
});

router.get('/', requireAdmin, (_req: AuthRequest, res: Response): void => {
  const shares = listShares().map(s => ({
    id: s.id,
    hash: s.hash,
    filePath: s.file_path,
    type: s.share_type,
    url: shareUrl(s.hash, s.file_path, s.share_type),
    createdAt: s.created_at,
    downloadCount: s.download_count,
    lastAccessedAt: s.last_accessed_at,
    revokedAt: s.revoked_at,
    active: s.revoked_at === null,
    createdBy: s.created_by_username,
  }));
  res.json(shares);
});

// Soft-revoke a share (link stops working, row kept for audit/stats)
router.post('/:id/revoke', requireAdmin, (req: AuthRequest, res: Response): void => {
  const id = parseInt(req.params['id'], 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id', code: 'INVALID_ID' });
    return;
  }
  if (!revokeShare(id)) {
    res.status(404).json({ error: 'Share not found or already revoked', code: 'NOT_FOUND' });
    return;
  }
  res.json({ ok: true });
});

// Re-activate a revoked share
router.post('/:id/unrevoke', requireAdmin, (req: AuthRequest, res: Response): void => {
  const id = parseInt(req.params['id'], 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id', code: 'INVALID_ID' });
    return;
  }
  if (!unrevokeShare(id)) {
    res.status(404).json({ error: 'Share not found', code: 'NOT_FOUND' });
    return;
  }
  res.json({ ok: true });
});

// Hard delete a share permanently
router.delete('/:id', requireAdmin, (req: AuthRequest, res: Response): void => {
  const id = parseInt(req.params['id'], 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id', code: 'INVALID_ID' });
    return;
  }

  if (!deleteShare(id)) {
    res.status(404).json({ error: 'Share not found', code: 'NOT_FOUND' });
    return;
  }
  res.json({ ok: true });
});

export default router;
