import { Router, Response } from 'express';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import { listTrash, restoreTrash, purgeTrash, emptyTrash } from '../services/trashService';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/', (_req: AuthRequest, res: Response): void => {
  const items = listTrash().map(t => ({
    id: t.id,
    name: t.name,
    originalPath: t.original_path,
    type: t.type,
    size: t.size,
    deletedBy: t.deleted_by_username,
    deletedAt: t.deleted_at,
    expiresAt: t.expires_at,
  }));
  res.json(items);
});

router.post('/:id/restore', (req: AuthRequest, res: Response): void => {
  const id = parseInt(req.params['id'], 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id', code: 'INVALID_ID' });
    return;
  }
  try {
    const restoredTo = restoreTrash(id);
    res.json({ ok: true, restoredTo });
  } catch (err) {
    const msg = (err as Error).message;
    const code = msg === 'not found' ? 404 : 400;
    res.status(code).json({ error: msg, code: 'RESTORE_FAILED' });
  }
});

router.delete('/:id', (req: AuthRequest, res: Response): void => {
  const id = parseInt(req.params['id'], 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id', code: 'INVALID_ID' });
    return;
  }
  if (!purgeTrash(id)) {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    return;
  }
  res.json({ ok: true });
});

router.post('/empty', (_req: AuthRequest, res: Response): void => {
  const count = emptyTrash();
  res.json({ ok: true, purged: count });
});

export default router;
