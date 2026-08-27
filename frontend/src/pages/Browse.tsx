import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogOut, RefreshCw, PanelLeft, Upload } from 'lucide-react';
import api, { FileEntry, SearchResult } from '../api/client';
import FileTree from '../components/FileTree';
import FileList from '../components/FileList';
import PreviewModal from '../components/PreviewModal';
import SearchBar from '../components/SearchBar';
import Brand from '../components/Brand';
import ThemeToggle from '../components/ThemeToggle';
import UploadZone from '../components/UploadZone';
import { ToastContainer, toast } from '../components/Toast';
import { ViewMode, loadViewMode, saveViewMode } from '../lib/viewModes';

export default function Browse() {
  const navigate = useNavigate();
  // ── URL-driven folder path ──────────────────────────────────────────────
  // The current folder lives in the query string (?path=/some/folder) so the
  // native Back button walks back through visited folders instead of jumping
  // to the login page.
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPath = searchParams.get('path') || '/';

  const role = localStorage.getItem('role') as 'viewer' | 'teacher' | null;
  const isTeacher = role === 'teacher';

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState<{ path: string; name: string } | null>(null);
  // Closed by default on narrow screens — see the same note in Admin.tsx.
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= 1024);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode('details'));

  function changeViewMode(m: ViewMode) {
    setViewMode(m);
    saveViewMode(m);
  }

  const load = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await api.get('/files', { params: { path: p } });
      setEntries(res.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        toast('No access to this folder', 'error');
        setEntries([]);
      } else {
        toast('Failed to load folder', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever the URL path changes (including Back/Forward)
  useEffect(() => { load(currentPath); }, [currentPath, load]);

  function navigateTo(p: string) {
    setSearchParams({ path: p }, { replace: false });
  }

  function absOf(name: string): string {
    return currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
  }

  function openEntry(e: FileEntry) {
    if (e.type === 'dir') navigateTo(absOf(e.name));
    else preview(e);
  }

  function preview(e: FileEntry) {
    setPreviewing({ path: absOf(e.name), name: e.name });
  }

  function hrefFor(e: FileEntry): string {
    if (e.type === 'dir') {
      return `/browse?${new URLSearchParams({ path: absOf(e.name) }).toString()}`;
    }
    const token = localStorage.getItem('token') || '';
    return `/api/preview?path=${encodeURIComponent(absOf(e.name))}&t=${encodeURIComponent(token)}`;
  }

  /** Uploaders may mint share links; viewers only copy links that already exist. */
  async function createAndCopyShare(e: FileEntry) {
    try {
      const res = await api.post('/shares', {
        filePath: absOf(e.name),
        type: e.type === 'dir' ? 'folder' : 'file',
      });
      await navigator.clipboard.writeText(res.data.url).catch(() => {});
      toast('Share link created & copied', 'success');
      load(currentPath);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Failed to create share';
      toast(msg, 'error');
    }
  }

  function onSearchSelect(r: SearchResult) {
    if (r.type === 'dir') {
      navigateTo(r.path);
    } else {
      const parent = r.path.substring(0, r.path.lastIndexOf('/')) || '/';
      setSearchParams({ path: parent }, { replace: false });
      setPreviewing({ path: r.path, name: r.name });
    }
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/login', { state: { fromLogout: true } });
  }

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  // Files of the current folder, so the preview modal can step prev/next.
  const previewSiblings = useMemo(
    () => entries.filter(e => e.type === 'file').map(e => ({ path: absOf(e.name), name: e.name })),
    // absOf is a pure function of currentPath
    [entries, currentPath]  // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <button onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle sidebar" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-1 rounded">
          <PanelLeft size={20} />
        </button>

        <Brand variant="row" size={32} />

        <div className="flex-1" />

        <div className="hidden md:block w-72">
          <SearchBar onSelect={onSearchSelect} />
        </div>

        <ThemeToggle />
        {isTeacher && (
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
            title="Upload files"
          >
            <Upload size={15} />
            <span className="hidden sm:inline">آپلود</span>
          </button>
        )}
        <button onClick={() => load(currentPath)} aria-label="Refresh" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
          <RefreshCw size={16} />
        </button>
        <button onClick={logout} aria-label="Log out" title="Log out" className="text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
          <LogOut size={16} />
        </button>
      </header>

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 px-4 py-2 bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-sm shrink-0 overflow-x-auto whitespace-nowrap">
        <button onClick={() => navigateTo('/')} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white shrink-0">/ root</button>
        {breadcrumbs.map((seg, i) => {
          const path = '/' + breadcrumbs.slice(0, i + 1).join('/');
          return (
            <span key={path} className="flex items-center gap-1 shrink-0">
              <span className="text-slate-400 dark:text-slate-600">/</span>
              <button onClick={() => navigateTo(path)} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white truncate max-w-[200px]" dir="auto">
                {seg}
              </button>
            </span>
          );
        })}
      </nav>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <aside className="w-60 shrink-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
            <div className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500 font-medium border-b border-slate-200 dark:border-slate-700">
              Folders
            </div>
            <FileTree currentPath={currentPath} onNavigate={navigateTo} />
          </aside>
        )}

        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <FileList
            entries={entries}
            currentPath={currentPath}
            mode={viewMode}
            onModeChange={changeViewMode}
            loading={loading}
            onOpen={openEntry}
            onPreview={preview}
            hrefFor={hrefFor}
            // Uploaders can mint share links; viewers get copy-link on
            // entries that already have one (handled inside FileList).
            onShare={isTeacher ? createAndCopyShare : undefined}
          />
        </main>
      </div>

      {previewing && (
        <PreviewModal
          filePath={previewing.path}
          fileName={previewing.name}
          siblings={previewSiblings}
          onClose={() => setPreviewing(null)}
        />
      )}

      {uploadOpen && (
        <UploadZone
          currentPath={currentPath}
          onDone={() => { setUploadOpen(false); load(currentPath); }}
          onClose={() => setUploadOpen(false)}
        />
      )}

      <ToastContainer />
    </div>
  );
}
