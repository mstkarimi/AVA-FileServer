import path from 'path';
import { config } from '../config';

export function safePath(userPath: string): string {
  const resolved = path.resolve(config.filesRoot, userPath.replace(/^\/+/, ''));
  const root = config.filesRoot;

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new PathTraversalError(userPath);
  }
  return resolved;
}

export class PathTraversalError extends Error {
  constructor(attempted: string) {
    super(`Path traversal attempt: ${attempted}`);
    this.name = 'PathTraversalError';
  }
}
