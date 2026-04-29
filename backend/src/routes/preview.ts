import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { safePath } from '../utils/safePath';
import { streamFile } from '../services/streamService';
import { userCanAccess } from '../services/permissionService';

const router = Router();
router.use(requireAuth);

router.get('/', (req: AuthRequest, res: Response): void => {
  const qPath = (req.query['path'] as string) || '';
  if (!qPath) {
    res.status(400).json({ error: 'path required', code: 'MISSING_PATH' });
    return;
  }

  if (!userCanAccess(req.userId!, req.role!, qPath)) {
    res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    return;
  }

  const filePath = safePath(qPath);
  streamFile(req, res, filePath, { disposition: true });
});

export default router;
