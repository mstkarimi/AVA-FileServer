/**
 * Safe thumbnail loading for the file browser.
 *
 * WHY THIS EXISTS — the production constraint that shapes every number below:
 * thumbnails are served by GET /api/preview, which goes through the backend's
 * streamFile(). That path enforces a PER-IP concurrent-stream cap (20 by
 * default) and answers 429 once it is hit. The whole office shares ONE public
 * NAT IP. A naive grid that sets 60 <img src> at once would therefore
 * (a) 429 itself, and (b) starve every real download in the building.
 *
 * There is also no server-side resizer (no image library is installable — the
 * npm registry is blocked from the server), so a "thumbnail" is the FULL-SIZE
 * original scaled down by CSS. That makes bandwidth, not CPU, the scarce
 * resource, which is why the size ceiling below is deliberately conservative.
 *
 * The guarantees this module provides:
 *   1. At most MAX_INFLIGHT thumbnail requests exist at any instant.
 *   2. Only small images are ever fetched (SIZE_CEILING).
 *   3. A 429 trips a session-wide circuit breaker: we stop asking entirely and
 *      fall back to icons, rather than hammering a server that is already busy.
 *   4. Off-screen tiles never fetch, and scrolling past one cancels it.
 *   5. Object URLs are pooled with a hard cap and revoked on eviction, so a
 *      2000-file folder cannot grow memory without bound.
 */

/** Never more than this many thumbnail requests in flight at once. */
const MAX_INFLIGHT = 3;

/**
 * Images larger than this are shown as icons — never fetched. A 132px tile on
 * a 2x display needs roughly a 25 KB JPEG, so 512 KB is already 20x more than
 * the pixels justify; anything bigger is pure waste on a shared uplink.
 */
const SIZE_CEILING = 512 * 1024;

/** How many decoded thumbnails to keep before evicting the oldest. */
const CACHE_LIMIT = 60;

/**
 * Cap each cached thumbnail's PIXEL dimensions. The size ceiling above bounds
 * the *file* bytes, but the browser holds the DECODED bitmap in GPU/CPU memory
 * at the image's full resolution — a 400 KB JPEG can still be 4000×3000 = ~48 MB
 * decoded. Sixty of those is well over a gigabyte of texture memory, which on a
 * modest GPU triggers Chrome to evict layers and repaint whole regions WHITE
 * (the "middle of the page goes blank" symptom). Downscaling each thumb once to
 * this longest edge keeps the whole cache in the low tens of MB.
 */
const MAX_THUMB_PX = 320;

/**
 * A single 429 trips the breaker. The cap is per-IP and shared by the whole
 * office, so one rejection means somebody is genuinely mid-download — asking
 * again would take slots from a real file transfer to draw decoration.
 */
const BREAKER_TRIP = 1;

/** How long to stay off before allowing thumbnails to be tried again. */
const BREAKER_COOLDOWN_MS = 90_000;

const THUMBABLE = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif']);

