import { useState, useEffect } from 'react';
import { Folder, ChevronRight, Check } from 'lucide-react';
import api from '../api/client';

interface Node {
  name: string;
  path: string;          // relative, no leading slash
}

interface Props {
  selected: string[];                          // normalized folder paths (no slash)
  onChange: (paths: string[]) => void;
}

function normalize(p: string): string {
  return p.replace(/^\/+|\/+$/g, '');
}

async function fetchDirs(rel: string): Promise<Node[]> {
  const res = await api.get('/files', { params: { path: '/' + rel } });
  return (res.data as { name: string; type: string }[])
    .filter(e => e.type === 'dir')
    .map(e => ({
      name: e.name,
      path: rel ? `${rel}/${e.name}` : e.name,
    }));
}

interface NodeRowProps {
  node: Node;
  depth: number;
  /** Normalized set of directly-granted folder paths */
  selectedSet: Set<string>;
  onToggle: (path: string) => void;
}

/**
 * Defined at module scope (NOT inside PermissionPicker) so its component
 * identity is stable across PermissionPicker re-renders. If it were nested,
 * every selection change would create a new component type and React would
 * unmount/remount the whole tree — collapsing all expanded folders and making
 * it impossible to drill into and tick a subfolder. (That was the bug.)
 */
function NodeRow({ node, depth, selectedSet, onToggle }: NodeRowProps) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<Node[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasChildren, setHasChildren] = useState<boolean | null>(null);

  async function expand() {
    if (!loaded) {
      const k = await fetchDirs(node.path);
      setChildren(k);
      setHasChildren(k.length > 0);
      setLoaded(true);
    }
    setOpen(o => !o);
  }

  const p = normalize(node.path);
  const direct = selectedSet.has(p);
  const covered = direct || [...selectedSet].some(s => s !== '' && p.startsWith(s + '/'));

  return (
    <div>
      <div
        style={{ paddingLeft: `${depth * 16 + 6}px` }}
        className={`flex items-center gap-2 py-1 pr-2 rounded text-sm
          ${covered ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
      >
        {/* Clicking the folder name/icon EXPANDS to reveal subfolders */}
        <button
          type="button"
          onClick={expand}
          className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
          title="Open subfolders"
        >
          <ChevronRight
            size={14}
            className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''} ${loaded && hasChildren === false ? 'opacity-25' : ''}`}
          />
          <Folder size={14} className="text-yellow-500 dark:text-yellow-400 shrink-0" />
          <span dir="auto" className="flex-1 text-slate-700 dark:text-slate-200 truncate">{node.name}</span>
        </button>

        {/* Checkbox is the ONLY way to grant access to this exact folder */}
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          aria-pressed={direct}
          className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition
            ${direct ? 'bg-blue-600 border-blue-500' : covered ? 'bg-blue-200 border-blue-400 dark:bg-blue-900/40 dark:border-blue-600/50' : 'border-slate-400 dark:border-slate-500 hover:border-blue-400'}`}
          title={covered && !direct ? 'Already covered by a selected parent folder' : 'Grant access to this folder'}
        >
          {(direct || covered) && <Check size={12} className={direct ? 'text-white' : 'text-blue-700 dark:text-white'} />}
        </button>
      </div>
      {open && children.map(c => (
        <NodeRow key={c.path} node={c} depth={depth + 1} selectedSet={selectedSet} onToggle={onToggle} />
      ))}
      {open && loaded && hasChildren === false && (
        <div style={{ paddingLeft: `${(depth + 1) * 16 + 24}px` }} className="text-xs text-slate-500 py-0.5">
          no subfolders
        </div>
      )}
    </div>
  );
}

export default function PermissionPicker({ selected, onChange }: Props) {
  const [roots, setRoots] = useState<Node[]>([]);
  const selectedSet = new Set(selected.map(normalize));

  useEffect(() => {
    fetchDirs('').then(setRoots).catch(() => setRoots([]));
  }, []);

  function toggle(path: string) {
    const pn = normalize(path);
    const next = new Set(selectedSet);
    if (next.has(pn)) next.delete(pn);
    else next.add(pn);
    onChange([...next]);
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg p-2 max-h-72 overflow-y-auto">
      <p className="text-[11px] text-slate-500 px-1 pb-1.5 mb-1 border-b border-slate-200 dark:border-slate-700/60">
        Click a folder name to open its subfolders · tick the box to grant access.
      </p>
      {roots.length === 0 && (
        <p className="text-xs text-slate-500 p-3 text-center">No folders to grant. Create some first.</p>
      )}
      {roots.map(r => (
        <NodeRow key={r.path} node={r} depth={0} selectedSet={selectedSet} onToggle={toggle} />
      ))}
    </div>
  );
}
