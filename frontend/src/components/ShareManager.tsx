import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Copy, Trash2, ExternalLink, RefreshCw, Search, Ban, RotateCcw,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Link2, Check, X,
  Folder, File as FileIcon, Music, Video, Image as ImageIcon, FileText, Archive,
  Download, Clock,
} from 'lucide-react';
import api, { Share } from '../api/client';
import { toast } from './Toast';
import {
  FileKind, kindOf, KIND_COLOR, formatDate, relativeDate,
} from '../lib/fileMeta';

const KIND_ICON: Record<FileKind, typeof FileIcon> = {
  folder: Folder, audio: Music, video: Video, image: ImageIcon,
  doc: FileText, archive: Archive, code: FileText, other: FileIcon,
};

type SortKey = 'file' | 'createdBy' | 'createdAt' | 'downloadCount' | 'lastAccessedAt' | 'active';
type StatusFilter = 'all' | 'active' | 'revoked';
const PAGE_SIZES = [25, 50, 100];

function baseName(p: string): string {
  return p.split('/').filter(Boolean).pop() || p;
}
/** Parent folder of a shared path, for disambiguating same-named files. */
function parentDir(p: string): string {
  const parts = p.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? parts.join(' / ') : '';
}

export default function ShareManager() {
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/shares');
      setShares(res.data);
      setSelected(new Set());
    } catch {
      toast('Failed to load shares', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived list: filter → search → sort ──────────────────────────────────
  const filtered = useMemo(() => {
    let list = shares;
    if (statusFilter !== 'all') list = list.filter(s => (statusFilter === 'active' ? s.active : !s.active));
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(s =>
        s.filePath.toLowerCase().includes(q) ||
        s.hash.toLowerCase().includes(q) ||
        (s.createdBy || '').toLowerCase().includes(q));
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'file': cmp = a.filePath.localeCompare(b.filePath, undefined, { numeric: true }); break;
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

  // Any change to the result set returns to page 1.
  useEffect(() => { setPage(1); }, [query, statusFilter, sortKey, sortAsc, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  // ── Summary counts (over ALL shares, not the filtered view) ───────────────
  const stats = useMemo(() => {
    let active = 0, downloads = 0;
    for (const s of shares) { if (s.active) active++; downloads += s.downloadCount; }
    return { active, revoked: shares.length - active, downloads };
  }, [shares]);

  // ── Selection (spans pages; keyed by id, scoped to the current filter) ────
  const filteredIds = useMemo(() => filtered.map(s => s.id), [filtered]);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id));
  const someSelected = selected.size > 0 && !allFilteredSelected;
  const selectedShares = useMemo(() => shares.filter(s => selected.has(s.id)), [shares, selected]);
  const selActive = selectedShares.filter(s => s.active).length;
  const selRevoked = selectedShares.length - selActive;

  function toggleOne(id: number) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAllFiltered() {
    setSelected(prev => {
      const n = new Set(prev);
      if (allFilteredSelected) filteredIds.forEach(id => n.delete(id));
      else filteredIds.forEach(id => n.add(id));
      return n;
    });
  }
  const clearSelection = () => setSelected(new Set());

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(key === 'file' || key === 'createdBy'); }
  }

  // ── Single-row actions ────────────────────────────────────────────────────
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); toast('Link copied', 'success'); }
    catch { toast('Copy failed', 'error'); }
  }
  async function revoke(id: number) {
    try {
      await api.post(`/shares/${id}/revoke`);
      setShares(prev => prev.map(s => (s.id === id ? { ...s, active: false, revokedAt: Date.now() } : s)));
      toast('Link revoked', 'success');
    } catch { toast('Failed to revoke', 'error'); }
  }
  async function unrevoke(id: number) {
    try {
      await api.post(`/shares/${id}/unrevoke`);
      setShares(prev => prev.map(s => (s.id === id ? { ...s, active: true, revokedAt: null } : s)));
      toast('Link re-activated', 'success');
    } catch { toast('Failed to re-activate', 'error'); }
  }
  async function remove(id: number) {
    if (!confirm('Permanently delete this share link? This cannot be undone.')) return;
    try {
      await api.delete(`/shares/${id}`);
      setShares(prev => prev.filter(s => s.id !== id));
      toast('Share deleted', 'success');
    } catch { toast('Failed to delete', 'error'); }
  }

  // ── Bulk actions (one transactional request each) ─────────────────────────
  async function bulkRevoke() {
    const ids = selectedShares.filter(s => s.active).map(s => s.id);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await api.post('/shares/bulk/revoke', { ids });
      const set = new Set(ids), now = Date.now();
      setShares(prev => prev.map(s => (set.has(s.id) ? { ...s, active: false, revokedAt: now } : s)));
      toast(`${ids.length} link${ids.length === 1 ? '' : 's'} revoked`, 'success');
      clearSelection();
    } catch { toast('Bulk revoke failed', 'error'); } finally { setBusy(false); }
  }
  async function bulkUnrevoke() {
    const ids = selectedShares.filter(s => !s.active).map(s => s.id);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await api.post('/shares/bulk/unrevoke', { ids });
      const set = new Set(ids);
      setShares(prev => prev.map(s => (set.has(s.id) ? { ...s, active: true, revokedAt: null } : s)));
      toast(`${ids.length} link${ids.length === 1 ? '' : 's'} re-activated`, 'success');
      clearSelection();
    } catch { toast('Bulk re-activate failed', 'error'); } finally { setBusy(false); }
  }
  async function bulkDelete() {
    const ids = selectedShares.map(s => s.id);
    if (ids.length === 0) return;
    if (!confirm(`Permanently delete ${ids.length} share link${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.post('/shares/bulk/delete', { ids });
      const set = new Set(ids);
      setShares(prev => prev.filter(s => !set.has(s.id)));
      toast(`${ids.length} link${ids.length === 1 ? '' : 's'} deleted`, 'success');
      clearSelection();
    } catch { toast('Bulk delete failed', 'error'); } finally { setBusy(false); }
  }
  async function copySelected() {
    const urls = selectedShares.map(s => s.url).join('\n');
    try { await navigator.clipboard.writeText(urls); toast(`${selectedShares.length} link${selectedShares.length === 1 ? '' : 's'} copied`, 'success'); }
    catch { toast('Copy failed', 'error'); }
  }

  // ── UI bits ───────────────────────────────────────────────────────────────
  function SortTh({ label, k, align = 'left', className = '' }: { label: string; k: SortKey; align?: 'left' | 'right'; className?: string }) {
    const on = sortKey === k;
    return (
      <th className={`py-2.5 px-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${className}`} aria-sort={on ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
        <button
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white ${align === 'right' ? 'flex-row-reverse' : ''} ${on ? 'text-slate-800 dark:text-slate-100' : ''}`}
        >
          {label}
          {on ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronDown size={12} className="opacity-0 group-hover:opacity-30" />}
        </button>
      </th>
    );
  }

  function StatChip({ label, value, tone }: { label: string; value: string | number; tone: 'emerald' | 'slate' | 'blue' }) {
    const t = tone === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'blue' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400';
    return (
      <span className="inline-flex items-baseline gap-1.5">
        <span className={`text-sm font-semibold tabular-nums ${t}`}>{value}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
      </span>
    );
  }

  const iconBtn = 'p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors';

  return (
    <div className="p-6 flex flex-col h-full min-h-0">
      {/* Header + summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="font-semibold text-slate-900 dark:text-white text-lg">Share Links</h2>
          <div className="flex items-center gap-3">
            <StatChip label="active" value={stats.active} tone="emerald" />
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <StatChip label="revoked" value={stats.revoked} tone="slate" />
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <StatChip label="downloads" value={stats.downloads.toLocaleString()} tone="blue" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search file, hash, creator…"
              aria-label="Search share links"
              className="pl-8 pr-3 py-1.5 w-64 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          {/* Status filter as a segmented control */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-700/60">
            {(['all', 'active', 'revoked'] as StatusFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                aria-pressed={statusFilter === f}
                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                  statusFilter === f
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-400'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <button onClick={load} title="Refresh" aria-label="Refresh" className={iconBtn}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 mb-3 rounded-xl bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 text-sm shrink-0">
          <span className="flex items-center gap-1.5 font-medium text-blue-700 dark:text-blue-300">
            <Check size={15} /> {selected.size} selected
          </span>
          <div className="flex-1" />
          <button onClick={copySelected} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-50">
            <Copy size={14} /> Copy links
          </button>
          {selActive > 0 && (
            <button onClick={bulkRevoke} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-500/10 disabled:opacity-50">
              <Ban size={14} /> Revoke{selActive < selected.size ? ` (${selActive})` : ''}
            </button>
          )}
          {selRevoked > 0 && (
            <button onClick={bulkUnrevoke} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-500/10 disabled:opacity-50">
              <RotateCcw size={14} /> Re-activate{selRevoked < selected.size ? ` (${selRevoked})` : ''}
            </button>
          )}
          <button onClick={bulkDelete} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 disabled:opacity-50">
            <Trash2 size={14} /> Delete
          </button>
          <button onClick={clearSelection} title="Clear selection" aria-label="Clear selection" className="p-1 rounded-lg text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-slate-200 dark:bg-slate-700/60 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.15 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
            <Link2 size={24} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {shares.length === 0 ? 'No share links yet' : 'No links match your filter'}
          </p>
          {shares.length > 0 && (
            <button onClick={() => { setQuery(''); setStatusFilter('all'); }} className="text-xs text-blue-600 dark:text-blue-400 mt-2 hover:underline">Clear filters</button>
          )}
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 group">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2.5 pl-3 pr-1 w-9">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleAllFiltered}
                      aria-label={allFilteredSelected ? 'Deselect all' : 'Select all matching'}
                      className="w-4 h-4 accent-blue-500 cursor-pointer align-middle"
                    />
                  </th>
                  <SortTh label="File" k="file" />
                  <th className="py-2.5 px-3 font-medium text-left">Link</th>
                  <SortTh label="Status" k="active" />
                  <SortTh label="Created by" k="createdBy" className="hidden lg:table-cell" />
                  <SortTh label="Created" k="createdAt" className="hidden md:table-cell" />
                  <SortTh label="Downloads" k="downloadCount" align="right" />
                  <SortTh label="Last access" k="lastAccessedAt" className="hidden xl:table-cell" />
                  <th className="py-2.5 px-3 w-px" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageRows.map(s => {
                  const kind = kindOf(baseName(s.filePath), s.type === 'folder' ? 'dir' : 'file');
                  const Icon = KIND_ICON[kind];
                  const isSel = selected.has(s.id);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => toggleOne(s.id)}
                      className={`cursor-pointer transition-colors ${isSel ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                    >
                      <td className="py-2.5 pl-3 pr-1" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleOne(s.id)}
                          aria-label={`Select share for ${baseName(s.filePath)}`}
                          className="w-4 h-4 accent-blue-500 cursor-pointer align-middle"
                        />
                      </td>
                      <td className="py-2 px-3 max-w-[260px]">
                        <span className="flex items-center gap-2 min-w-0" title={s.filePath}>
                          <Icon size={16} className={`shrink-0 ${KIND_COLOR[kind]} ${!s.active ? 'opacity-60' : ''}`} />
                          <span className="min-w-0">
                            <span dir="auto" className="block truncate text-slate-700 dark:text-slate-200">{baseName(s.filePath)}</span>
                            {parentDir(s.filePath) && (
                              <span dir="auto" className="block truncate text-[11px] text-slate-400 dark:text-slate-500">{parentDir(s.filePath)}</span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs text-slate-400 dark:text-slate-500 truncate max-w-[92px]">{s.hash}</span>
                          <button onClick={() => copy(s.url)} className={iconBtn} title="Copy link" aria-label={`Copy link for ${baseName(s.filePath)}`}>
                            <Copy size={13} />
                          </button>
                          <a href={s.url} target="_blank" rel="noreferrer" className={iconBtn} title="Open link" aria-label={`Open link for ${baseName(s.filePath)}`}>
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        {s.active ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                            <Ban size={11} /> Revoked
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 text-xs hidden lg:table-cell truncate max-w-[120px]">{s.createdBy || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 text-xs hidden md:table-cell whitespace-nowrap" title={formatDate(s.createdAt)}>{relativeDate(s.createdAt)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {s.downloadCount > 0
                          ? <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200"><Download size={12} className="text-slate-400" />{s.downloadCount.toLocaleString()}</span>
                          : <span className="text-slate-400 dark:text-slate-600">0</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 text-xs hidden xl:table-cell whitespace-nowrap" title={s.lastAccessedAt ? formatDate(s.lastAccessedAt) : 'Never accessed'}>
                        {s.lastAccessedAt
                          ? <span className="inline-flex items-center gap-1"><Clock size={11} className="text-slate-400" />{relativeDate(s.lastAccessedAt)}</span>
                          : <span className="text-slate-400 dark:text-slate-600">Never</span>}
                      </td>
                      <td className="py-2.5 px-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {s.active ? (
                            <button onClick={() => revoke(s.id)} className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-100 dark:text-amber-500 dark:hover:bg-amber-500/10" title="Revoke (disable link)" aria-label={`Revoke ${baseName(s.filePath)}`}>
                              <Ban size={15} />
                            </button>
                          ) : (
                            <button onClick={() => unrevoke(s.id)} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-100 dark:text-emerald-500 dark:hover:bg-emerald-500/10" title="Re-activate link" aria-label={`Re-activate ${baseName(s.filePath)}`}>
                              <RotateCcw size={15} />
                            </button>
                          )}
                          <button onClick={() => remove(s.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" title="Delete permanently" aria-label={`Delete ${baseName(s.filePath)}`}>
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

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 shrink-0 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span>
                {(clampedPage - 1) * pageSize + 1}–{Math.min(clampedPage * pageSize, filtered.length)} of {filtered.length.toLocaleString()}
              </span>
              <label className="flex items-center gap-1.5 ml-2">
                <span>Per page</span>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  className="rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 px-1.5 py-0.5"
                >
                  {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={clampedPage <= 1} className={`${iconBtn} disabled:opacity-30 disabled:pointer-events-none`} aria-label="Previous page">
                  <ChevronLeft size={16} />
                </button>
                <span className="px-2 tabular-nums">Page {clampedPage} / {pageCount}</span>
                <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={clampedPage >= pageCount} className={`${iconBtn} disabled:opacity-30 disabled:pointer-events-none`} aria-label="Next page">
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
