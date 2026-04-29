import { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, Folder, File } from 'lucide-react';
import api, { SearchResult } from '../api/client';

interface Props {
  onSelect: (result: SearchResult) => void;
  placeholder?: string;
}

export default function SearchBar({ onSelect, placeholder = 'Search files…' }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const myId = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/search', { params: { q } });
        if (myId !== reqId.current) return;
        setResults(res.data);
      } catch {
        if (myId === reqId.current) setResults([]);
      } finally {
        if (myId === reqId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function pick(r: SearchResult) {
    onSelect(r);
    setOpen(false);
    setQ('');
    setResults([]);
  }

  return (
    <div ref={wrapRef} className="relative w-full max-w-md">
      <div className="flex items-center bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 focus-within:border-blue-500">
        <Search size={16} className="text-slate-400 shrink-0" />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="bg-transparent flex-1 px-2 text-sm text-white placeholder-slate-500 focus:outline-none"
        />
        {loading && <Loader2 size={14} className="animate-spin text-slate-500" />}
        {q && !loading && (
          <button onClick={() => { setQ(''); setResults([]); }} className="text-slate-500 hover:text-white">
            <X size={14} />
          </button>
        )}
      </div>

      {open && q.trim().length >= 2 && (
        <div className="absolute z-30 mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-96 overflow-y-auto">
          {loading && results.length === 0 && (
            <div className="p-3 text-sm text-slate-500 text-center">Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="p-3 text-sm text-slate-500 text-center">No results</div>
          )}
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => pick(r)}
              className="w-full text-left px-3 py-2 hover:bg-slate-700 flex items-center gap-2 border-b border-slate-700/50 last:border-0"
            >
              {r.type === 'dir' ? (
                <Folder size={15} className="text-yellow-400 shrink-0" />
              ) : (
                <File size={15} className="text-slate-400 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div dir="auto" className="text-sm text-slate-200 truncate">{r.name}</div>
                <div dir="auto" className="text-xs text-slate-500 truncate">{r.path}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
