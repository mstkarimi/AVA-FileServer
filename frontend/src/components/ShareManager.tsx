import { useState, useEffect } from 'react';
import { Copy, Trash2, ExternalLink, RefreshCw } from 'lucide-react';
import api, { Share } from '../api/client';
import { toast } from './Toast';

function formatDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

export default function ShareManager() {
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/shares');
      setShares(res.data);
    } catch {
      toast('Failed to load shares', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function revoke(id: number) {
    try {
      await api.delete(`/shares/${id}`);
      setShares(prev => prev.filter(s => s.id !== id));
      toast('Share revoked', 'success');
    } catch {
      toast('Failed to revoke share', 'error');
    }
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    toast('Link copied!', 'success');
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-white text-lg">Active Share Links</h2>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-700 rounded-xl animate-pulse" />)}
        </div>
      ) : shares.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-12">No active share links</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-700">
                <th className="text-left pb-2 font-medium">File</th>
                <th className="text-left pb-2 font-medium">Link</th>
                <th className="text-left pb-2 font-medium">Created</th>
                <th className="text-right pb-2 font-medium">Downloads</th>
                <th className="text-left pb-2 font-medium">Last Access</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {shares.map(s => (
                <tr key={s.id} className="hover:bg-slate-800/50">
                  <td dir="auto" className="py-3 pr-4 text-slate-300 max-w-[160px] truncate">{s.filePath.split('/').pop()}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-slate-400 truncate max-w-[120px]">{s.hash}</span>
                      <button onClick={() => copy(s.url)} className="text-slate-500 hover:text-slate-300">
                        <Copy size={13} />
                      </button>
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300">
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-500 text-xs">{formatDate(s.createdAt)}</td>
                  <td className="py-3 pr-4 text-right text-slate-300">{s.downloadCount}</td>
                  <td className="py-3 pr-4 text-slate-500 text-xs">{formatDate(s.lastAccessedAt)}</td>
                  <td className="py-3">
                    <button onClick={() => revoke(s.id)} className="text-red-500 hover:text-red-400">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
