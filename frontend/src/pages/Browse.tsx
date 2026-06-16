import { useState, useEffect, useCallback, MouseEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  LogOut, RefreshCw, Folder, Eye, Download, Link2, PanelLeft, Upload,
  Music, Video, Image as ImageIcon, FileText, File as FileIcon,
  ChevronUp, ChevronDown,
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

type SortKey = 'name' | 'size' | 'modified';

function isModifiedClick(e: MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

function fileIcon(entry: FileEntry) {
  if (entry.type === 'dir') return <Folder size={16} className="text-yellow-500 dark:text-yellow-400 shrink-0" />;
  const ext = entry.name.split('.').pop()?.toLowerCase() || '';
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) return <Music size={16} className="text-blue-500 dark:text-blue-400 shrink-0" />;
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return <Video size={16} className="text-purple-500 dark:text-purple-400 shrink-0" />;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return <ImageIcon size={16} className="text-green-500 dark:text-green-400 shrink-0" />;
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return <FileText size={16} className="text-orange-500 dark:text-orange-400 shrink-0" />;
  return <FileIcon size={16} className="text-slate-400 shrink-0" />;
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
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc(a => !a);
    else { setSortKey(k); setSortAsc(true); }
  }

  const sorted = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    let cmp = 0;
    if (sortKey === 'name') cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    else if (sortKey === 'size') cmp = a.size - b.size;
    else cmp = a.modified - b.modified;
    return sortAsc ? cmp : -cmp;
  });

  function folderHref(e: FileEntry): string {
    const full = currentPath === '/' ? `/${e.name}` : `${currentPath}/${e.name}`;
    return `/browse?${new URLSearchParams({ path: full }).toString()}`;
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
        <button onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle sidebar" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-1 rounded">
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
        <button onClick={() => load(currentPath)} aria-label="Refresh" className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700">
          <RefreshCw size={16} />
        </button>
        <button onClick={logout} aria-label="Log out" className="text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700" title="Log out">
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
                  <th className="px-2 py-2 font-medium w-12 text-left">
                    <button onClick={() => toggleSort('name')} title="Row number — sort by natural order" className="hover:text-slate-900 dark:hover:text-slate-200">#</button>
                  </th>
                  <th className="text-left px-2 py-2 font-medium">
                    <button onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200">
                      Name {sortKey === 'name' ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
                    </button>
                  </th>
                  <th className="text-right px-4 py-2 font-medium w-32">
                    <button onClick={() => toggleSort('size')} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200">
                      {sortKey === 'size' ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null} Size
                    </button>
                  </th>
                  <th className="text-right px-4 py-2 font-medium w-32">
                    <button onClick={() => toggleSort('modified')} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200">
                      {sortKey === 'modified' ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null} Modified
                    </button>
                  </th>
                  <th className="px-4 py-2 w-44"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e, idx) => (
                  <tr
                    key={e.name}
                    className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-2 py-2.5 text-xs text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="px-2 py-2.5">
                      {e.type === 'dir' ? (
                        <a
                          href={folderHref(e)}
                          onClick={ev => { if (isModifiedClick(ev)) return; ev.preventDefault(); openEntry(e); }}
                          title="Open · Ctrl/⌘-click to open in a new tab"
                          className="group flex items-center gap-2 text-left w-full"
                        >
                          {fileIcon(e)}
                          <span dir="auto" className="text-sm text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:underline">{e.name}</span>
                          {e.shareUrl && (
                            <span title="Has a public share link" className="ml-1 shrink-0 text-blue-500 dark:text-blue-400">
                              <Link2 size={12} />
                            </span>
                          )}
                        </a>
                      ) : (
                        <button
                          onClick={() => preview(e)}
                          className="group flex items-center gap-2 text-left w-full"
                        >
                          {fileIcon(e)}
                          <span dir="auto" className="text-sm text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">{e.name}</span>
                          {e.shareUrl && (
                            <span title="Has a public share link" className="ml-1 shrink-0 text-blue-500 dark:text-blue-400">
                              <Link2 size={12} />
                            </span>
                          )}
                        </button>
                      )}
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
