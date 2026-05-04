import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogOut, Upload, FolderPlus, RefreshCw, PanelLeft, Share2, Users, Link2,
} from 'lucide-react';
import api, { FileEntry, SearchResult } from '../api/client';
import FileTree from '../components/FileTree';
import FileList from '../components/FileList';
import UploadZone from '../components/UploadZone';
import PreviewModal from '../components/PreviewModal';
import ShareDialog from '../components/ShareDialog';
import ShareManager from '../components/ShareManager';
import UsersTab from '../components/UsersTab';
import BulkShareModal from '../components/BulkShareModal';
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
  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<Modal | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tab, setTab] = useState<'files' | 'shares' | 'users'>('files');
  const [bulkShareOpen, setBulkShareOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showInput, setShowInput] = useState<'rename' | 'mkdir' | 'move' | null>(null);
  const [pendingEntry, setPendingEntry] = useState<FileEntry | null>(null);

  const load = useCallback(async (path = currentPath) => {
    try {
      const res = await api.get('/files', { params: { path } });
      setEntries(res.data);
      setSelected(new Set());
    } catch {
      toast('Failed to load directory', 'error');
    }
  }, [currentPath]);

  useEffect(() => { load(); }, [load]);

  function navigate_to(path: string) {
    setCurrentPath(path);
    load(path);
  }

  function openEntry(entry: FileEntry) {
    if (entry.type === 'dir') {
      const newPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
      navigate_to(newPath);
    }
  }

  function toggleSelect(name: string, multi: boolean) {
    setSelected(prev => {
      const next = multi ? new Set(prev) : new Set<string>();
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleDelete(entriesToDelete: FileEntry[]) {
    if (!confirm(`Delete ${entriesToDelete.length} item(s)?`)) return;
    for (const e of entriesToDelete) {
      const p = currentPath === '/' ? `/${e.name}` : `${currentPath}/${e.name}`;
      try {
        await api.delete('/files', { params: { path: p, recursive: e.type === 'dir' } });
      } catch (err: unknown) {
        toast(`Failed to delete ${e.name}`, 'error');
      }
    }
    toast('Deleted', 'success');
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
    navigate('/login');
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
        <button onClick={() => setSidebarOpen(o => !o)} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-1 rounded">
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
                setCurrentPath(parent);
                load(parent);
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
          <button
            onClick={() => { setShowInput('mkdir'); setInputValue(''); }}
            className="flex items-center gap-1.5 text-sm bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            <FolderPlus size={15} /> New Folder
          </button>
          <button
            onClick={() => setModal({ type: 'upload' })}
            className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <Upload size={15} /> Upload
          </button>
          <ThemeToggle />
          <button onClick={() => load()} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
            <RefreshCw size={16} />
          </button>
          <button onClick={logout} className="text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
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
      </div>

      {tab === 'shares' ? (
        <div className="flex-1 overflow-y-auto">
          <ShareManager />
        </div>
      ) : tab === 'users' ? (
        <div className="flex-1 overflow-y-auto">
          <UsersTab />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          {sidebarOpen && (
            <aside className="w-56 shrink-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
              <div className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-500 font-medium border-b border-slate-200 dark:border-slate-700">
                Folders
              </div>
              <FileTree currentPath={currentPath} onNavigate={navigate_to} />
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

      <ToastContainer />
    </div>
  );
}
