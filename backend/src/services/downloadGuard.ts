import { Transform, TransformCallback } from 'stream';
import { Request } from 'express';
import { config } from '../config';

/**
 * Abuse guards for file streaming (item 4 — "stop one person draining the
 * bandwidth"). Two independent, configurable layers:
 *
 *   1. Per-IP concurrent-stream cap — blocks a single source from opening an
 *      abusive number of parallel connections. The whole office shares ONE
 *      public NAT IP, so this cap is deliberately generous: it targets extreme
 *      abuse (hundreds of parallel connections / a scripted hammer), not normal
 *      use. Tune with DOWNLOAD_MAX_CONCURRENT_PER_IP.
 *
 *   2. Per-connection bandwidth throttle — paces each stream to a byte/sec
 *      ceiling so a single large download can't saturate the uplink. Off by
 *      default (0); enable with DOWNLOAD_RATE_LIMIT_MBPS once a sane per-link
 *      speed for this server's uplink is known.
 */

/**
 * Which budget a stream draws from. Thumbnails are decoration and must never
 * be able to consume the slots a real download needs, so they get their own,
 * smaller pool rather than a share of the same one.
 */
export type Pool = 'stream' | 'thumb';

// Live count of in-flight streams per client IP, one map per pool.
const active = new Map<string, number>();
const activeThumbs = new Map<string, number>();

function poolOf(pool: Pool): { map: Map<string, number>; cap: number } {
  return pool === 'thumb'
    ? { map: activeThumbs, cap: config.thumbMaxConcurrentPerIp }
    : { map: active, cap: config.downloadMaxConcurrentPerIp };
}

export function clientIp(req: Request): string {
  // `trust proxy` is set on the app, so req.ip is the real client IP taken from
  // X-Forwarded-For (set by the host nginx), not the proxy's loopback address.
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Try to reserve a stream slot for this IP. Returns false if at the cap.
 * The pool defaults to 'stream' so every existing caller behaves exactly as
 * before.
 */
export function acquireSlot(ip: string, pool: Pool = 'stream'): boolean {
  const { map, cap } = poolOf(pool);
  const n = map.get(ip) || 0;
  if (n >= cap) return false;
  map.set(ip, n + 1);
  return true;
}

/**
 * Release a previously-acquired slot. Idempotency is the caller's job.
 * The pool MUST match the one the slot was acquired from — releasing into the
 * wrong map leaks the original slot permanently.
 */
export function releaseSlot(ip: string, pool: Pool = 'stream'): void {
  const { map } = poolOf(pool);
  const n = map.get(ip) || 0;
  if (n <= 1) map.delete(ip);
  else map.set(ip, n - 1);
}

/**
 * Transform that paces output to `bytesPerSec` using a simple cumulative-average
 * model: after each chunk, if we're ahead of where the target rate says we
 * should be, defer the chunk by the difference. When the rate is generous (or
 * the disk is the bottleneck) the delay is ~0 and this is a no-op pass-through.
 */
export class ThrottleStream extends Transform {
  private startTime = 0;
  private bytesSent = 0;

  constructor(private readonly bytesPerSec: number) {
    // Smaller chunks => smoother pacing (default highWaterMark is 64 KiB).
    super({ highWaterMark: 64 * 1024 });
  }

  override _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback): void {
    if (this.startTime === 0) this.startTime = Date.now();
    this.bytesSent += chunk.length;
    const elapsedMs = Date.now() - this.startTime;
    const expectedMs = (this.bytesSent / this.bytesPerSec) * 1000;
    const delay = expectedMs - elapsedMs;
    if (delay > 1) setTimeout(() => cb(null, chunk), delay);
    else cb(null, chunk);
  }
}

/** Configured per-connection rate in bytes/sec, or 0 when disabled. */
export function rateBytesPerSec(): number {
  return config.downloadRateLimitMbps > 0
    ? Math.floor(config.downloadRateLimitMbps * 1024 * 1024)
    : 0;
}
