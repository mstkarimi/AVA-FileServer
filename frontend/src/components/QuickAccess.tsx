import { useEffect, useState, DragEvent } from 'react';
import { Star, Clock, Folder, X } from 'lucide-react';
import {
  QuickItem, getPins, getRecents, unpin, clearRecents, onQuickAccessChange, togglePin,
} from '../lib/quickAccess';

interface Props {
  currentPath: string;
  onNavigate: (path: string) => void;
  /** When present, dropping a dragged item onto a pin moves it there. */
  onDropMove?: (sourceName: string, destPath: string) => void;
}

/**
 * The Quick Access block that sits ABOVE the folder tree — pinned folders and
 * recently-visited folders, like the section of the same name in Windows
 * Explorer. It is intentionally separate from FileTree (which stays untouched):
 * this is a flat shortcut list, the tree is the hierarchy.
 */
export default function QuickAccess({ currentPath, onNavigate, onDropMove }: Props) {
  const [pins, setPins] = useState<QuickItem[]>(getPins);
  const [recents, setRecents] = useState<QuickItem[]>(getRecents);
  const [dropPath, setDropPath] = useState<string | null>(null);

  useEffect(() => onQuickAccessChange(() => {
    setPins(getPins());
    setRecents(getRecents());
  }), []);

  if (pins.length === 0 && recents.length === 0) return null;

  function row(item: QuickItem, kind: 'pin' | 'recent') {
    const active = currentPath === item.path;
    const droppable = !!onDropMove;
    return (
      <div
        key={kind + item.path}
        onClick={() => onNavigate(item.path)}
        title={item.path}
        onDragOver={droppable ? (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropPath(item.path); } : undefined}
        onDragLeave={droppable ? () => setDropPath(p => (p === item.path ? null : p)) : undefined}
        onDrop={droppable ? (e: DragEvent) => {
          e.preventDefault();
          setDropPath(null);
          const src = e.dataTransfer.getData('text/plain');
          if (src) onDropMove!(src, item.path);
        } : undefined}
        className={`group/qa flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-lg cursor-pointer text-sm select-none
          ${dropPath === item.path ? 'ring-2 ring-inset ring-blue-500 bg-blue-100 dark:bg-blue-900/40' : ''}
          ${active
            ? 'bg-blue-100 text-blue-800 font-medium dark:bg-blue-600/30 dark:text-blue-200'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200'}`}
      >
        {kind === 'pin'
          ? <Star size={14} className="shrink-0 text-amber-500 dark:text-amber-400 fill-current" />
          : <Folder size={14} className="shrink-0 text-slate-400" />}
        <span dir="auto" className="truncate flex-1">{item.name}</span>
        <button
          onClick={e => { e.stopPropagation(); kind === 'pin' ? unpin(item.path) : togglePin(item.path, item.name); }}
          title={kind === 'pin' ? 'Unpin' : 'Pin'}
          aria-label={kind === 'pin' ? `Unpin ${item.name}` : `Pin ${item.name}`}
          className="shrink-0 p-1 rounded opacity-0 group-hover/qa:opacity-100 focus:opacity-100 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          {kind === 'pin' ? <X size={13} /> : <Star size={13} />}
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-200 dark:border-slate-700 py-1.5">
      {pins.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 px-3 pt-1 pb-1 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 font-medium">
            <Star size={11} /> Pinned
          </div>
          <div className="px-1.5">{pins.map(p => row(p, 'pin'))}</div>
        </>
      )}
      {recents.length > 0 && (
        <>
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 font-medium">
              <Clock size={11} /> Recent
            </span>
            <button
              onClick={() => clearRecents()}
              className="text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              Clear
            </button>
          </div>
          <div className="px-1.5">{recents.map(r => row(r, 'recent'))}</div>
        </>
      )}
    </div>
  );
}
