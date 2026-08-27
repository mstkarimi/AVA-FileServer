/**
 * View modes for the file browser — the "different ways of viewing files, like
 * in Windows" the team asked for.
 *
 * Four modes, chosen to cover genuinely different jobs rather than to pad a
 * menu: scanning metadata (Details), scanning many names at once (List),
 * recognising material by shape (Tiles), and looking at pictures (Gallery).
 */

export type ViewMode = 'details' | 'list' | 'tiles' | 'gallery';

export const VIEW_MODES: ViewMode[] = ['details', 'list', 'tiles', 'gallery'];

export const VIEW_LABEL: Record<ViewMode, string> = {
  details: 'Details',
  list: 'List',
  tiles: 'Tiles',
  gallery: 'Gallery',
};

export const VIEW_HINT: Record<ViewMode, string> = {
  details: 'Rows with size and date',
  list: 'Compact — many names at once',
  tiles: 'Medium icons with details',
  gallery: 'Large previews',
};

/**
 * Only Gallery fetches thumbnails. Tiles show a 48px box, where a file-type
 * icon is exactly as recognisable as a downscaled photo — so an entire mode
 * comes off the bandwidth risk surface for no perceptual loss.
 */
export function showsThumbs(mode: ViewMode): boolean {
  return mode === 'gallery';
}

/** Thumbnail/icon edge in px per mode. */
export const VIEW_EDGE: Record<ViewMode, number> = {
  details: 20,
  list: 18,
  tiles: 48,
  gallery: 132,
};

const KEY = 'fileview.mode';

export function loadViewMode(fallback: ViewMode = 'details'): ViewMode {
  try {
    const raw = localStorage.getItem(KEY);
    // Guard against a stale or hand-edited value — an unknown string must not
    // render a blank listing.
    return (VIEW_MODES as string[]).includes(raw || '') ? (raw as ViewMode) : fallback;
  } catch {
    return fallback;   // private mode / storage blocked
  }
}

export function saveViewMode(mode: ViewMode): void {
  try { localStorage.setItem(KEY, mode); } catch { /* non-fatal */ }
}
