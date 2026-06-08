import { useState, useEffect } from 'react';
import type { MouseEvent } from 'react';
import { Folder, FolderOpen, ChevronRight } from 'lucide-react';
import api from '../api/client';

interface TreeNode {
  name: string;
  path: string;
  children?: TreeNode[];
  loaded: boolean;
}

interface Props {
  currentPath: string;
  onNavigate: (path: string) => void;
  onFolderContextMenu?: (e: MouseEvent, path: string, name: string) => void;
  onDropMove?: (sourceName: string, destPath: string) => void;   // item 15
}

async function loadChildren(path: string): Promise<TreeNode[]> {
  const res = await api.get('/files', { params: { path } });
  return (res.data as { name: string; type: string }[])
    .filter(e => e.type === 'dir')
    .map(e => ({
      name: e.name,
      path: path === '/' ? `/${e.name}` : `${path}/${e.name}`,
      loaded: false,
    }));
}

function TreeItem({
  node, currentPath, onNavigate, depth, onFolderContextMenu, onDropMove,
}: {
  node: TreeNode;
  currentPath: string;
  onNavigate: (path: string) => void;
  depth: number;
  onFolderContextMenu?: (e: MouseEvent, path: string, name: string) => void;
  onDropMove?: (sourceName: string, destPath: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const [children, setChildren] = useState<TreeNode[]>([]);

  async function toggle() {
    if (!expanded && !node.loaded) {
      const kids = await loadChildren(node.path);
      setChildren(kids);
      node.loaded = true;
    }
    setExpanded(e => !e);
  }

  const isActive = currentPath === node.path;

  return (
    <div>
      <div
        onClick={async () => { await toggle(); onNavigate(node.path); }}
        onContextMenu={onFolderContextMenu ? (e) => onFolderContextMenu(e, node.path, node.name) : undefined}
        onDragOver={onDropMove ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropHover(true); } : undefined}
        onDragLeave={onDropMove ? () => setDropHover(false) : undefined}
        onDrop={onDropMove ? (e) => {
          e.preventDefault();
          setDropHover(false);
          const src = e.dataTransfer.getData('text/plain');
          if (src) onDropMove(src, node.path);
        } : undefined}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className={`flex items-center gap-1.5 py-1 pr-2 rounded cursor-pointer text-sm select-none
          ${dropHover ? 'ring-2 ring-inset ring-blue-500 bg-blue-100 dark:bg-blue-900/40' : ''}
          ${isActive
            ? 'bg-blue-100 text-blue-800 font-medium dark:bg-blue-600/30 dark:text-blue-200'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200'}
        `}
      >
        <ChevronRight
          size={14}
          className={`shrink-0 transition-transform ${expanded ? 'rotate-90' : ''} ${children.length === 0 && node.loaded ? 'opacity-0' : ''}`}
        />
        {expanded ? <FolderOpen size={15} className="shrink-0" /> : <Folder size={15} className="shrink-0" />}
        <span dir="auto" className="truncate">{node.name}</span>
      </div>
      {expanded && children.map(child => (
        <TreeItem key={child.path} node={child} currentPath={currentPath} onNavigate={onNavigate} depth={depth + 1} onFolderContextMenu={onFolderContextMenu} onDropMove={onDropMove} />
      ))}
    </div>
  );
}

export default function FileTree({ currentPath, onNavigate, onFolderContextMenu, onDropMove }: Props) {
  const [roots, setRoots] = useState<TreeNode[]>([]);

  useEffect(() => {
    loadChildren('/').then(setRoots).catch(() => {});
  }, []);

  return (
    <div className="h-full overflow-y-auto py-2">
      <div
        onClick={() => onNavigate('/')}
        className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer text-sm mb-1 font-medium
          ${currentPath === '/'
            ? 'bg-blue-100 text-blue-800 dark:bg-blue-600/30 dark:text-blue-200'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700'}
        `}
      >
        <Folder size={16} className="shrink-0" />
        <span>/ (root)</span>
      </div>
      {roots.map(node => (
        <TreeItem key={node.path} node={node} currentPath={currentPath} onNavigate={onNavigate} depth={0} onFolderContextMenu={onFolderContextMenu} onDropMove={onDropMove} />
      ))}
    </div>
  );
}
