import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  X, Eye, Download, ExternalLink, Share2, Link2, Pencil, Move, Trash2,
  FolderOpen, Star, Info, Folder, File as FileIcon, Music, Video,
  Image as ImageIcon, FileText, Archive,
} from 'lucide-react';
import { FileEntry } from '../api/client';
import { toast } from './Toast';
import Thumb from './Thumb';
import { isThumbable } from '../lib/thumbs';
import {
  FileKind, kindOf, extOf, KIND_COLOR, KIND_TINT, formatSize, formatDate, relativeDate,
} from '../lib/fileMeta';
import { isPinned, togglePin, onQuickAccessChange } from '../lib/quickAccess';

const KIND_ICON: Record<FileKind, typeof FileIcon> = {
  folder: Folder, audio: Music, video: Video, image: ImageIcon,
  doc: FileText, archive: Archive, code: FileText, other: FileIcon,
};

const KIND_LABEL: Record<FileKind, string> = {
  folder: 'Folder', audio: 'Audio', video: 'Video', image: 'Image',
  doc: 'Document', archive: 'Archive', code: 'Code', other: 'File',
};

export interface Props {
  /** The entry whose details are shown, or null for the no-selection state. */
  entry: FileEntry | null;
  /** Absolute path of `entry`. */
  path: string | null;
  onClose: () => void;

  /** Folder context for the empty state. */
  currentPath: string;
  itemCount: number;

  hrefFor?: (entry: FileEntry) => string;
  onOpen: (entry: FileEntry) => void;
  onPreview: (entry: FileEntry) => void;
  onShare?: (entry: FileEntry) => void;
  onRename?: (entry: FileEntry) => void;
  onMove?: (entry: FileEntry) => void;
  onDelete?: (entries: FileEntry[]) => void;
}

