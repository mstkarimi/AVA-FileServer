import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import { listDir, moveEntry, makeDir, renameEntry } from '../services/fileService';
import { safePath } from '../utils/safePath';
import { config } from '../config';
import { userCanAccess, filterListing } from '../services/permissionService';
import { getSharesForPaths, shareUrl } from '../services/shareService';
import { moveToTrash } from '../services/trashService';

const router = Router();
router.use(requireAuth);

const upload = multer({
  dest: `${config.filesRoot}/.tmp`,
  limits: { fileSize: config.uploadMaxBytes },
});

// LIST — both roles, scoped for viewers
router.get('/', (req: AuthRequest, res: Response): void => {
  const qPath = (req.query['path'] as string) || '/';

  if (!userCanAccess(req.userId!, req.role!, qPath, { mode: 'navigate' })) {
    res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    return;
  }

  const entries = listDir(qPath);
  const filtered = filterListing(req.userId!, req.role!, qPath, entries);

  // Enrich each entry with its existing share URL (if any) so the UI can show "copy link" inline.
  const cur = qPath.replace(/^\/+|\/+$/g, '');
  const relPaths = filtered.map(e => (cur ? `${cur}/${e.name}` : e.name));
  const shareMap = getSharesForPaths(relPaths);
  const enriched = filtered.map(e => {
    const rel = cur ? `${cur}/${e.name}` : e.name;
    const sh = shareMap.get(rel);
    if (!sh) return e;
    return { ...e, shareUrl: shareUrl(sh.hash, sh.file_path, sh.share_type) };
  });

  res.json(enriched);
});

// Upload — admin always allowed; teacher allowed only into their permitted folders.
router.post('/upload', upload.array('files'), (req: AuthRequest, res: Response): void => {
  const qPath = (req.query['path'] as string) || '/';

  if (req.role !== 'admin') {
    if (req.role !== 'teacher') {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }
    // Teacher: must have direct write-access to the target folder
    if (!userCanAccess(req.userId!, req.role, qPath, { mode: 'access' })) {
      res.status(403).json({ error: 'No permission to upload here', code: 'FORBIDDEN' });
      return;
    }
  }

  const destDir = safePath(qPath);

  if (!Array.isArray(req.files) || req.files.length === 0) {
    res.status(400).json({ error: 'No files uploaded', code: 'NO_FILES' });
    return;
  }

  const results: { name: string; size: number }[] = [];
  for (const file of req.files as Express.Multer.File[]) {
    const destPath = path.join(destDir, file.originalname);
    safePath(path.relative(config.filesRoot, destPath));
    fs.renameSync(file.path, destPath);
    results.push({ name: file.originalname, size: file.size });
  }

  res.json(results);
});

// Web deletes move the entry into the trash (item 14) so it can be restored
// within the retention window. Permanent removal happens via the Trash tab.
router.delete('/', requireAdmin, (req: AuthRequest, res: Response): void => {
  const qPath = (req.query['path'] as string) || '';
  if (!qPath) {
    res.status(400).json({ error: 'Path required', code: 'MISSING_PATH' });
    return;
  }
  const item = moveToTrash(qPath, req.userId ?? null);
  res.json({ ok: true, trashed: true, id: item.id });
});

router.post('/move', requireAdmin, (req: AuthRequest, res: Response): void => {
  const { from, to } = req.body as { from?: string; to?: string };
  if (!from || !to) {
    res.status(400).json({ error: 'from and to required', code: 'MISSING_FIELDS' });
    return;
  }
  moveEntry(from, to);
  res.json({ ok: true });
});

router.post('/mkdir', requireAdmin, (req: AuthRequest, res: Response): void => {
  const { path: parentPath, name } = req.body as { path?: string; name?: string };
  if (!parentPath || !name) {
    res.status(400).json({ error: 'path and name required', code: 'MISSING_FIELDS' });
    return;
  }
  makeDir(parentPath, name);
  res.json({ ok: true });
});

router.post('/rename', requireAdmin, (req: AuthRequest, res: Response): void => {
  const { path: entryPath, newName } = req.body as { path?: string; newName?: string };
  if (!entryPath || !newName) {
    res.status(400).json({ error: 'path and newName required', code: 'MISSING_FIELDS' });
    return;
  }
  renameEntry(entryPath, newName);
  res.json({ ok: true });
});

export default router;
