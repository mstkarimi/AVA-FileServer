import fs from 'fs';
import path from 'path';
import { safePath } from '../utils/safePath';
import { config } from '../config';

export interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  size: number;
  modified: number;
}

export function listDir(dirPath: string): FileEntry[] {
  const resolved = safePath(dirPath);
  const entries = fs.readdirSync(resolved, { withFileTypes: true });

  return entries
    .filter(e => (e.isFile() || e.isDirectory()) && e.name !== '.tmp')
    .map(e => {
      const full = path.join(resolved, e.name);
      const stat = fs.statSync(full);
      return {
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
        size: stat.size,
        modified: stat.mtimeMs,
      } as FileEntry;
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function deleteEntry(entryPath: string, recursive = false): void {
  const resolved = safePath(entryPath);
  const stat = fs.statSync(resolved);

  if (stat.isDirectory()) {
    if (recursive) {
      fs.rmSync(resolved, { recursive: true, force: true });
    } else {
      fs.rmdirSync(resolved);
    }
  } else {
    fs.unlinkSync(resolved);
  }
}

export function moveEntry(fromPath: string, toPath: string): void {
  const resolvedFrom = safePath(fromPath);
  const resolvedTo = safePath(toPath);
  fs.renameSync(resolvedFrom, resolvedTo);
}

export function makeDir(parentPath: string, name: string): void {
  const parent = safePath(parentPath);
  const newDir = path.join(parent, name);
  // Validate the combined path as well
  safePath(path.relative(config.filesRoot, newDir));
  fs.mkdirSync(newDir, { recursive: true });
}

export function renameEntry(entryPath: string, newName: string): void {
  const resolved = safePath(entryPath);
  const dir = path.dirname(resolved);
  const newResolved = path.join(dir, newName);
  // Ensure new name doesn't escape
  safePath(path.relative(config.filesRoot, newResolved));
  fs.renameSync(resolved, newResolved);
}

export function resolveFilePath(relativePath: string): string {
  return safePath(relativePath);
}
