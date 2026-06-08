import { useState, useEffect, useMemo } from 'react';
import {
  Copy, Trash2, ExternalLink, RefreshCw, Search, Ban, RotateCcw,
  ChevronUp, ChevronDown, Link2,
} from 'lucide-react';
import api, { Share } from '../api/client';
import { toast } from './Toast';

function formatDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

type SortKey = 'file' | 'createdBy' | 'createdAt' | 'downloadCount' | 'lastAccessedAt' | 'active';

export default function ShareManager() {
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortAsc, setSortAsc] = useState(false);

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
      await api.post(`/shares/${id}/revoke`);
      setShares(prev => prev.map(s => s.id === id ? { ...s, active: false, revokedAt: Date.now() } : s));
      toast('Link revoked — it no longer works', 'success');
    } catch {
      toast('Failed to revoke', 'error');
    }
  }

  async function unrevoke(id: number) {
    try {
      await api.post(`/shares/${id}/unrevoke`);
      setShares(prev => prev.map(s => s.id === id ? { ...s, active: true, revokedAt: null } : s));
      toast('Link re-activated', 'success');
    } catch {
      toast('Failed to re-activate', 'error');
    }
  }

  async function remove(id: number) {
    if (!confirm('Permanently delete this share link? This cannot be undone.')) return;
    try {
      await api.delete(`/shares/${id}`);
      setShares(prev => prev.filter(s => s.id !== id));
      toast('Share deleted', 'success');
    } catch {
      toast('Failed to delete', 'error');
    }
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    toast('Link copied!', 'success');
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  const view = useMemo(() => {
    let list = shares;
    if (statusFilter !== 'all') {
      list = list.filter(s => statusFilter === 'active' ? s.active : !s.active);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(s =>
        s.filePath.toLowerCase().includes(q) ||
        s.hash.toLowerCase().includes(q) ||
        (s.createdBy || '').toLowerCase().includes(q)
      );
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'file': cmp = a.filePath.localeCompare(b.filePath); break;
        case 'createdBy': cmp = (a.createdBy || '').localeCompare(b.createdBy || ''); break;
        case 'createdAt': cmp = a.createdAt - b.createdAt; break;
        case 'downloadCount': cmp = a.downloadCount - b.downloadCount; break;
        case 'lastAccessedAt': cmp = (a.lastAccessedAt || 0) - (b.lastAccessedAt || 0); break;
        case 'active': cmp = Number(a.active) - Number(b.active); break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [shares, query, statusFilter, sortKey, sortAsc]);

  const activeCount = shares.filter(s => s.active).length;
  const revokedCount = shares.length - activeCount;

  function SortTh({ label, k, align = 'left' }: { label: string; k: SortKey; align?: 'left' | 'right' }) {
    return (
      <th className={`pb-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <button
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white ${align === 'right' ? 'flex-row-reverse' : ''}`}
        >
          {label}
          {sortKey === k ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
        </button>
      </th>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-slate-900 dark:text-white text-lg">Share Links</h2>
          <span className="text-xs text-slate-500">
            {activeCount} active · {revokedCount} revoked
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Search (item 6) */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search file, hash, creator…"
              className="pl-8 pr-3 py-1.5 w-64 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          {/* Status filter (item 1) */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'revoked')}
            className="text-sm rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white px-2 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
          </select>
          <button onClick={load} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1.5">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" />)}
        </div>
      ) : view.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-12">
          {shares.length === 0 ? 'No share links yet' : 'No links match your filter'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
                <SortTh label="File" k="file" />
                <th className="text-left pb-2 font-medium">Link</th>
                <SortTh label="Status" k="active" />
                <SortTh label="Created by" k="createdBy" />
                <SortTh label="Created" k="createdAt" />
                <SortTh label="Downloads" k="downloadCount" align="right" />
                <SortTh label="Last Access" k="lastAccessedAt" />
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {view.map(s => (
                <tr key={s.id} className={`hover:bg-slate-100 dark:hover:bg-slate-800/50 ${!s.active ? 'opacity-60' : ''}`}>
                  <td dir="auto" className="py-3 pr-4 text-slate-700 dark:text-slate-300 max-w-[180px] truncate" title={s.filePath}>
                    <span className="inline-flex items-center gap-1.5">
                      {s.type === 'folder' ? '📁' : '📄'} {s.filePath.split('/').pop()}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate max-w-[110px]">{s.hash}</span>
                      <button onClick={() => copy(s.url)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" title="Copy link">
                        <Copy size={13} />
                      </button>
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" title="Open link">
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    {s.active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                        <Link2 size={11} /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                        <Ban size={11} /> Revoked
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-slate-600 dark:text-slate-400 text-xs">{s.createdBy || '—'}</td>
                  <td className="py-3 pr-4 text-slate-500 text-xs">{formatDate(s.createdAt)}</td>
                  <td className="py-3 pr-4 text-right text-slate-700 dark:text-slate-300">{s.downloadCount}</td>
                  <td className="py-3 pr-4 text-slate-500 text-xs">{formatDate(s.lastAccessedAt)}</td>
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-1">
                      {s.active ? (
                        <button onClick={() => revoke(s.id)} className="text-amber-600 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-400 p-1" title="Revoke (disable link)">
                          <Ban size={15} />
                        </button>
                      ) : (
                        <button onClick={() => unrevoke(s.id)} className="text-green-600 dark:text-green-500 hover:text-green-700 dark:hover:text-green-400 p-1" title="Re-activate link">
                          <RotateCcw size={15} />
                        </button>
                      )}
                      <button onClick={() => remove(s.id)} className="text-red-500 hover:text-red-400 p-1" title="Delete permanently">
                        <Trash2 size={15} />
                      </button>
                    </div>
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
