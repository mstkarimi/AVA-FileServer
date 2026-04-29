import { Request, Response, NextFunction } from 'express';
import { PathTraversalError } from '../utils/safePath';
import { logger } from '../logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof PathTraversalError) {
    res.status(400).json({ error: 'Invalid path', code: 'PATH_TRAVERSAL' });
    return;
  }

  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
}
