import { useState } from 'react';
import {
  Folder, File, Music, Video, Image, FileText, Trash2,
  Share2, Eye, Pencil, Move, MoreVertical, ChevronUp, ChevronDown, Link2,
} from 'lucide-react';
import { FileEntry } from '../api/client';
import { toast } from './Toast';

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

function fileIcon(entry: FileEntry) {
  if (entry.type === 'dir') return <Folder size={18} className="text-yellow-400" />;
  const ext = entry.name.split('.').pop()?.toLowerCase() || '';
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) return <Music size={18} className="text-blue-400" />;
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return <Video size={18} className="text-purple-400" />;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return <Image size={18} className="text-green-400" />;
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return <FileText size={18} className="text-orange-400" />;
  return <File size={18} className="text-slate-400" />;
}

type SortKey = 'name' | 'size' | 'modified';

interface Props {
  entries: FileEntry[];
  selected: Set<string>;
  onSelect: (name: string) => void;          // toggle one item in/out of the selection
  onSelectAll: (names: string[], select: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onPreview: (entry: FileEntry) => void;
  onShare: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onMove: (entry: FileEntry) => void;
  onMoveInto?: (sourceName: string, destFolderName: string) => void;   // item 15: drag-drop move
  onDelete: (entries: FileEntry[]) => void;
}

export default function FileList({
  entries, selected, onSelect, onSelectAll, onOpen, onPreview, onShare, onRename, onMove, onMoveInto, onDelete,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [dragOverName, setDragOverName] = useState<string | null>(null);
  const [draggingName, setDraggingName] = useState<string | null>(null);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  const sorted = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    let cmp = 0;
    if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortKey === 'size') cmp = a.size - b.size;
    else cmp = a.modified - b.modified;
    return sortAsc ? cmp : -cmp;
  });

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    return (
      <button
        onClick={() => toggleSort(k)}
        className="flex items-center gap-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 text-xs uppercase tracking-wide font-medium"
      >
        {label}
        {sortKey === k ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
      </button>
    );
  }

  const selectedEntries = sorted.filter(e => selected.has(e.name));
  const allSelected = sorted.length > 0 && sorted.every(e => selected.has(e.name));
  const someSelected = sorted.some(e => selected.has(e.name)) && !allSelected;

  return (
    <div className="flex flex-col h-full" onClick={() => setMenuOpen(null)}>
      {selected.size > 1 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800 text-sm">
          <span className="text-blue-700 dark:text-blue-300">{selected.size} selected</span>
          <button
            onClick={() => onDelete(selectedEntries)}
            className="flex items-center gap-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            <Trash2 size={14} /> Delete all
          </button>
          <button
            onClick={() => onSelectAll(sorted.map(e => e.name), false)}
            className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="grid grid-cols-[auto_1fr_100px_160px_120px] gap-0 border-b border-slate-200 dark:border-slate-700 px-4 py-2">
        <label className="w-5 flex items-center" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected; }}
            onChange={() => onSelectAll(sorted.map(e => e.name), !allSelected)}
            className="w-4 h-4 accent-blue-500 cursor-pointer"
            title={allSelected ? 'Deselect all' : 'Select all'}
          />
        </label>
        <SortHeader label="Name" k="name" />
        <SortHeader label="Size" k="size" />
        <SortHeader label="Modified" k="modified" />
        <div />
      </div>

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 && (
          <div className="text-center text-slate-500 py-16">No files here</div>
        )}
        {sorted.map(entry => (
          <div
            key={entry.name}
            draggable={!!onMoveInto}
            onDragStart={e => {
              e.dataTransfer.setData('text/plain', entry.name);
              e.dataTransfer.effectAllowed = 'move';
              setDraggingName(entry.name);
            }}
            onDragEnd={() => { setDraggingName(null); setDragOverName(null); }}
            onDragOver={entry.type === 'dir' && onMoveInto ? (e) => {
              if (draggingName && draggingName !== entry.name) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverName(entry.name); }
            } : undefined}
            onDragLeave={entry.type === 'dir' ? () => setDragOverName(n => n === entry.name ? null : n) : undefined}
            onDrop={entry.type === 'dir' && onMoveInto ? (e) => {
              e.preventDefault();
              const src = e.dataTransfer.getData('text/plain');
              setDragOverName(null);
              setDraggingName(null);
              if (src && src !== entry.name) onMoveInto(src, entry.name);
            } : undefined}
            onDoubleClick={() => onOpen(entry)}
            className={`group grid grid-cols-[auto_1fr_100px_160px_120px] items-center gap-0 px-4 py-2 cursor-pointer border-b border-slate-200 dark:border-slate-800
              hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors
              ${selected.has(entry.name) ? 'bg-blue-50 dark:bg-blue-900/30' : ''}
              ${dragOverName === entry.name ? 'ring-2 ring-inset ring-blue-500 bg-blue-100 dark:bg-blue-900/40' : ''}
              ${draggingName === entry.name ? 'opacity-50' : ''}
            `}
          >
            {/* Checkbox is the sole selection control; its clicks never bubble to the row */}
            <label
              className="w-5 flex items-center"
              onClick={e => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={selected.has(entry.name)}
                onChange={() => onSelect(entry.name)}
                className="w-4 h-4 accent-blue-500 cursor-pointer"
              />
            </label>
            <div
              className="flex items-center gap-2 min-w-0"
              title={entry.type === 'dir' ? 'Double-click to open' : 'Double-click to preview'}
            >
              {fileIcon(entry)}
              <span dir="auto" className="truncate text-sm text-slate-900 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">{entry.name}</span>
              {entry.shareUrl && (
                <button
                  onClick={e => { e.stopPropagation(); copyToClipboard(entry.shareUrl!); toast('Share link copied', 'success'); }}
                  title="Copy active share link"
                  className="shrink-0 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 p-0.5"
                >
                  <Link2 size={13} />
                </button>
              )}
            </div>
            <span className="text-xs text-slate-500">{entry.type === 'file' ? formatSize(entry.size) : '—'}</span>
            <span className="text-xs text-slate-500">{formatDate(entry.modified)}</span>

            <div className="flex justify-end relative">
              <button
                onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === entry.name ? null : entry.name); }}
                className="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-slate-200"
              >
                <MoreVertical size={16} />
              </button>
              {menuOpen === entry.name && (
                <div
                  onClick={e => e.stopPropagation()}
                  className="absolute right-0 top-8 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-20 w-44 py-1"
                >
                  {entry.type === 'file' && (
                    <button onClick={() => { setMenuOpen(null); onPreview(entry); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 text-slate-300">
                      <Eye size={15} /> Preview
                    </button>
                  )}
                  <button onClick={() => { setMenuOpen(null); onShare(entry); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 text-slate-300">
                    <Share2 size={15} /> {entry.type === 'dir' ? 'Share folder' : 'Share'}
                  </button>
                  <button onClick={() => { setMenuOpen(null); onRename(entry); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 text-slate-300">
                    <Pencil size={15} /> Rename
                  </button>
                  <button onClick={() => { setMenuOpen(null); onMove(entry); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 text-slate-300">
                    <Move size={15} /> Move
                  </button>
                  <div className="my-1 border-t border-slate-700" />
                  <button onClick={() => { setMenuOpen(null); onDelete([entry]); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-700 text-red-400">
                    <Trash2 size={15} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
