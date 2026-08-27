import { useState, useMemo } from 'react';
import type { MouseEvent, DragEvent, ReactNode } from 'react';
// Icon names are restricted to ones proven to exist in lucide-react 0.344.0
// (the pinned version): anything newer fails `vite build` with "no matching
// export", which on this server is an unrecoverable deploy.
import {
  Folder, File as FileIcon, Music, Video, Image as ImageIcon, FileText, Archive,
  Trash2, Share2, Eye, Pencil, Move, Link2, ExternalLink, Download, FolderOpen,
  ChevronUp, ChevronDown, Check, X,
} from 'lucide-react';
import { FileEntry } from '../api/client';
import { toast } from './Toast';
import RowMenu from './RowMenu';
import type { MenuItem } from './RowMenu';
import Thumb from './Thumb';
import {
  FileKind, kindOf, KIND_COLOR, KIND_TINT, formatSize, formatDate, relativeDate, collator,
} from '../lib/fileMeta';
import { ViewMode, VIEW_EDGE, showsThumbs } from '../lib/viewModes';
import ViewModeSwitcher from './ViewModeSwitcher';

type SortKey = 'name' | 'size' | 'modified';

const KIND_ICON: Record<FileKind, typeof FileIcon> = {
  folder: Folder, audio: Music, video: Video, image: ImageIcon,
  doc: FileText, archive: Archive, code: FileText, other: FileIcon,
};

function EntryIcon({ entry, size }: { entry: FileEntry; size: number }) {
  const kind = kindOf(entry.name, entry.type);
  const Icon = KIND_ICON[kind];
  return <Icon size={size} className={`${KIND_COLOR[kind]} shrink-0`} />;
}

