import { useState, useEffect } from 'react';
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
  node, currentPath, onNavigate, depth,
}: {
  node: TreeNode;
  currentPath: string;
  onNavigate: (path: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
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
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className={`flex items-center gap-1.5 py-1 pr-2 rounded cursor-pointer text-sm select-none
          ${isActive ? 'bg-blue-600/30 text-blue-300' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'}
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
        <TreeItem key={child.path} node={child} currentPath={currentPath} onNavigate={onNavigate} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function FileTree({ currentPath, onNavigate }: Props) {
  const [roots, setRoots] = useState<TreeNode[]>([]);

  useEffect(() => {
    loadChildren('/').then(setRoots).catch(() => {});
  }, []);

  return (
    <div className="h-full overflow-y-auto py-2">
      <div
        onClick={() => onNavigate('/')}
        className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer text-sm mb-1 font-medium
          ${currentPath === '/' ? 'bg-blue-600/30 text-blue-300' : 'text-slate-300 hover:bg-slate-700'}
        `}
      >
        <Folder size={16} className="shrink-0" />
        <span>/ (root)</span>
      </div>
      {roots.map(node => (
        <TreeItem key={node.path} node={node} currentPath={currentPath} onNavigate={onNavigate} depth={0} />
      ))}
    </div>
  );
}
