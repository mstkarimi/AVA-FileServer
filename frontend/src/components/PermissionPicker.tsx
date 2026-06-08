import { useState, useEffect } from 'react';
import { Folder, ChevronRight, Check } from 'lucide-react';
import api from '../api/client';

interface Node {
  name: string;
  path: string;          // relative, no leading slash
  children?: Node[];
  expanded?: boolean;
  loaded?: boolean;
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

export default function PermissionPicker({ selected, onChange }: Props) {
  const [roots, setRoots] = useState<Node[]>([]);
  const sel = new Set(selected.map(normalize));

  useEffect(() => {
    fetchDirs('').then(setRoots).catch(() => setRoots([]));
  }, []);

  function toggleSelect(path: string) {
    const p = normalize(path);
    const next = new Set(sel);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onChange([...next]);
  }

  function isCovered(path: string): boolean {
    const p = normalize(path);
    if (sel.has(p)) return true;
    // covered by an ancestor
    return [...sel].some(s => s !== '' && p.startsWith(s + '/'));
  }

  function isDirectlySelected(path: string): boolean {
    return sel.has(normalize(path));
  }

  function NodeRow({ node, depth }: { node: Node; depth: number }) {
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

    const direct = isDirectlySelected(node.path);
    const covered = isCovered(node.path);

    return (
      <div>
        <div
          style={{ paddingLeft: `${depth * 16 + 6}px` }}
          className={`flex items-center gap-2 py-1 pr-2 rounded text-sm
            ${covered ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
        >
          {/* Clicking the folder name/icon EXPANDS to reveal subfolders (item 10) */}
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
            onClick={() => toggleSelect(node.path)}
            className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition
              ${direct ? 'bg-blue-600 border-blue-500' : covered ? 'bg-blue-200 border-blue-400 dark:bg-blue-900/40 dark:border-blue-600/50' : 'border-slate-400 dark:border-slate-500 hover:border-blue-400'}`}
            title={covered && !direct ? 'Already covered by a selected parent folder' : 'Grant access to this folder'}
          >
            {(direct || covered) && <Check size={12} className={direct ? 'text-white' : 'text-blue-700 dark:text-white'} />}
          </button>
        </div>
        {open && children.map(c => <NodeRow key={c.path} node={c} depth={depth + 1} />)}
        {open && loaded && hasChildren === false && (
          <div style={{ paddingLeft: `${(depth + 1) * 16 + 24}px` }} className="text-xs text-slate-500 py-0.5">
            no subfolders
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg p-2 max-h-72 overflow-y-auto">
      <p className="text-[11px] text-slate-500 px-1 pb-1.5 mb-1 border-b border-slate-200 dark:border-slate-700/60">
        Click a folder name to open its subfolders · tick the box to grant access.
      </p>
      {roots.length === 0 && (
        <p className="text-xs text-slate-500 p-3 text-center">No folders to grant. Create some first.</p>
      )}
      {roots.map(r => <NodeRow key={r.path} node={r} depth={0} />)}
    </div>
  );
}
