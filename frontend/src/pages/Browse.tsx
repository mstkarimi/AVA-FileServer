import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  LogOut, RefreshCw, Folder, Eye, Download, Link2, PanelLeft, Upload,
} from 'lucide-react';
import api, { FileEntry, SearchResult } from '../api/client';
import FileTree from '../components/FileTree';
import PreviewModal from '../components/PreviewModal';
import SearchBar from '../components/SearchBar';
import Brand from '../components/Brand';
import ThemeToggle from '../components/ThemeToggle';
import UploadZone from '../components/UploadZone';
import { ToastContainer, toast } from '../components/Toast';

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString();
}

export default function Browse() {
  const navigate = useNavigate();
  // ── URL-driven folder path ──────────────────────────────────────────────
  // Store the current folder in the URL query string (?path=/some/folder).
  // Every folder change pushes a new browser-history entry, so the native
  // Back button walks back through previously visited folders instead of
  // jumping straight to the login page.
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPath = searchParams.get('path') || '/';

  const role = localStorage.getItem('role') as 'viewer' | 'teacher' | null;
  const isTeacher = role === 'teacher';
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState<{ path: string; name: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);

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

  // Reload whenever URL path changes (including browser Back/Forward)
  useEffect(() => { load(currentPath); }, [currentPath, load]);

  // Push a new history entry so Back works naturally
  function navigateTo(p: string) {
    setSearchParams({ path: p }, { replace: false });
  }

  function openEntry(e: FileEntry) {
    if (e.type === 'dir') {
      const next = currentPath === '/' ? `/${e.name}` : `${currentPath}/${e.name}`;
      navigateTo(next);
    } else {
      preview(e);
    }
  }

  function preview(e: FileEntry) {
    const p = currentPath === '/' ? `/${e.name}` : `${currentPath}/${e.name}`;
    setPreviewing({ path: p, name: e.name });
  }

  function download(e: FileEntry) {
    const p = currentPath === '/' ? `/${e.name}` : `${currentPath}/${e.name}`;
    const token = localStorage.getItem('token') || '';
    const url = `/api/preview?path=${encodeURIComponent(p)}&t=${encodeURIComponent(token)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = e.name;
    a.click();
  }

  async function copyShareLink(e: FileEntry) {
    if (!e.shareUrl) return;
    try {
      await navigator.clipboard.writeText(e.shareUrl);
      toast('Share link copied', 'success');
    } catch {
      toast('Copy failed', 'error');
    }
  }

  async function createAndCopyShare(e: FileEntry) {
    const p = currentPath === '/' ? `/${e.name}` : `${currentPath}/${e.name}`;
    try {
      const res = await api.post('/shares', { filePath: p, type: e.type === 'dir' ? 'folder' : 'file' });
      const url: string = res.data.url;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast('Share link created & copied', 'success');
      load(currentPath);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create share';
      toast(msg, 'error');
    }
  }

  function onSearchSelect(r: SearchResult) {
    if (r.type === 'dir') {
      navigateTo(r.path);
    } else {
      const parent = r.path.substring(0, r.path.lastIndexOf('/')) || '/';
      // Navigate to parent folder then open preview
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

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-4 px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <button onClick={() => setSidebarOpen(o => !o)} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-1 rounded">
          <PanelLeft size={20} />
        </button>

        <Brand variant="row" size={32} />

        <SearchBar onSelect={onSearchSelect} />

        <div className="flex-1" />

        <ThemeToggle />
        {isTeacher && (
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
            title="Upload files"
          >
            <Upload size={15} />
            <span>آپلود</span>
          </button>
        )}
        <button onClick={() => load(currentPath)} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700">
          <RefreshCw size={16} />
        </button>
        <button onClick={logout} className="text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700" title="Logout">
          <LogOut size={16} />
        </button>
      </header>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 px-4 py-2 bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-sm shrink-0">
        <button onClick={() => navigateTo('/')} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">/ root</button>
        {breadcrumbs.map((seg, i) => {
          const path = '/' + breadcrumbs.slice(0, i + 1).join('/');
          return (
            <span key={path} className="flex items-center gap-1">
              <span className="text-slate-400 dark:text-slate-600">/</span>
              <button onClick={() => navigateTo(path)} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white truncate max-w-[200px]" dir="auto">
                {seg}
              </button>
            </span>
          );
        })}
      </div>

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

        <main className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Folder size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">This folder is empty.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-right px-4 py-2 font-medium w-32">Size</th>
                  <th className="text-right px-4 py-2 font-medium w-32">Modified</th>
                  <th className="px-4 py-2 w-44"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr
                    key={e.name}
                    onDoubleClick={() => openEntry(e)}
                    className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => openEntry(e)}
                        className="flex items-center gap-2 text-left w-full"
                      >
                        {e.type === 'dir' ? (
                          <Folder size={16} className="text-yellow-500 dark:text-yellow-400 shrink-0" />
                        ) : (
                          <span className="w-4 h-4 shrink-0" />
                        )}
                        <span dir="auto" className="text-sm text-slate-800 dark:text-slate-200 truncate">{e.name}</span>
                        {e.shareUrl && (
                          <span title="Has a public share link" className="ml-1 shrink-0 text-blue-500 dark:text-blue-400">
                            <Link2 size={12} />
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-500 tabular-nums">
                      {e.type === 'file' ? formatSize(e.size) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-500">{formatDate(e.modified)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        {e.shareUrl ? (
                          <button
                            onClick={() => copyShareLink(e)}
                            className="text-slate-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400 p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                            title="Copy share link"
                          >
                            <Link2 size={15} />
                          </button>
                        ) : isTeacher ? (
                          <button
                            onClick={() => createAndCopyShare(e)}
                            className="text-slate-400 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400 p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                            title="Create & copy share link"
                          >
                            <Link2 size={15} />
                          </button>
                        ) : null}
                        {e.type === 'file' && (
                          <>
                            <button onClick={() => preview(e)} className="text-slate-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400 p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700" title="Preview">
                              <Eye size={15} />
                            </button>
                            <button onClick={() => download(e)} className="text-slate-500 hover:text-green-600 dark:text-slate-400 dark:hover:text-green-400 p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700" title="Download">
                              <Download size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </main>
      </div>

      {previewing && (
        <PreviewModal
          filePath={previewing.path}
          fileName={previewing.name}
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
