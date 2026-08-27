/**
 * One source of truth for how a file is described in the UI: its kind, its
 * icon colour, and how its size/date are formatted. Admin.tsx and Browse.tsx
 * used to carry near-identical private copies of all of this, which is how
 * they drifted apart visually; both now import from here.
 */

export type FileKind = 'folder' | 'audio' | 'video' | 'image' | 'doc' | 'archive' | 'code' | 'other';

const BY_EXT: Record<string, FileKind> = {};
const put = (kind: FileKind, exts: string[]) => exts.forEach(e => { BY_EXT[e] = kind; });

put('audio', ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus']);
put('video', ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg']);
put('image', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico', 'tif', 'tiff']);
put('doc', ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'ppt', 'pptx', 'xls', 'xlsx', 'csv']);
put('archive', ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso']);
put('code', ['js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'py', 'java', 'c', 'cpp', 'sh', 'xml', 'yml', 'yaml']);

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i <= 0 ? '' : name.slice(i + 1).toLowerCase();
}

export function kindOf(name: string, type: 'file' | 'dir'): FileKind {
  if (type === 'dir') return 'folder';
  return BY_EXT[extOf(name)] || 'other';
}

/**
 * Tailwind text colour per kind. Deliberately the same hues the app already
 * used, but with explicit light/dark pairs so icons stay legible on both
 * backgrounds (the old code used only the dark-theme shades).
 */
export const KIND_COLOR: Record<FileKind, string> = {
  folder:  'text-amber-500 dark:text-amber-400',
  audio:   'text-sky-500 dark:text-sky-400',
  video:   'text-violet-500 dark:text-violet-400',
  image:   'text-emerald-500 dark:text-emerald-400',
  doc:     'text-orange-500 dark:text-orange-400',
  archive: 'text-yellow-600 dark:text-yellow-500',
  code:    'text-cyan-600 dark:text-cyan-400',
  other:   'text-slate-400 dark:text-slate-500',
};

/** Soft tinted background used behind large icons in tile/gallery modes. */
export const KIND_TINT: Record<FileKind, string> = {
  folder:  'bg-amber-50 dark:bg-amber-500/10',
  audio:   'bg-sky-50 dark:bg-sky-500/10',
  video:   'bg-violet-50 dark:bg-violet-500/10',
  image:   'bg-emerald-50 dark:bg-emerald-500/10',
  doc:     'bg-orange-50 dark:bg-orange-500/10',
  archive: 'bg-yellow-50 dark:bg-yellow-500/10',
  code:    'bg-cyan-50 dark:bg-cyan-500/10',
  other:   'bg-slate-100 dark:bg-slate-700/40',
};

export function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

/** Compact absolute date — stable and unambiguous across locales. */
export function formatDate(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "3 days ago" style, for the tooltip / secondary line. */
export function relativeDate(ms: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const min = 60_000, hr = 60 * min, day = 24 * hr;
  if (diff < min) return 'just now';
  if (diff < hr) { const n = Math.floor(diff / min); return `${n} min ago`; }
  if (diff < day) { const n = Math.floor(diff / hr); return `${n} hour${n === 1 ? '' : 's'} ago`; }
  const n = Math.floor(diff / day);
  if (n < 31) return `${n} day${n === 1 ? '' : 's'} ago`;
  if (n < 365) { const m = Math.floor(n / 30); return `${m} month${m === 1 ? '' : 's'} ago`; }
  const y = Math.floor(n / 365);
  return `${y} year${y === 1 ? '' : 's'} ago`;
}

/** Natural/numeric comparison so "1.2" sorts before "1.10". */
export const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
