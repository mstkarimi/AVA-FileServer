import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { safePath } from '../utils/safePath';
import { streamFile } from '../services/streamService';
import { userCanAccess } from '../services/permissionService';

/**
 * Identical to /api/preview in access control, but drawing from the small
 * 'thumb' concurrency pool instead of the download pool.
 *
 * The listing's grid views fetch image thumbnails through here. A per-tab
 * client-side limiter cannot bound aggregate load — several open gallery tabs
 * behind the office's single NAT IP would otherwise exhaust the shared
 * download budget, and the requests that lost would be other people's actual
 * file transfers. Routing decoration through its own pool makes that
 * impossible by construction rather than by client good behaviour.
 */
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
  streamFile(req, res, filePath, { pool: 'thumb' });
});

export default router;
