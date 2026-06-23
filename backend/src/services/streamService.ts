import fs from 'fs';
import { Request, Response } from 'express';
import { getMimeType } from '../utils/mime';
import { clientIp, acquireSlot, releaseSlot, ThrottleStream, rateBytesPerSec } from './downloadGuard';

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

  // ── Abuse guards (item 4) ────────────────────────────────────────────────
  // A slot is reserved only for actual GET bodies (never HEAD / 304 / 416) and
  // released exactly once when the connection closes (normal finish OR abort).
  const ip = clientIp(req);
  let released = false;
  const release = (): void => {
    if (!released) { released = true; releaseSlot(ip); }
  };

  function pipeBody(readable: fs.ReadStream): void {
    res.on('close', release);
    readable.on('error', () => { release(); res.end(); });
    const rate = rateBytesPerSec();
    if (rate > 0) {
      const throttle = new ThrottleStream(rate);
      throttle.on('error', () => { release(); readable.destroy(); res.end(); });
      readable.pipe(throttle).pipe(res);
    } else {
      readable.pipe(res);
    }
  }

  function rejectBusy(): void {
    // At the per-IP concurrent-stream cap — ask the client to back off briefly.
    res.setHeader('Retry-After', '5');
    res.status(429).end();
  }

  if (rangeHeader) {
    const parsed = parseRange(rangeHeader, fileSize);

    if (parsed === null || parsed === 'invalid') {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      res.status(416).end();
      return;
    }

    const { start, end } = parsed as RangeParsed;
    const chunkSize = end - start + 1;

    if (isHead) {
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunkSize);
      res.status(206).end();
      return;
    }

    if (!acquireSlot(ip)) { rejectBusy(); return; }
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);
    res.status(206);
    pipeBody(fs.createReadStream(filePath, { start, end }));
    return;
  }

  if (isHead) {
    res.setHeader('Content-Length', fileSize);
    res.status(200).end();
    return;
  }

  if (!acquireSlot(ip)) { rejectBusy(); return; }
  res.setHeader('Content-Length', fileSize);
  res.status(200);
  pipeBody(fs.createReadStream(filePath));
}
