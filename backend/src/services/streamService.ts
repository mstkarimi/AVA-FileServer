import fs from 'fs';
import { Request, Response } from 'express';
import { getMimeType } from '../utils/mime';

interface RangeParsed {
  start: number;
  end: number;
}

function parseRange(header: string, fileSize: number): RangeParsed | null | 'invalid' {
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return 'invalid';

  const startStr = match[1];
  const endStr = match[2];

  let start: number;
  let end: number;

  if (startStr === '' && endStr === '') return 'invalid';

  if (startStr === '') {
    // suffix range: bytes=-N (last N bytes)
    const suffix = parseInt(endStr, 10);
    start = Math.max(0, fileSize - suffix);
    end = fileSize - 1;
  } else {
    start = parseInt(startStr, 10);
    end = endStr === '' ? fileSize - 1 : parseInt(endStr, 10);
  }

  if (isNaN(start) || isNaN(end) || start > end || end >= fileSize || start < 0) {
    return 'invalid';
  }

  return { start, end };
}

function etag(stat: fs.Stats): string {
  return `"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}"`;
}

export interface StreamOptions {
  /** Send Content-Disposition header. Default: false (matches plain static serving). */
  disposition?: boolean;
}

export function streamFile(
  req: Request,
  res: Response,
  filePath: string,
  opts: StreamOptions = {}
): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.status(404).end();
    return;
  }

  const filename = filePath.split('/').pop() || 'file';
  const mimeType = getMimeType(filename);
  const tag = etag(stat);
  const fileSize = stat.size;

  // Cache validation
  if (req.headers['if-none-match'] === tag) {
    res.status(304).end();
    return;
  }

  const rangeHeader = req.headers['range'];

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('ETag', tag);
  res.setHeader('Last-Modified', stat.mtime.toUTCString());
  res.setHeader('Cache-Control', 'public, max-age=3600');

  if (opts.disposition) {
    const encodedName = encodeURIComponent(filename);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename}"; filename*=UTF-8''${encodedName}`
    );
  }

  const isHead = req.method === 'HEAD';

  if (rangeHeader) {
    const parsed = parseRange(rangeHeader, fileSize);

    if (parsed === null || parsed === 'invalid') {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      res.status(416).end();
      return;
    }

    const { start, end } = parsed as RangeParsed;
    const chunkSize = end - start + 1;

    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);
    res.status(206);

    if (isHead) {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
    stream.on('error', () => res.end());
    return;
  }

  res.setHeader('Content-Length', fileSize);
  res.status(200);

  if (isHead) {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('error', () => res.end());
}