/** True when a click intends a new tab/window (so we must not hijack it). */
function isModifiedClick(e: MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

function copyLink(url: string) {
  navigator.clipboard.writeText(url)
    .then(() => toast('Share link copied', 'success'))
    .catch(() => toast('Copy failed', 'error'));
}

export interface Props {
  entries: FileEntry[];
  /** Absolute path of the folder being shown — needed to address thumbnails. */
  currentPath: string;
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;

  /** While true a skeleton is shown, so navigation never flashes "empty folder". */
  loading?: boolean;

  onOpen: (entry: FileEntry) => void;
  onPreview: (entry: FileEntry) => void;

  /** URL for a folder (SPA route) or file (raw stream), for new-tab + download. */
  hrefFor?: (entry: FileEntry) => string;

  // ── Optional capabilities. An action renders only when its handler exists,
  //    which is what makes this component safe to share between the admin
  //    screen and the far more limited viewer screen.
  selected?: Set<string>;
  onSelect?: (name: string) => void;
  onSelectAll?: (names: string[], select: boolean) => void;
  onShare?: (entry: FileEntry) => void;
  onRename?: (entry: FileEntry) => void;
  onMove?: (entry: FileEntry) => void;
  onDelete?: (entries: FileEntry[]) => void;
  onMoveInto?: (sourceName: string, destFolderName: string) => void;
  onMoveSelected?: () => void;
  onBulkShare?: () => void;
}

export default function FileList(props: Props) {
  const {
    entries, currentPath, mode, onModeChange, onOpen, onPreview, hrefFor, loading,
    selected, onSelect, onSelectAll, onShare, onRename, onMove, onDelete,
    onMoveInto, onMoveSelected, onBulkShare,
  } = props;

  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [dragOverName, setDragOverName] = useState<string | null>(null);
  const [draggingName, setDraggingName] = useState<string | null>(null);
  const [menuRow, setMenuRow] = useState<string | null>(null);

  const selectable = !!onSelect && !!selected;
  const sel = selected ?? new Set<string>();

  const sorted = useMemo(() => {
    const list = [...entries];
    list.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;   // folders first, always
      let cmp = 0;
      if (sortKey === 'name') cmp = collator.compare(a.name, b.name);
      else if (sortKey === 'size') cmp = a.size - b.size;
      else cmp = a.modified - b.modified;
      // Ties fall back to natural name order so the list never jitters.
      if (cmp === 0) cmp = collator.compare(a.name, b.name);
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [entries, sortKey, sortAsc]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc(a => !a);
    else { setSortKey(k); setSortAsc(k === 'name'); }   // dates/sizes read best newest/largest first
  }

  const selectedEntries = sorted.filter(e => sel.has(e.name));
  const allSelected = sorted.length > 0 && sorted.every(e => sel.has(e.name));
  const someSelected = sorted.some(e => sel.has(e.name)) && !allSelected;

  function pathOf(entry: FileEntry): string {
    return currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
  }

  // ── Per-entry action model, shared by every view mode ────────────────────
  function menuItems(entry: FileEntry): MenuItem[] {
    const href = hrefFor?.(entry);
    const items: MenuItem[] = [];
    const isDir = entry.type === 'dir';

    items.push(isDir
      ? { icon: <FolderOpen size={15} />, label: 'Open', onClick: () => onOpen(entry) }
      : { icon: <Eye size={15} />, label: 'Preview', onClick: () => onPreview(entry) });

    if (href) {
      items.push({
        icon: <ExternalLink size={15} />, label: 'Open in new tab',
        onClick: () => window.open(href, '_blank', 'noopener'),
      });
    }
    if (!isDir && href) {
      items.push({ icon: <Download size={15} />, label: 'Download', onClick: () => triggerDownload(href, entry.name) });
    }
    if (entry.shareUrl) {
      items.push({ icon: <Link2 size={15} />, label: 'Copy share link', onClick: () => copyLink(entry.shareUrl!) });
    }
    if (onShare) {
      items.push({ icon: <Share2 size={15} />, label: isDir ? 'Share folder' : 'Share', onClick: () => onShare(entry) });
    }
    if (onRename) items.push({ icon: <Pencil size={15} />, label: 'Rename', onClick: () => onRename(entry), separated: true });
    if (onMove) items.push({ icon: <Move size={15} />, label: 'Move', onClick: () => onMove(entry) });
    if (onDelete) items.push({ icon: <Trash2 size={15} />, label: 'Delete', onClick: () => onDelete([entry]), danger: true, separated: true });
    return items;
  }

  function triggerDownload(href: string, name: string) {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /**
   * The always-available small icons; the rest live in the overflow menu.
   *
   * These are plain render FUNCTIONS, deliberately not components declared in
   * the body of FileList. A component defined inside a render gets a fresh
   * identity every time the parent re-renders, so React would unmount and
   * remount it — and RowMenu's open state would be destroyed the instant the
   * menu button set state, making the row menu impossible to open.
   */
  function quickActions(entry: FileEntry, dense?: boolean) {
    const href = hrefFor?.(entry);
    const isDir = entry.type === 'dir';
    const btn = 'p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors';
    return (
      <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
        {!isDir && (
          <button onClick={() => onPreview(entry)} title="Preview" aria-label={`Preview ${entry.name}`}
            className={`${btn} hover:text-blue-600 dark:hover:text-blue-400`}>
            <Eye size={15} />
          </button>
        )}
        {/* Download is the one icon dropped in the narrow modes — a gallery tile
            is only ~150px wide. It stays available in the overflow menu. */}
        {!isDir && href && !dense && (
          <button onClick={() => triggerDownload(href, entry.name)} title="Download" aria-label={`Download ${entry.name}`}
            className={`${btn} hover:text-emerald-600 dark:hover:text-emerald-400`}>
            <Download size={15} />
          </button>
        )}
        {entry.shareUrl ? (
          <button onClick={() => copyLink(entry.shareUrl!)} title="Copy share link" aria-label={`Copy share link for ${entry.name}`}
            className={`${btn} text-blue-500 hover:text-blue-600 dark:text-blue-400`}>
            <Link2 size={15} />
          </button>
        ) : onShare ? (
          <button onClick={() => onShare(entry)} title="Create share link" aria-label={`Share ${entry.name}`}
            className={`${btn} hover:text-blue-600 dark:hover:text-blue-400`}>
            <Share2 size={15} />
          </button>
        ) : null}
        <RowMenu items={menuItems(entry)} label={entry.name} onOpenChange={o => setMenuRow(o ? entry.name : null)} />
      </div>
    );
  }

  // ── Drag & drop (unchanged semantics, applied to every mode) ─────────────
  function dragProps(entry: FileEntry) {
    if (!onMoveInto) return {};
    return {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.setData('text/plain', entry.name);
        e.dataTransfer.effectAllowed = 'move';
        setDraggingName(entry.name);
      },
      onDragEnd: () => { setDraggingName(null); setDragOverName(null); },
      ...(entry.type === 'dir' ? {
        onDragOver: (e: DragEvent) => {
          if (draggingName && draggingName !== entry.name) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDragOverName(entry.name);
          }
        },
        onDragLeave: () => setDragOverName(n => (n === entry.name ? null : n)),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          const src = e.dataTransfer.getData('text/plain');
          setDragOverName(null);
          setDraggingName(null);
          if (src && src !== entry.name) onMoveInto(src, entry.name);
        },
      } : {}),
    };
  }

  /**
   * Visual state for one entry.
   *
   * The hover background is applied HERE rather than in the base class list, so
   * that a selected row keeps its tint on hover. Tailwind's `hover:bg-*` has
   * higher specificity than a plain `bg-*`, so listing both together made
   * hovering silently erase the selection highlight.
   */
  function stateClasses(entry: FileEntry): string {
    const isSel = sel.has(entry.name);
    const isDropTarget = dragOverName === entry.name;
    // While dragging a member of a multi-selection the WHOLE selection moves,
    // so dim all of it — the browser's drag ghost only shows one row and users
    // could not otherwise tell that 30 items were about to move.
    const movingWithSelection =
      draggingName !== null && isSel && sel.size > 1 && sel.has(draggingName);

    return [
      isDropTarget
        ? 'ring-2 ring-inset ring-blue-500 bg-blue-100 dark:bg-blue-500/25'
        : isSel
          ? 'ring-2 ring-inset ring-blue-500 bg-blue-100/70 dark:bg-blue-500/20'
          : 'hover:bg-slate-100 dark:hover:bg-slate-700/50',
      draggingName === entry.name || movingWithSelection ? 'opacity-40' : '',
    ].join(' ');
  }

  /**
   * Card surface for the tile/gallery modes. The default background is chosen
   * here rather than hard-coded on the card, because two competing `bg-*`
   * utilities on one element resolve by stylesheet order, not by intent — the
   * selected tint could lose to `bg-white` at random.
   */
  function cardSurface(entry: FileEntry): string {
    const highlighted = sel.has(entry.name) || dragOverName === entry.name;
    return highlighted ? '' : 'bg-white dark:bg-slate-800';
  }

  function selectBox(entry: FileEntry, className = '') {
    if (!selectable) return null;
    return (
      <label className={`flex items-center ${className}`} onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={sel.has(entry.name)}
          onChange={() => onSelect!(entry.name)}
          aria-label={`Select ${entry.name}`}
          className="w-4 h-4 accent-blue-500 cursor-pointer"
        />
      </label>
    );
  }

  /** The clickable name. A real <a> for folders so Ctrl-click opens a tab. */
  function entryName(entry: FileEntry, className?: string) {
    const href = hrefFor?.(entry);
    const cls = `truncate ${className || ''}`;
    if (entry.type === 'dir' && href) {
      return (
        <a
          href={href}
          draggable={false}
          dir="auto"
          onClick={e => { if (isModifiedClick(e)) return; e.preventDefault(); onOpen(entry); }}
          title={`${entry.name} — open (Ctrl/⌘-click for a new tab)`}
          className={`${cls} hover:text-blue-600 dark:hover:text-blue-400 hover:underline`}
        >
          {entry.name}
        </a>
      );
    }
    return (
      <button
        dir="auto"
        onClick={e => { e.stopPropagation(); onPreview(entry); }}
        title={`${entry.name} — preview`}
        className={`${cls} text-left hover:text-blue-600 dark:hover:text-blue-400`}
      >
        {entry.name}
      </button>
    );
  }

  // pointer-events is toggled alongside opacity: an `opacity-0` button is still
  // clickable, so without this a stray click in the actions column would fire an
  // invisible action.
  const hoverActions =
    'opacity-0 pointer-events-none transition-opacity ' +
    'group-hover:opacity-100 group-hover:pointer-events-auto ' +
    'group-focus-within:opacity-100 group-focus-within:pointer-events-auto ' +
    'max-lg:opacity-100 max-lg:pointer-events-auto';

  /**
   * When to reveal an entry's action icons. Hover alone is not enough: a
   * SELECTED entry keeps its actions on screen, so the things you can do to an
   * item live on the item itself rather than only in a bar at the top of the
   * list. An open menu also pins them, or the strip would vanish under the
   * pointer as soon as the menu took focus.
   */
  function actionsVisible(entry: FileEntry): string {
    return menuRow === entry.name || sel.has(entry.name) ? '' : hoverActions;
  }

  // ─────────────────────────────── Toolbar ─────────────────────────────────
  const sortLabel: Record<SortKey, string> = { name: 'Name', size: 'Size', modified: 'Modified' };

  const toolbar = (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0">
      {selectable && (
        <label className="flex items-center pl-1 pr-1" title={allSelected ? 'Deselect all' : 'Select all'}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected; }}
            onChange={() => onSelectAll?.(sorted.map(e => e.name), !allSelected)}
            aria-label={allSelected ? 'Deselect all' : 'Select all'}
            className="w-4 h-4 accent-blue-500 cursor-pointer"
          />
        </label>
      )}

      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
        {sorted.length} item{sorted.length === 1 ? '' : 's'}
      </span>

      <div className="flex-1" />

      {/* Sort works in every mode — the column headers only exist in Details. */}
      <div className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-700/60">
        {(['name', 'size', 'modified'] as SortKey[]).map(k => (
          <button
            key={k}
            onClick={() => toggleSort(k)}
            aria-pressed={sortKey === k}
            title={`Sort by ${sortLabel[k].toLowerCase()}`}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              sortKey === k
                ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-400'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {sortLabel[k]}
            {sortKey === k && (sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
          </button>
        ))}
      </div>

      <ViewModeSwitcher mode={mode} onChange={onModeChange} />
    </div>
  );

  // ───────────────────────────── Selection bar ─────────────────────────────
  const bulkBar = selectable && sel.size > 0 && (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-500/15 border-b border-blue-200 dark:border-blue-500/30 text-sm">
      <span className="flex items-center gap-1.5 font-medium text-blue-700 dark:text-blue-300">
        <Check size={15} /> {sel.size} selected
      </span>
      <div className="flex-1" />
      {onBulkShare && (
        <button onClick={onBulkShare} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-700 transition-colors">
          <Link2 size={14} /> Share
        </button>
      )}
      {onMoveSelected && (
        <button onClick={onMoveSelected} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-700 transition-colors">
          <Move size={14} /> Move
        </button>
      )}
      {onDelete && (
        <button onClick={() => onDelete(selectedEntries)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 transition-colors">
          <Trash2 size={14} /> Delete
        </button>
      )}
      <button
        onClick={() => onSelectAll?.(sorted.map(e => e.name), false)}
        title="Clear selection"
        className="p-1 rounded-lg text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700"
      >
        <X size={15} />
      </button>
    </div>
  );

  // ──────────────────────────────── Modes ──────────────────────────────────
  // minmax(0,…) rather than a bare 1fr: a grid track's automatic minimum is
  // min-content, so one long unbroken filename would otherwise widen the name
  // column and shove the size/date/action columns out of the container.
  const DETAILS_GRID =
    'grid-cols-[auto_2rem_minmax(0,1fr)_auto] md:grid-cols-[auto_2.25rem_minmax(0,1fr)_5.5rem_10rem_auto]';

  function DetailsRow(entry: FileEntry, idx: number) {
    return (
      <div
        key={entry.name}
        {...dragProps(entry)}
        onDoubleClick={() => onOpen(entry)}
        className={`group grid ${DETAILS_GRID} items-center gap-x-3 px-3 py-1.5 rounded-lg
          transition-colors ${stateClasses(entry)}`}
      >
        {selectBox(entry)}
        <span className="text-xs text-slate-400 tabular-nums text-right">{idx + 1}</span>
        <div className="flex items-center gap-2 min-w-0">
          <EntryIcon entry={entry} size={VIEW_EDGE.details} />
          {entryName(entry, "text-sm text-slate-800 dark:text-slate-100")}
        </div>
        <span className="hidden md:block text-xs text-slate-500 dark:text-slate-400 tabular-nums text-right">
          {entry.type === 'file' ? formatSize(entry.size) : '—'}
        </span>
        <span className="hidden md:block text-xs text-slate-500 dark:text-slate-400 tabular-nums" title={relativeDate(entry.modified)}>
          {formatDate(entry.modified)}
        </span>
        <div className={actionsVisible(entry)}>
          {quickActions(entry)}
        </div>
      </div>
    );
  }

  function ListRow(entry: FileEntry) {
    return (
      <div
        key={entry.name}
        {...dragProps(entry)}
        onDoubleClick={() => onOpen(entry)}
        className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg min-w-0
          transition-colors ${stateClasses(entry)}`}
      >
        {selectBox(entry)}
        <EntryIcon entry={entry} size={VIEW_EDGE.list} />
        {entryName(entry, "text-sm text-slate-800 dark:text-slate-100 flex-1")}
        <div className={`shrink-0 ${actionsVisible(entry)}`}>
          {quickActions(entry, true)}
        </div>
      </div>
    );
  }

  function TileCard(entry: FileEntry) {
    const kind = kindOf(entry.name, entry.type);
    return (
      <div
        key={entry.name}
        {...dragProps(entry)}
        onDoubleClick={() => onOpen(entry)}
        className={`group relative flex items-center gap-3 p-2.5 rounded-xl border border-slate-200
          hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:hover:border-slate-600
          transition-all ${cardSurface(entry)} ${stateClasses(entry)}`}
      >
        {selectBox(entry, `absolute top-2 left-2 z-10 ${sel.has(entry.name) ? '' : hoverActions}`)}
        {showsThumbs(mode) ? (
          <Thumb
            path={pathOf(entry)} name={entry.name} type={entry.type} size={entry.size}
            edge={VIEW_EDGE.tiles}
            fallback={<div className={`w-full h-full flex items-center justify-center rounded-lg ${KIND_TINT[kind]}`}>
              <EntryIcon entry={entry} size={24} />
            </div>}
          />
        ) : <EntryIcon entry={entry} size={24} />}
        <div className="min-w-0 flex-1">
          {entryName(entry, "block text-sm font-medium text-slate-800 dark:text-slate-100")}
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="tabular-nums">{entry.type === 'dir' ? 'Folder' : formatSize(entry.size)}</span>
            <span className="opacity-50">·</span>
            <span className="truncate">{relativeDate(entry.modified)}</span>
            {entry.shareUrl && <Link2 size={11} className="text-blue-500 dark:text-blue-400 shrink-0" />}
          </div>
        </div>
        <div className={`shrink-0 ${actionsVisible(entry)}`}>
          {quickActions(entry, true)}
        </div>
      </div>
    );
  }

  function GalleryCard(entry: FileEntry) {
    const kind = kindOf(entry.name, entry.type);
    return (
      <div
        key={entry.name}
        {...dragProps(entry)}
        onDoubleClick={() => onOpen(entry)}
        className={`group relative flex flex-col rounded-xl border border-slate-200 overflow-hidden
          hover:border-slate-300 hover:shadow-md dark:border-slate-700 dark:hover:border-slate-600
          transition-all ${cardSurface(entry)} ${stateClasses(entry)}`}
      >
        {selectBox(entry, `absolute top-2 left-2 z-10 ${sel.has(entry.name) ? '' : hoverActions}`)}
        {/* NO backdrop-filter here. `backdrop-filter` (like `transform`) makes an
            element a containing block for `position: fixed` descendants, which
            re-anchored RowMenu's fixed menu to this 100px overlay and let the
            card's `overflow-hidden` clip it — the menu opened invisibly, which
            read as "the three-dot button does nothing". A solid translucent
            background gives the same legibility with no containing block. */}
        <div className={`absolute top-1.5 right-1.5 z-10 rounded-lg bg-white/90 dark:bg-slate-900/90
          ${actionsVisible(entry)}`}>
          {quickActions(entry, true)}
        </div>

        <div className={`w-full aspect-square flex items-center justify-center ${KIND_TINT[kind]}`}>
          {showsThumbs(mode) ? (
            <Thumb
              path={pathOf(entry)} name={entry.name} type={entry.type} size={entry.size}
              edge={VIEW_EDGE.gallery}
              fallback={<EntryIcon entry={entry} size={44} />}
            />
          ) : <EntryIcon entry={entry} size={44} />}
        </div>

        <div className="px-2.5 py-2 border-t border-slate-100 dark:border-slate-700/60 min-w-0">
          {entryName(entry, "block text-xs font-medium text-slate-800 dark:text-slate-100")}
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
            <span className="tabular-nums truncate">{entry.type === 'dir' ? 'Folder' : formatSize(entry.size)}</span>
            {entry.shareUrl && <Link2 size={10} className="text-blue-500 dark:text-blue-400 shrink-0" />}
          </div>
        </div>
      </div>
    );
  }

  const empty = (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
        <FolderOpen size={26} className="text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">This folder is empty</p>
      <p className="text-xs text-slate-400 mt-1">Nothing here yet.</p>
    </div>
  );

  const skeleton = (
    <div className="p-3 space-y-2" aria-busy="true" aria-label="Loading folder">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse" style={{ opacity: 1 - i * 0.1 }}>
          <div className="w-5 h-5 rounded bg-slate-200 dark:bg-slate-700 shrink-0" />
          <div className="h-3 rounded bg-slate-200 dark:bg-slate-700" style={{ width: `${30 + ((i * 13) % 45)}%` }} />
        </div>
      ))}
    </div>
  );

  let body: ReactNode;
  if (loading && sorted.length === 0) body = skeleton;
  else if (sorted.length === 0) body = empty;
  else if (mode === 'details') body = <div className="p-1.5 space-y-px">{sorted.map(DetailsRow)}</div>;
  else if (mode === 'list') body = (
    <div className="p-1.5 grid gap-x-4 gap-y-px grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {sorted.map(ListRow)}
    </div>
  );
  else if (mode === 'tiles') body = (
    <div className="p-3 grid gap-2 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">{sorted.map(TileCard)}</div>
  );
  else body = (
    <div className="p-3 grid gap-3 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">{sorted.map(GalleryCard)}</div>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {toolbar}
      {bulkBar}
      {mode === 'details' && sorted.length > 0 && (
        <div className={`hidden md:grid ${DETAILS_GRID} gap-x-3 px-3 py-1.5 text-[11px] uppercase tracking-wide
          text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-700/60 shrink-0`}>
          <span className="w-4" />
          <span className="text-right">#</span>
          <span>Name</span>
          <span className="text-right">Size</span>
          <span>Modified</span>
          <span className="w-24" />
        </div>
      )}
      {/* overflow-x-hidden is deliberate: `overflow-y:auto` alone computes
          overflow-x to `auto` too, which gave the body its own horizontal
          scrollbar and let it slide out of alignment with the column header. */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">{body}</div>
    </div>
  );
}
