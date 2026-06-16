import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  LogOut, Upload, FolderPlus, RefreshCw, PanelLeft, Share2, Users, Link2,
  FolderOpen, Pencil, Trash2, Link as LinkIcon, ExternalLink,
} from 'lucide-react';
import api, { FileEntry, SearchResult } from '../api/client';
import FileTree from '../components/FileTree';
import FileList from '../components/FileList';
import UploadZone from '../components/UploadZone';
import PreviewModal from '../components/PreviewModal';
import ShareDialog from '../components/ShareDialog';
import ShareManager from '../components/ShareManager';
import UsersTab from '../components/UsersTab';
import TrashTab from '../components/TrashTab';
import BulkShareModal from '../components/BulkShareModal';
import MoveDialog from '../components/MoveDialog';
import SearchBar from '../components/SearchBar';
import Brand from '../components/Brand';
import ThemeToggle from '../components/ThemeToggle';
import { ToastContainer, toast } from '../components/Toast';

type Modal =
  | { type: 'upload' }
  | { type: 'preview'; entry: FileEntry }
  | { type: 'share'; entry: FileEntry }
  | { type: 'rename'; entry: FileEntry }
  | { type: 'move'; entry: FileEntry }
  | { type: 'mkdir' };

export default function Admin() {
  const navigate = useNavigate();
  // ── URL-driven folder path + tab (so browser Back works everywhere) ───────
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPath = searchParams.get('path') || '/';
  const tab = (searchParams.get('tab') as 'files' | 'shares' | 'users' | 'trash') || 'files';

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<Modal | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bulkShareOpen, setBulkShareOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showInput, setShowInput] = useState<'rename' | 'mkdir' | 'move' | null>(null);
  const [pendingEntry, setPendingEntry] = useState<FileEntry | null>(null);
  // Item 13: custom right-click context menu on sidebar folders
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string; name: string } | null>(null);

  const load = useCallback(async (path = currentPath) => {
    try {
      const res = await api.get('/files', { params: { path } });
      setEntries(res.data);
      setSelected(new Set());
    } catch {
      toast('Failed to load directory', 'error');
    }
  }, [currentPath]);

  // Reload whenever URL path changes (Back/Forward included)
  useEffect(() => { load(); }, [load]);

  // Push a new browser-history entry so Back walks back through folders
  function navigate_to(path: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('path', path);
      next.set('tab', 'files');
      return next;
    }, { replace: false });
  }

  // Switch tab via URL so the browser Back button steps through tab changes too
  function setTab(t: 'files' | 'shares' | 'users' | 'trash') {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', t);
      return next;
    }, { replace: false });
  }

  function openEntry(entry: FileEntry) {
    if (entry.type === 'dir') {
      const newPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
      navigate_to(newPath);
    } else {
      // Item 4: open file → preview
      setModal({ type: 'preview', entry });
    }
  }

  // Item 5: forgiving multi-select. Each toggle adds/removes one item independently.
  function toggleSelect(name: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAll(names: string[], select: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      if (select) names.forEach(n => next.add(n));
      else names.forEach(n => next.delete(n));
      return next;
    });
  }

  // Absolute URL for opening a folder/file in a new browser tab (item 1).
  function hrefFor(entry: FileEntry): string {
    const full = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    if (entry.type === 'dir') {
      const sp = new URLSearchParams({ path: full, tab: 'files' });
      return `/admin?${sp.toString()}`;
    }
    const token = localStorage.getItem('token') || '';
    return `/api/preview?path=${encodeURIComponent(full)}&t=${encodeURIComponent(token)}`;
  }

  // ── Move (items 2 + 15): single drag, multi-select drag, and bulk dialog ──
  // When the dragged item is part of a multi-selection, move the whole selection.
  function resolveSources(draggedName: string): string[] {
    return selected.has(draggedName) && selected.size > 1 ? [...selected] : [draggedName];
  }

  async function moveManyInto(sources: string[], destAbs: string, destLabel: string) {
    let ok = 0;
    let skipped = 0;
    for (const name of sources) {
      const from = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
      const to = destAbs === '/' ? `/${name}` : `${destAbs}/${name}`;
      if (from === to) { skipped++; continue; }            // already there
      if (to.startsWith(from + '/')) { skipped++; continue; } // into itself/descendant
      try {
        await api.post('/files/move', { from, to });
        ok++;
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'target may already exist';
        toast(`Couldn't move "${name}": ${msg}`, 'error');
      }
    }
    if (ok) toast(`Moved ${ok} item${ok === 1 ? '' : 's'} into ${destLabel}`, 'success');
    else if (skipped && !ok) toast('Nothing to move there', 'info');
    setSelected(new Set());
    load();
  }

  // Drop a listing item onto a folder row in the same listing
  function moveInto(sourceName: string, destFolderName: string) {
    const destAbs = currentPath === '/' ? `/${destFolderName}` : `${currentPath}/${destFolderName}`;
    moveManyInto(resolveSources(sourceName), destAbs, destFolderName);
  }

  // Drop a listing item onto any folder in the sidebar tree (destPath has leading slash)
  function moveToPath(sourceName: string, destPath: string) {
    moveManyInto(resolveSources(sourceName), destPath, destPath.split('/').pop() || 'root');
  }

  // Bulk "Move…" dialog confirm — move all selected into the chosen folder.
  function moveSelectedTo(destPath: string) {
    setMoveOpen(false);
    moveManyInto([...selected], destPath, destPath.split('/').pop() || 'root');
  }

  // ── Context-menu actions (operate on an explicit folder path, leading slash) ──
  function openContextMenu(e: { preventDefault: () => void; clientX: number; clientY: number }, path: string, name: string) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, path, name });
  }

  async function ctxShareFolder(path: string) {
    try {
      const res = await api.post('/shares', { filePath: path, type: 'folder' });
      await navigator.clipboard.writeText(res.data.url).catch(() => {});
      toast('Folder share link created & copied', 'success');
      load();
    } catch {
      toast('Failed to create share link', 'error');
    }
  }

  async function ctxRename(path: string, name: string) {
    const nn = window.prompt('Rename folder to:', name);
    if (!nn || !nn.trim() || nn.trim() === name) return;
    try {
      await api.post('/files/rename', { path, newName: nn.trim() });
      toast('Renamed', 'success');
      load();
    } catch {
      toast('Rename failed', 'error');
    }
  }

  async function ctxNewSubfolder(path: string) {
    const nn = window.prompt('New folder name:');
    if (!nn || !nn.trim()) return;
    try {
      await api.post('/files/mkdir', { path, name: nn.trim() });
      toast('Folder created', 'success');
      if (currentPath === path) load();
    } catch {
      toast('Create folder failed', 'error');
    }
  }

  async function ctxDeleteFolder(path: string, name: string) {
    if (!confirm(`Move this folder and all its contents to Trash?\n\n• ${name}\n\n(Recoverable from the Trash tab.)`)) return;
    try {
      await api.delete('/files', { params: { path, recursive: true } });
      toast('Moved to Trash', 'success');
      if (currentPath === path || currentPath.startsWith(path + '/')) navigate_to('/');
      else load();
    } catch {
      toast('Delete failed', 'error');
    }
  }

  async function handleDelete(entriesToDelete: FileEntry[]) {
    if (entriesToDelete.length === 0) return;
    const names = entriesToDelete.map(e => `• ${e.name}`).join('\n');
    const prompt = entriesToDelete.length === 1
      ? `Move this ${entriesToDelete[0].type === 'dir' ? 'folder' : 'file'} to Trash?\n\n${names}\n\n(Recoverable from the Trash tab.)`
      : `Move these ${entriesToDelete.length} items to Trash?\n\n${names}\n\n(Recoverable from the Trash tab.)`;
    if (!confirm(prompt)) return;
    for (const e of entriesToDelete) {
      const p = currentPath === '/' ? `/${e.name}` : `${currentPath}/${e.name}`;
      try {
        await api.delete('/files', { params: { path: p, recursive: e.type === 'dir' } });
      } catch (err: unknown) {
        toast(`Failed to delete ${e.name}`, 'error');
      }
    }
    toast('Moved to Trash', 'success');
    load();
  }

  async function handleRenameSubmit() {
    if (!pendingEntry || !inputValue.trim()) return;
    const p = currentPath === '/' ? `/${pendingEntry.name}` : `${currentPath}/${pendingEntry.name}`;
    try {
      await api.post('/files/rename', { path: p, newName: inputValue.trim() });
      toast('Renamed', 'success');
      load();
    } catch {
      toast('Rename failed', 'error');
    }
    setShowInput(null);
    setInputValue('');
    setPendingEntry(null);
  }

  async function handleMkdirSubmit() {
    if (!inputValue.trim()) return;
    try {
      await api.post('/files/mkdir', { path: currentPath, name: inputValue.trim() });
      toast('Folder created', 'success');
      load();
    } catch {
      toast('Create folder failed', 'error');
    }
    setShowInput(null);
    setInputValue('');
  }

  async function handleMoveSubmit() {
    if (!pendingEntry || !inputValue.trim()) return;
    const from = currentPath === '/' ? `/${pendingEntry.name}` : `${currentPath}/${pendingEntry.name}`;
    try {
      await api.post('/files/move', { from, to: inputValue.trim() });
      toast('Moved', 'success');
      load();
    } catch {
      toast('Move failed', 'error');
    }
    setShowInput(null);
    setInputValue('');
    setPendingEntry(null);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/login', { state: { fromLogout: true } });
  }

  function selectedPaths(): string[] {
    return [...selected].map(name =>
      currentPath === '/' ? `/${name}` : `${currentPath}/${name}`
    );
  }
  function selectedHasFolders(): boolean {
    return [...selected].some(name => entries.find(e => e.name === name)?.type === 'dir');
  }

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <button onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle sidebar" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-1 rounded">
          <PanelLeft size={20} />
        </button>

        <Brand variant="row" size={32} />

        <div className="hidden lg:flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 min-w-0 ml-2">
          <button onClick={() => navigate_to('/')} className="hover:text-slate-900 dark:hover:text-white shrink-0">/</button>
          {breadcrumbs.map((seg, i) => {
            const path = '/' + breadcrumbs.slice(0, i + 1).join('/');
            return (
              <span key={path} className="flex items-center gap-1">
                <span>/</span>
                <button onClick={() => navigate_to(path)} className="hover:text-slate-900 dark:hover:text-white truncate max-w-[120px]">{seg}</button>
              </span>
            );
          })}
        </div>

        <div className="flex-1" />

        <div className="hidden md:block w-72">
          <SearchBar
            onSelect={(r: SearchResult) => {
              if (r.type === 'dir') {
                navigate_to(r.path);
              } else {
                const parent = r.path.substring(0, r.path.lastIndexOf('/')) || '/';
                navigate_to(parent);
                setModal({ type: 'preview', entry: { name: r.name, type: 'file', size: r.size, modified: r.modified } });
              }
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          {selected.size > 0 && tab === 'files' && (
            <button
              onClick={() => setBulkShareOpen(true)}
              className="flex items-center gap-1.5 text-sm bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg transition-colors"
              title={`Generate share links for ${selected.size} item(s)`}
            >
              <Link2 size={15} /> Bulk Share ({selected.size})
            </button>
          )}
          {tab === 'files' && (
            <>
              <button
                onClick={() => { setShowInput('mkdir'); setInputValue(''); }}
                className="hidden sm:flex items-center gap-1.5 text-sm bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                <FolderPlus size={15} /> New Folder
              </button>
              <button
                onClick={() => setModal({ type: 'upload' })}
                className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                <Upload size={15} /> Upload
              </button>
            </>
          )}
          <ThemeToggle />
          <button onClick={() => load()} aria-label="Refresh" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
            <RefreshCw size={16} />
          </button>
          <button onClick={logout} aria-label="Log out" title="Log out" className="text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex gap-0 px-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <button
          onClick={() => setTab('files')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'files' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
        >
          Files
        </button>
        <button
          onClick={() => setTab('shares')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${tab === 'shares' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
        >
          <Share2 size={14} /> Manage Shares
        </button>
        <button
          onClick={() => setTab('users')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${tab === 'users' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
        >
          <Users size={14} /> Users
        </button>
        <button
          onClick={() => setTab('trash')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${tab === 'trash' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
        >
          <Trash2 size={14} /> Trash
        </button>
      </div>

      {/* Item 4: dedicated breadcrumb bar on small/medium screens, where the inline
          header breadcrumb is hidden (it competes with the search box). */}
      {tab === 'files' && (
        <nav aria-label="Breadcrumb" className="lg:hidden flex items-center gap-1 px-4 py-2 bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-sm shrink-0 overflow-x-auto whitespace-nowrap">
          <button onClick={() => navigate_to('/')} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white shrink-0">/ root</button>
          {breadcrumbs.map((seg, i) => {
            const path = '/' + breadcrumbs.slice(0, i + 1).join('/');
            return (
              <span key={path} className="flex items-center gap-1 shrink-0">
                <span className="text-slate-400 dark:text-slate-600">/</span>
                <button onClick={() => navigate_to(path)} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white truncate max-w-[160px]" dir="auto">
                  {seg}
                </button>
              </span>
            );
          })}
        </nav>
      )}

      {tab === 'shares' ? (
        <div className="flex-1 overflow-y-auto">
          <ShareManager />
        </div>
      ) : tab === 'users' ? (
        <div className="flex-1 overflow-y-auto">
          <UsersTab />
        </div>
      ) : tab === 'trash' ? (
        <div className="flex-1 overflow-y-auto">
          <TrashTab />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          {sidebarOpen && (
            <aside className="w-56 shrink-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
              <div className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-500 font-medium border-b border-slate-200 dark:border-slate-700">
                Folders
              </div>
              <FileTree currentPath={currentPath} onNavigate={navigate_to} onFolderContextMenu={openContextMenu} onDropMove={moveToPath} />
            </aside>
          )}

          {/* Main area */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {/* Inline input for rename/mkdir/move */}
            {showInput && (
              <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <label className="text-sm text-slate-600 dark:text-slate-400 shrink-0">
                  {showInput === 'rename' && `Rename "${pendingEntry?.name}" to:`}
                  {showInput === 'mkdir' && 'New folder name:'}
                  {showInput === 'move' && `Move "${pendingEntry?.name}" to path:`}
                </label>
                <input
                  autoFocus
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (showInput === 'rename') handleRenameSubmit();
                      else if (showInput === 'mkdir') handleMkdirSubmit();
                      else if (showInput === 'move') handleMoveSubmit();
                    }
                    if (e.key === 'Escape') { setShowInput(null); setInputValue(''); }
                  }}
                  className="flex-1 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  placeholder={showInput === 'move' ? '/path/to/destination' : ''}
                />
                <button
                  onClick={() => {
                    if (showInput === 'rename') handleRenameSubmit();
                    else if (showInput === 'mkdir') handleMkdirSubmit();
                    else if (showInput === 'move') handleMoveSubmit();
                  }}
                  className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg"
                >
                  OK
                </button>
                <button onClick={() => { setShowInput(null); setInputValue(''); }} className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-2">
                  ✕
                </button>
              </div>
            )}

            <FileList
              entries={entries}
              selected={selected}
              onSelect={toggleSelect}
              onSelectAll={selectAll}
              onMoveInto={moveInto}
              onMoveSelected={() => setMoveOpen(true)}
              hrefFor={hrefFor}
              onOpen={openEntry}
              onPreview={entry => setModal({ type: 'preview', entry })}
              onShare={entry => setModal({ type: 'share', entry })}
              onRename={entry => { setPendingEntry(entry); setInputValue(entry.name); setShowInput('rename'); }}
              onMove={entry => {
                const from = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
                setPendingEntry(entry);
                setInputValue(from);
                setShowInput('move');
              }}
              onDelete={handleDelete}
            />
          </main>
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'upload' && (
        <UploadZone
          currentPath={currentPath}
          onDone={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'preview' && (
        <PreviewModal
          filePath={currentPath === '/' ? `/${modal.entry.name}` : `${currentPath}/${modal.entry.name}`}
          fileName={modal.entry.name}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'share' && (
        <ShareDialog
          filePath={currentPath === '/' ? `/${modal.entry.name}` : `${currentPath}/${modal.entry.name}`}
          fileName={modal.entry.name}
          isFolder={modal.entry.type === 'dir'}
          onClose={() => setModal(null)}
        />
      )}

      {bulkShareOpen && (
        <BulkShareModal
          paths={selectedPaths()}
          hasFolders={selectedHasFolders()}
          onClose={() => setBulkShareOpen(false)}
        />
      )}

      {moveOpen && (
        <MoveDialog
          count={selected.size}
          currentPath={currentPath}
          onClose={() => setMoveOpen(false)}
          onConfirm={moveSelectedTo}
        />
      )}

      {/* Item 13: custom context menu for sidebar folders */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }} />
          <div
            className="fixed z-50 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl py-1 text-sm"
            style={{ left: Math.min(ctxMenu.x, window.innerWidth - 220), top: Math.min(ctxMenu.y, window.innerHeight - 240) }}
          >
            <div dir="auto" className="px-3 py-1.5 text-xs text-slate-500 truncate border-b border-slate-200 dark:border-slate-700 mb-1">
              {ctxMenu.name}
            </div>
            <button onClick={() => { navigate_to(ctxMenu.path); setCtxMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200">
              <FolderOpen size={15} /> Open
            </button>
            <button onClick={() => { const sp = new URLSearchParams({ path: ctxMenu.path, tab: 'files' }); window.open(`/admin?${sp.toString()}`, '_blank', 'noopener'); setCtxMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200">
              <ExternalLink size={15} /> Open in new tab
            </button>
            <button onClick={() => { navigate_to(ctxMenu.path); setModal({ type: 'upload' }); setCtxMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200">
              <Upload size={15} /> Upload here
            </button>
            <button onClick={() => { ctxNewSubfolder(ctxMenu.path); setCtxMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200">
              <FolderPlus size={15} /> New subfolder
            </button>
            <button onClick={() => { ctxShareFolder(ctxMenu.path); setCtxMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200">
              <LinkIcon size={15} /> Share folder
            </button>
            <button onClick={() => { ctxRename(ctxMenu.path, ctxMenu.name); setCtxMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200">
              <Pencil size={15} /> Rename
            </button>
            <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
            <button onClick={() => { ctxDeleteFolder(ctxMenu.path, ctxMenu.name); setCtxMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 text-red-600 dark:text-red-400">
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </>
      )}

      <ToastContainer />
    </div>
  );
}
