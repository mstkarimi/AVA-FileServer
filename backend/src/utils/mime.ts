import mime from 'mime-types';

export function getMimeType(filename: string): string {
  return mime.lookup(filename) || 'application/octet-stream';
}
