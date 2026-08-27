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

    const url = URL.createObjectURL(blob);
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
