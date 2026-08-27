/**
 * Quick Access for the sidebar — pinned folders and a recent-folders list,
 * modelled on Windows Explorer. Both live in localStorage and are keyed by
 * absolute folder path. Every read is total (never throws, always returns a
 * valid array) so a private window or hand-edited value can't blank the UI.
 */

export interface QuickItem {
  path: string;
  name: string;
}

const PIN_KEY = 'fileview.pins';
const RECENT_KEY = 'fileview.recent';
const RECENT_MAX = 8;

function baseName(path: string): string {
  if (path === '/' || !path) return 'root';
  const p = path.split('/').filter(Boolean);
  return p[p.length - 1] || 'root';
}

function readList(key: string): QuickItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Tolerate garbage entries rather than throwing the whole list away.
    return parsed
      .filter(x => x && typeof x.path === 'string')
      .map(x => ({ path: x.path as string, name: typeof x.name === 'string' ? x.name : baseName(x.path) }));
  } catch {
    return [];
  }
}

function writeList(key: string, list: QuickItem[]): void {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* private mode / quota */ }
}

// ── Pins ────────────────────────────────────────────────────────────────────
export function getPins(): QuickItem[] {
  return readList(PIN_KEY);
}

export function isPinned(path: string): boolean {
  return getPins().some(p => p.path === path);
}

export function togglePin(path: string, name?: string): boolean {
  const pins = getPins();
  const i = pins.findIndex(p => p.path === path);
  let nowPinned: boolean;
  if (i >= 0) { pins.splice(i, 1); nowPinned = false; }
  else { pins.push({ path, name: name || baseName(path) }); nowPinned = true; }
  writeList(PIN_KEY, pins);
  emit();
  return nowPinned;
}

export function unpin(path: string): void {
  writeList(PIN_KEY, getPins().filter(p => p.path !== path));
  emit();
}

// ── Recents ───────────────────────────────────────────────────────────────
export function getRecents(): QuickItem[] {
  return readList(RECENT_KEY);
}

/** Record a visit. Most-recent first, de-duplicated, capped, root excluded. */
export function recordRecent(path: string, name?: string): void {
  if (!path || path === '/') return;
  const list = getRecents().filter(r => r.path !== path);
  list.unshift({ path, name: name || baseName(path) });
  writeList(RECENT_KEY, list.slice(0, RECENT_MAX));
  emit();
}

export function clearRecents(): void {
  writeList(RECENT_KEY, []);
  emit();
}

// ── Change notification (so every mounted sidebar updates at once) ──────────
const listeners = new Set<() => void>();
function emit(): void { listeners.forEach(fn => { try { fn(); } catch { /* ignore */ } }); }

export function onQuickAccessChange(fn: () => void): () => void {
  listeners.add(fn);
  // Cross-tab: another tab pinning a folder fires a storage event here too.
  const onStorage = (e: StorageEvent) => { if (e.key === PIN_KEY || e.key === RECENT_KEY) fn(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage); };
}
