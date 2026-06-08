import { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw, RotateCcw, Trash2, Search, Folder, File as FileIcon, AlertTriangle,
} from 'lucide-react';
import api, { TrashItem } from '../api/client';
import { toast } from './Toast';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
}

function timeLeft(expiresAt: number): { label: string; urgent: boolean } {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return { label: 'expired', urgent: true };
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days >= 1) return { label: `${days}d ${hours}h`, urgent: days < 2 };
  return { label: `${hours}h`, urgent: true };
}

export default function TrashTab() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/trash');
      setItems(res.data);
    } catch {
      toast('Failed to load trash', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function restore(it: TrashItem) {
    try {
      const res = await api.post(`/trash/${it.id}/restore`);
      setItems(prev => prev.filter(t => t.id !== it.id));
      toast(`Restored to /${res.data.restoredTo}`, 'success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Restore failed';
      toast(msg, 'error');
    }
  }

  async function purge(it: TrashItem) {
    if (!confirm(`Permanently delete "${it.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/trash/${it.id}`);
      setItems(prev => prev.filter(t => t.id !== it.id));
      toast('Permanently deleted', 'success');
    } catch {
      toast('Failed to delete', 'error');
    }
  }

  async function emptyAll() {
    if (items.length === 0) return;
    if (!confirm(`Permanently delete ALL ${items.length} item(s) in trash? This cannot be undone.`)) return;
    try {
      await api.post('/trash/empty');
      setItems([]);
      toast('Trash emptied', 'success');
    } catch {
      toast('Failed to empty trash', 'error');
    }
  }

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.originalPath.toLowerCase().includes(q) ||
      (t.deletedBy || '').toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-slate-900 dark:text-white text-lg">Trash</h2>
          <span className="text-xs text-slate-500">{items.length} item(s) · auto-deleted after retention window</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search trash…"
              className="pl-8 pr-3 py-1.5 w-56 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button onClick={load} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700">
            <RefreshCw size={15} />
          </button>
          <button
            onClick={emptyAll}
            disabled={items.length === 0}
            className="flex items-center gap-1.5 text-sm bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg"
          >
            <Trash2 size={15} /> Empty trash
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" />)}
        </div>
      ) : view.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-12">
          {items.length === 0 ? 'Trash is empty' : 'No items match your search.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
                <th className="text-left pb-2 font-medium">Name</th>
                <th className="text-left pb-2 font-medium">Original location</th>
                <th className="text-right pb-2 font-medium">Size</th>
                <th className="text-left pb-2 font-medium">Deleted by</th>
                <th className="text-left pb-2 font-medium">Deleted</th>
                <th className="text-left pb-2 font-medium">Auto-delete in</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {view.map(t => {
                const tl = timeLeft(t.expiresAt);
                const parent = t.originalPath.includes('/')
                  ? '/' + t.originalPath.slice(0, t.originalPath.lastIndexOf('/'))
                  : '/';
                return (
                  <tr key={t.id} className="hover:bg-slate-100 dark:hover:bg-slate-800/50">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        {t.type === 'dir'
                          ? <Folder size={16} className="text-yellow-500 shrink-0" />
                          : <FileIcon size={16} className="text-slate-400 shrink-0" />}
                        <span dir="auto" className="text-slate-800 dark:text-slate-200 truncate max-w-[180px]">{t.name}</span>
                      </div>
                    </td>
                    <td dir="auto" className="py-3 pr-4 text-slate-500 text-xs truncate max-w-[180px]" title={parent}>{parent}</td>
                    <td className="py-3 pr-4 text-right text-slate-600 dark:text-slate-300 text-xs">{t.type === 'dir' ? '—' : formatSize(t.size)}</td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-400 text-xs">{t.deletedBy || '—'}</td>
                    <td className="py-3 pr-4 text-slate-500 text-xs">{formatDate(t.deletedAt)}</td>
                    <td className="py-3 pr-4 text-xs">
                      <span className={`inline-flex items-center gap-1 ${tl.urgent ? 'text-red-500' : 'text-slate-500'}`}>
                        {tl.urgent && <AlertTriangle size={11} />} {tl.label}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => restore(t)} className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 px-2 py-1 rounded hover:bg-green-50 dark:hover:bg-green-900/20" title="Restore">
                          <RotateCcw size={14} /> Restore
                        </button>
                        <button onClick={() => purge(t)} className="text-red-500 hover:text-red-400 p-1" title="Delete permanently">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