export function ext(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

/** Can this entry ever show a thumbnail? Cheap, synchronous, no network. */
export function isThumbable(name: string, type: 'file' | 'dir', size: number): boolean {
  if (breakerTripped) return false;
  if (type !== 'file') return false;
  if (size <= 0 || size > SIZE_CEILING) return false;
  return THUMBABLE.has(ext(name));
}

// ── Circuit breaker ────────────────────────────────────────────────────────
let breakerTripped = false;
let consecutive429 = 0;
const breakerListeners = new Set<() => void>();

export function thumbsDisabled(): boolean {
  return breakerTripped;
}

/** Subscribe to the breaker tripping so mounted tiles can drop to icons. */
export function onThumbsDisabled(fn: () => void): () => void {
  breakerListeners.add(fn);
  return () => breakerListeners.delete(fn);
}

function tripBreaker(): void {
  if (breakerTripped) return;
  breakerTripped = true;

  // Drain the waiters by RESOLVING them, never by discarding them. Dropping the
  // resolvers would leave their `await acquire()` pending forever, so the
  // `finally { release() }` that balances the gate would never run and the
  // in-flight counter would leak — permanently starving the queue even after
  // recovery. Each woken waiter sees the tripped flag, returns null, and
  // releases the slot it is credited with here.
  while (queue.length) {
    const resolve = queue.shift()!;
    inflight++;
    resolve();
  }

  breakerListeners.forEach(fn => { try { fn(); } catch { /* ignore */ } });

  // Re-arm later so a long session is not stuck on icons after one busy
  // moment. If the server is still saturated the next 429 simply trips again.
  setTimeout(() => { breakerTripped = false; consecutive429 = 0; }, BREAKER_COOLDOWN_MS);
}

// ── Concurrency gate ───────────────────────────────────────────────────────
let inflight = 0;
const queue: (() => void)[] = [];

function acquire(): Promise<void> {
  if (inflight < MAX_INFLIGHT) {
    inflight++;
    return Promise.resolve();
  }
  return new Promise<void>(resolve => { queue.push(resolve); });
}

function release(): void {
  const next = queue.shift();
  if (next) next();          // hand the slot straight over; inflight unchanged
  else inflight = Math.max(0, inflight - 1);
}

// ── Object-URL cache (bounded, insertion-ordered) ──────────────────────────
const cache = new Map<string, string>();   // path -> object URL
const failed = new Set<string>();          // paths we will not retry

function remember(path: string, url: string): void {
  cache.set(path, url);
  while (cache.size > CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    const oldestUrl = cache.get(oldestKey);
    cache.delete(oldestKey);
    if (oldestUrl) URL.revokeObjectURL(oldestUrl);
  }
}

export function cachedThumb(path: string): string | undefined {
  return cache.get(path);
}

export function thumbFailed(path: string): boolean {
  return failed.has(path);
}

/**
 * Thumbnails use /api/thumb, NOT /api/preview. Same file, same permission
 * check, but a separate and much smaller per-IP concurrency pool on the server
 * — so decoration can never take a slot away from someone's real download.
 */
function thumbUrl(path: string): string {
  const token = localStorage.getItem('token') || '';
  return `/api/thumb?path=${encodeURIComponent(path)}&t=${encodeURIComponent(token)}`;
}

/**
 * Shrink a full-resolution image blob to at most MAX_THUMB_PX on its longest
 * edge, so the browser never holds a giant decoded bitmap. Output keeps alpha
 * (PNG) so transparent logos don't get a black box. Any failure (unsupported
 * API, an SVG that createImageBitmap can't rasterise, a decode error) falls
 * back to the original blob — the thumbnail still shows, just not shrunk.
 */
async function downscale(blob: Blob): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== 'function') return blob;
    const bmp = await createImageBitmap(blob);
    const longest = Math.max(bmp.width, bmp.height);
    if (longest <= MAX_THUMB_PX) { bmp.close?.(); return blob; }  // already small
    const scale = MAX_THUMB_PX / longest;
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));

    let out: Blob | null = null;
    if (typeof OffscreenCanvas === 'function') {
      const c = new OffscreenCanvas(w, h);
      const ctx = c.getContext('2d');
      if (!ctx) { bmp.close?.(); return blob; }
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close?.();
      out = await c.convertToBlob({ type: 'image/png' });
    } else {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) { bmp.close?.(); return blob; }
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close?.();
      out = await new Promise<Blob | null>(resolve => c.toBlob(resolve, 'image/png'));
    }
    return out || blob;
  } catch {
    return blob;
  }
}

/**
 * Fetch one thumbnail, respecting the gate and the breaker.
 * Resolves to an object URL, or null when no thumbnail should be shown.
 * Passing an AbortSignal lets a tile cancel itself when scrolled away.
 */
export async function loadThumb(path: string, signal: AbortSignal): Promise<string | null> {
  if (breakerTripped || failed.has(path)) return null;
  const hit = cache.get(path);
  if (hit) return hit;

  await acquire();
  try {
    if (breakerTripped || signal.aborted) return null;
    // Re-check the cache: an identical request may have completed while we
    // waited for a slot (the same image can appear in two mounted tiles).
    const raced = cache.get(path);
    if (raced) return raced;

    const res = await fetch(thumbUrl(path), { signal, cache: 'force-cache' });

    if (res.status === 429) {
      consecutive429++;
      if (consecutive429 >= BREAKER_TRIP) tripBreaker();
      return null;
    }
    if (!res.ok) {
      failed.add(path);
      return null;
    }
    consecutive429 = 0;

    const blob = await res.blob();
    if (signal.aborted) return null;
    if (!blob.type.startsWith('image/')) { failed.add(path); return null; }

    // Shrink the decoded pixels before we ever hand it to an <img>, so a folder
    // of high-res photos can't balloon GPU texture memory into white-out territory.
    const small = await downscale(blob);
    if (signal.aborted) return null;

    const url = URL.createObjectURL(small);
    remember(path, url);
    return url;
  } catch {
    // AbortError included — scrolling away is not a failure worth remembering.
    if (!signal.aborted) failed.add(path);
    return null;
  } finally {
    release();
  }
}