export default function DetailsPanel(props: Props) {
  const { entry, path, onClose, currentPath, itemCount, hrefFor,
    onOpen, onPreview, onShare, onRename, onMove, onDelete } = props;

  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!path || entry?.type !== 'dir') { setPinned(false); return; }
    setPinned(isPinned(path));
    return onQuickAccessChange(() => setPinned(isPinned(path)));
  }, [path, entry?.type]);

  const header = (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
      <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        <Info size={16} /> Details
      </span>
      <button onClick={onClose} aria-label="Close details panel"
        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:text-slate-100 dark:hover:bg-slate-700">
        <X size={16} />
      </button>
    </div>
  );

  if (!entry || !path) {
    return (
      <aside className="w-72 shrink-0 flex flex-col bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
        {header}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-slate-400 dark:text-slate-500">
          <FolderOpen size={30} className="mb-3 opacity-50" />
          <p className="text-sm">Select an item to see its details and actions.</p>
          <p className="text-xs mt-2">{itemCount} item{itemCount === 1 ? '' : 's'} in this folder</p>
        </div>
      </aside>
    );
  }

  const isDir = entry.type === 'dir';
  const kind = kindOf(entry.name, entry.type);
  const Icon = KIND_ICON[kind];
  const ext = extOf(entry.name);
  const href = hrefFor?.(entry);
  const parent = path.slice(0, path.lastIndexOf('/')) || '/';

  function download() {
    if (!href) return;
    const a = document.createElement('a');
    a.href = href; a.download = entry!.name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function copyLink() {
    if (!entry?.shareUrl) return;
    navigator.clipboard.writeText(entry.shareUrl)
      .then(() => toast('Share link copied', 'success'))
      .catch(() => toast('Copy failed', 'error'));
  }

  // Actions, ordered primary → secondary → destructive, filtered by capability.
  const primary: ReactNode[] = [];
  if (isDir) {
    primary.push(actionBtn('open', <FolderOpen size={16} />, 'Open', () => onOpen(entry), 'primary'));
  } else {
    primary.push(actionBtn('preview', <Eye size={16} />, 'Preview', () => onPreview(entry), 'primary'));
    if (href) primary.push(actionBtn('download', <Download size={16} />, 'Download', download));
  }
  if (href) primary.push(actionBtn('newtab', <ExternalLink size={16} />, 'Open in new tab', () => window.open(href, '_blank', 'noopener')));
  if (entry.shareUrl) primary.push(actionBtn('copy', <Link2 size={16} />, 'Copy share link', copyLink));
  if (onShare) primary.push(actionBtn('share', <Share2 size={16} />, isDir ? 'Share folder' : 'Create share link', () => onShare(entry)));

  const manage: ReactNode[] = [];
  if (onRename) manage.push(actionBtn('rename', <Pencil size={16} />, 'Rename', () => onRename(entry)));
  if (onMove) manage.push(actionBtn('move', <Move size={16} />, 'Move', () => onMove(entry)));

  return (
    <aside className="w-72 shrink-0 flex flex-col bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
      {header}
      <div className="flex-1 overflow-y-auto">
        {/* Preview / hero */}
        <div className={`m-4 rounded-xl flex items-center justify-center overflow-hidden aspect-[4/3] ${KIND_TINT[kind]}`}>
          {!isDir && isThumbable(entry.name, entry.type, entry.size) ? (
            <Thumb path={path} name={entry.name} type={entry.type} size={entry.size} edge={180}
              fallback={<Icon size={54} className={KIND_COLOR[kind]} />} />
          ) : (
            <Icon size={54} className={KIND_COLOR[kind]} />
          )}
        </div>

        {/* Name */}
        <div className="px-4">
          <h3 dir="auto" className="text-sm font-semibold text-slate-800 dark:text-slate-100 break-words">{entry.name}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {KIND_LABEL[kind]}{ext && !isDir ? ` · ${ext.toUpperCase()}` : ''}
          </p>
        </div>

        {/* Metadata */}
        <dl className="px-4 mt-4 space-y-2.5 text-xs">
          {!isDir && <Field label="Size" value={formatSize(entry.size)} />}
          <Field label="Modified" value={formatDate(entry.modified)} hint={relativeDate(entry.modified)} />
          <Field label="Location" value={parent} mono />
          {entry.shareUrl && <Field label="Shared" value="Public link active" accent />}
        </dl>

        {/* Pin (folders only) */}
        {isDir && (
          <div className="px-4 mt-4">
            <button
              onClick={() => setPinned(togglePin(path, entry.name))}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border
                ${pinned
                  ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'}`}
            >
              <Star size={15} className={pinned ? 'fill-current' : ''} />
              {pinned ? 'Pinned to Quick Access' : 'Pin to Quick Access'}
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="px-4 mt-4 pb-4 space-y-1">
          <SectionLabel>Actions</SectionLabel>
          {primary}
          {manage.length > 0 && <><div className="h-px bg-slate-200 dark:bg-slate-700 my-1.5" />{manage}</>}
          {onDelete && (
            <>
              <div className="h-px bg-slate-200 dark:bg-slate-700 my-1.5" />
              {actionBtn('delete', <Trash2 size={16} />, 'Delete', () => onDelete([entry]), 'danger')}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function actionBtn(
  key: string, icon: ReactNode, label: string, onClick: () => void,
  variant: 'normal' | 'primary' | 'danger' = 'normal',
) {
  const cls =
    variant === 'primary'
      ? 'bg-blue-600 text-white hover:bg-blue-500'
      : variant === 'danger'
        ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700';
  return (
    <button key={key} onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${cls}`}>
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 font-medium px-1 pb-1">{children}</div>;
}

function Field({ label, value, hint, mono, accent }: { label: string; value: string; hint?: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-slate-400 dark:text-slate-500">{label}</dt>
      <dd
        dir="auto"
        title={hint || value}
        className={`${mono ? 'font-mono text-[11px]' : ''} break-words ${accent ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-200'}`}
      >
        {value}{hint ? <span className="text-slate-400 dark:text-slate-500"> · {hint}</span> : ''}
      </dd>
    </div>
  );
}
