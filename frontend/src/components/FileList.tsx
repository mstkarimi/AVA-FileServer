import { useState } from 'react';
import {
  Folder, File, Music, Video, Image, FileText, Trash2,
  Share2, Eye, Pencil, Move, MoreVertical, ChevronUp, ChevronDown, Link2,
} from 'lucide-react';
import { FileEntry } from '../api/client';

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
  onSelect: (name: string, multi: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onPreview: (entry: FileEntry) => void;
  onShare: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onMove: (entry: FileEntry) => void;
  onDelete: (entries: FileEntry[]) => void;
}

export default function FileList({
  entries, selected, onSelect, onOpen, onPreview, onShare, onRename, onMove, onDelete,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

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
        className="flex items-center gap-1 text-slate-400 hover:text-slate-200 text-xs uppercase tracking-wide font-medium"
      >
        {label}
        {sortKey === k ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
      </button>
    );
  }

  const selectedEntries = sorted.filter(e => selected.has(e.name));

  return (
    <div className="flex flex-col h-full" onClick={() => setMenuOpen(null)}>
      {selected.size > 1 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-blue-900/30 border-b border-blue-800 text-sm">
          <span className="text-blue-300">{selected.size} selected</span>
          <button
            onClick={() => onDelete(selectedEntries)}
            className="flex items-center gap-1 text-red-400 hover:text-red-300"
          >
            <Trash2 size={14} /> Delete all
          </button>
        </div>
      )}

      <div className="grid grid-cols-[auto_1fr_100px_160px_120px] gap-0 border-b border-slate-700 px-4 py-2">
        <div className="w-5" />
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
            onDoubleClick={() => onOpen(entry)}
            onClick={e => onSelect(entry.name, e.ctrlKey || e.metaKey)}
            className={`grid grid-cols-[auto_1fr_100px_160px_120px] items-center gap-0 px-4 py-2 cursor-pointer border-b border-slate-800
              hover:bg-slate-700/50 transition-colors
              ${selected.has(entry.name) ? 'bg-blue-900/30' : ''}
            `}
          >
            <input
              type="checkbox"
              checked={selected.has(entry.name)}
              onChange={e => { e.stopPropagation(); onSelect(entry.name, true); }}
              className="w-4 h-4 mr-3 accent-blue-500"
            />
            <div className="flex items-center gap-2 min-w-0">
              {fileIcon(entry)}
              <span dir="auto" className="truncate text-sm text-slate-200">{entry.name}</span>
              {entry.shareUrl && (
                <button
                  onClick={e => { e.stopPropagation(); copyToClipboard(entry.shareUrl!); }}
                  title="Copy existing share link"
                  className="shrink-0 text-blue-400 hover:text-blue-300 p-0.5"
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
