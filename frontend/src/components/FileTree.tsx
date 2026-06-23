import { useState, useEffect, useCallback, useRef } from 'react';
import type { MouseEvent, DragEvent } from 'react';
import { Folder, FolderOpen, ChevronRight } from 'lucide-react';
import api from '../api/client';

interface TreeNode {
  name: string;
  path: string;
}

interface Props {
  currentPath: string;
  onNavigate: (path: string) => void;
  onFolderContextMenu?: (e: MouseEvent, path: string, name: string) => void;
  onDropMove?: (sourceName: string, destPath: string) => void;
}

async function fetchChildren(path: string): Promise<TreeNode[]> {
  const res = await api.get('/files', { params: { path } });
  return (res.data as { name: string; type: string }[])
    .filter(e => e.type === 'dir')
    .map(e => ({ name: e.name, path: path === '/' ? `/${e.name}` : `${path}/${e.name}` }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

// '/a/b/c' -> ['/a', '/a/b', '/a/b/c']
function ancestorPaths(p: string): string[] {
  if (!p || p === '/') return [];
  const out: string[] = [];
  let cur = '';
  for (const seg of p.split('/').filter(Boolean)) { cur += '/' + seg; out.push(cur); }
  return out;
}

interface ItemProps {
  node: TreeNode;
  depth: number;
  currentPath: string;
  expanded: Set<string>;
  cache: Record<string, TreeNode[]>;
  loading: Set<string>;
  onToggle: (path: string) => void;
  onReveal: (path: string) => void;
  onNavigate: (path: string) => void;
  onFolderContextMenu?: (e: MouseEvent, path: string, name: string) => void;
  onDropMove?: (sourceName: string, destPath: string) => void;
}

function TreeItem(props: ItemProps) {
  const {
    node, depth, currentPath, expanded, cache, loading,
    onToggle, onReveal, onNavigate, onFolderContextMenu, onDropMove,
  } = props;

  const [dropHover, setDropHover] = useState(false);
  const springTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOpen = expanded.has(node.path);
  const isActive = currentPath === node.path;
  const kids = cache[node.path];
  const isLoading = loading.has(node.path);
  // Show the chevron when the node hasn't been loaded yet (unknown) or has kids.
  const showChevron = kids === undefined || kids.length > 0;

  function clearSpring() {
    if (springTimer.current) { clearTimeout(springTimer.current); springTimer.current = null; }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dropHover) setDropHover(true);
    // Spring-loaded: hovering a collapsed folder during a drag opens it after a
    // short pause, so deep folders become reachable drop targets without first
    // clicking around.
    if (!isOpen && !springTimer.current) {
      springTimer.current = setTimeout(() => { onReveal(node.path); springTimer.current = null; }, 600);
    }
  }
  function handleDragLeave() { setDropHover(false); clearSpring(); }
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDropHover(false);
    clearSpring();
    const src = e.dataTransfer.getData('text/plain');
    if (src && onDropMove) onDropMove(src, node.path);
  }

  return (
    <div>
      <div
        onContextMenu={onFolderContextMenu ? (e) => onFolderContextMenu(e, node.path, node.name) : undefined}
        onDragOver={onDropMove ? handleDragOver : undefined}
        onDragLeave={onDropMove ? handleDragLeave : undefined}
        onDrop={onDropMove ? handleDrop : undefined}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        className={`flex items-center gap-1 py-1 pr-2 rounded text-sm select-none
          ${dropHover ? 'ring-2 ring-inset ring-blue-500 bg-blue-100 dark:bg-blue-900/40' : ''}
          ${isActive
            ? 'bg-blue-100 text-blue-800 font-medium dark:bg-blue-600/30 dark:text-blue-200'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200'}
        `}
      >
        {/* Chevron toggles expand/collapse only — independent of navigation. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(node.path); }}
          className={`shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 ${showChevron ? '' : 'invisible'}`}
          aria-label={isOpen ? 'Collapse folder' : 'Expand folder'}
          tabIndex={-1}
        >
          <ChevronRight size={14} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        </button>
        {/* Name navigates (and reveals this folder), without collapsing others. */}
        <button
          type="button"
          onClick={() => { onNavigate(node.path); onReveal(node.path); }}
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
          title={node.name}
        >
          {isOpen ? <FolderOpen size={15} className="shrink-0" /> : <Folder size={15} className="shrink-0" />}
          <span dir="auto" className="truncate">{node.name}</span>
        </button>
      </div>

      {isOpen && (
        isLoading && kids === undefined ? (
          <div style={{ paddingLeft: `${depth * 12 + 30}px` }} className="py-1 text-xs text-slate-400">…</div>
        ) : (
          (kids || []).map(child => (
            <TreeItem key={child.path} {...props} node={child} depth={depth + 1} />
          ))
        )
      )}
    </div>
  );
}

export default function FileTree({ currentPath, onNavigate, onFolderContextMenu, onDropMove }: Props) {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  // Central, navigation-independent tree state. Lives here (not per row) so it
  // persists as the user moves between folders — the tree no longer resets, and
  // expanded branches stay put as stable drag-and-drop targets.
  const [cache, setCache] = useState<Record<string, TreeNode[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const [rootDrop, setRootDrop] = useState(false);

  // Mirror of cache for stable callbacks (avoids re-creating ensureLoaded on
  // every load, which would otherwise thrash the auto-reveal effect).
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  const ensureLoaded = useCallback(async (path: string): Promise<void> => {
    if (cacheRef.current[path]) return;
    setLoading(s => { const n = new Set(s); n.add(path); return n; });
    try {
      const kids = await fetchChildren(path);
      setCache(c => (c[path] ? c : { ...c, [path]: kids }));
    } catch { /* leave unloaded; user can retry */ }
    finally {
      setLoading(s => { const n = new Set(s); n.delete(path); return n; });
    }
  }, []);

  const onToggle = useCallback(async (path: string) => {
    if (!expanded.has(path)) await ensureLoaded(path);
    setExpanded(s => {
      const n = new Set(s);
      if (n.has(path)) n.delete(path); else n.add(path);
      return n;
    });
  }, [expanded, ensureLoaded]);

  // Add-only expand (used by name-click and spring-load): never collapses.
  const onReveal = useCallback(async (path: string) => {
    await ensureLoaded(path);
    setExpanded(s => (s.has(path) ? s : new Set(s).add(path)));
  }, [ensureLoaded]);

  useEffect(() => { fetchChildren('/').then(setRoots).catch(() => {}); }, []);

  // Auto-reveal the active folder by expanding its ancestors whenever the path
  // changes (main-list click, breadcrumb, Back/Forward). Add-only: it keeps the
  // tree in sync with where the user is without ever collapsing what they opened.
  useEffect(() => {
    const anc = ancestorPaths(currentPath);
    if (!anc.length) return;
    let cancelled = false;
    (async () => {
      for (const p of anc) { if (cancelled) return; await ensureLoaded(p); }
      if (cancelled) return;
      setExpanded(s => {
        const n = new Set(s);
        anc.forEach(p => n.add(p));
        return n;
      });
    })();
    return () => { cancelled = true; };
  }, [currentPath, ensureLoaded]);

  function rootDragOver(e: DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setRootDrop(true); }
  function rootDropHandler(e: DragEvent) {
    e.preventDefault();
    setRootDrop(false);
    const src = e.dataTransfer.getData('text/plain');
    if (src && onDropMove) onDropMove(src, '/');
  }

  return (
    <div className="h-full overflow-y-auto py-2">
      <div
        onClick={() => onNavigate('/')}
        onDragOver={onDropMove ? rootDragOver : undefined}
        onDragLeave={onDropMove ? () => setRootDrop(false) : undefined}
        onDrop={onDropMove ? rootDropHandler : undefined}
        className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer text-sm mb-1 font-medium
          ${rootDrop ? 'ring-2 ring-inset ring-blue-500 bg-blue-100 dark:bg-blue-900/40' : ''}
          ${currentPath === '/'
            ? 'bg-blue-100 text-blue-800 dark:bg-blue-600/30 dark:text-blue-200'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700'}
        `}
      >
        <Folder size={16} className="shrink-0" />
        <span>/ (root)</span>
      </div>
      {roots.map(node => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          currentPath={currentPath}
          expanded={expanded}
          cache={cache}
          loading={loading}
          onToggle={onToggle}
          onReveal={onReveal}
          onNavigate={onNavigate}
          onFolderContextMenu={onFolderContextMenu}
          onDropMove={onDropMove}
        />
      ))}
    </div>
  );
}
