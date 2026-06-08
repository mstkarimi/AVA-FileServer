import { useState, useEffect } from 'react';
import { Copy, ExternalLink, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import api, { BulkShareItem } from '../api/client';
import Modal from './Modal';
import { toast } from './Toast';

interface Props {
  paths: string[];
  hasFolders: boolean;
  onClose: () => void;
}

export default function BulkShareModal({ paths, hasFolders, onClose }: Props) {
  const [recurse, setRecurse] = useState(true);     // for folders: walk and share files inside
  const [folderShare, setFolderShare] = useState(false); // share folder as one browseable link
  const [results, setResults] = useState<BulkShareItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOpts, setShowOpts] = useState(hasFolders);

  async function generate() {
    setLoading(true);
    try {
      const res = await api.post('/shares/bulk', {
        paths,
        recurse: hasFolders && !folderShare ? recurse : false,
        folderShare,
      });
      setResults(res.data);
    } catch {
      toast('Failed to generate shares', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasFolders) generate();
  }, []);

  const successful = results?.filter(r => r.url) || [];
  const failed = results?.filter(r => r.error) || [];

  function copyAll() {
    const text = successful.map(r => r.url).join('\n');
    navigator.clipboard.writeText(text);
    toast(`Copied ${successful.length} URLs`, 'success');
  }

  function copyCsv() {
    const rows = ['path,url', ...successful.map(r => `${JSON.stringify(r.sourcePath)},${r.url}`)];
    navigator.clipboard.writeText(rows.join('\n'));
    toast('Copied as CSV', 'success');
  }

  function copyOne(url: string) {
    navigator.clipboard.writeText(url);
    toast('Copied', 'success');
  }

  return (
    <Modal title={`Bulk share — ${paths.length} item${paths.length === 1 ? '' : 's'}`} onClose={onClose} maxWidth="max-w-2xl">
      {results === null && (
        <div className="p-6 space-y-4 overflow-y-auto">
          {showOpts && (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400">Selection includes folders. How should they be shared?</p>
              <label className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-transparent cursor-pointer">
                <input
                  type="radio"
                  checked={!folderShare}
                  onChange={() => setFolderShare(false)}
                  className="mt-0.5 accent-blue-600"
                />
                <div>
                  <div className="text-sm text-slate-900 dark:text-white">Per-file links {recurse && '(recursive)'}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Generate one link per file inside each folder</div>
                  {!folderShare && (
                    <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-2">
                      <input type="checkbox" checked={recurse} onChange={e => setRecurse(e.target.checked)} className="accent-blue-600" />
                      Recurse into subfolders
                    </label>
                  )}
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-transparent cursor-pointer">
                <input
                  type="radio"
                  checked={folderShare}
                  onChange={() => setFolderShare(true)}
                  className="mt-0.5 accent-blue-600"
                />
                <div>
                  <div className="text-sm text-slate-900 dark:text-white">Browseable folder link</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">One link per folder; public users can browse and download files inside</div>
                </div>
              </label>
            </>
          )}

          <button
            onClick={generate}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg py-2 font-medium text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Generating…' : 'Generate links'}
          </button>
        </div>
      )}

      {results !== null && (
        <div className="flex flex-col min-h-0 flex-1">
          <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3 shrink-0">
            <div className="text-sm text-slate-700 dark:text-slate-300">
              {successful.length} created
              {failed.length > 0 && <span className="text-red-500 dark:text-red-400 ml-2">{failed.length} failed</span>}
            </div>
            <div className="flex-1" />
            <button onClick={copyAll} className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors">
              <Copy size={13} /> Copy all
            </button>
            <button onClick={copyCsv} className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg transition-colors">
              Copy CSV
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                  ${r.error ? 'bg-red-50 dark:bg-red-900/20' : 'bg-slate-50 dark:bg-slate-700/40'}`}
              >
                {r.error ? <AlertCircle size={14} className="text-red-500 dark:text-red-400 shrink-0" /> : <CheckCircle size={14} className="text-green-500 dark:text-green-400 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div dir="auto" className="text-xs text-slate-500 dark:text-slate-400 truncate">{r.sourcePath}</div>
                  {r.url && <div className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">{r.url}</div>}
                  {r.error && <div className="text-xs text-red-500 dark:text-red-400">{r.error}</div>}
                </div>
                {r.url && (
                  <>
                    <button onClick={() => copyOne(r.url!)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1">
                      <Copy size={13} />
                    </button>
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1">
                      <ExternalLink size={13} />
                    </a>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 shrink-0">
            <button onClick={onClose} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 rounded-lg py-2 text-sm transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
