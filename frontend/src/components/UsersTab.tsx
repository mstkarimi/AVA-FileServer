import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, Shield, Eye, RefreshCw, Upload as UploadIcon,
  ChevronUp, ChevronDown, Search,
} from 'lucide-react';
import api, { User, roleLabel } from '../api/client';
import UserDialog from './UserDialog';
import { toast } from './Toast';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

type SortKey = 'username' | 'role' | 'permissions' | 'createdAt';

export default function UsersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('username');
  const [sortAsc, setSortAsc] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data);
    } catch {
      toast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function del(u: User) {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/users/${u.id}`);
      toast('User deleted', 'success');
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed';
      toast(msg, 'error');
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  const view = useMemo(() => {
    let list = users;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(u =>
        u.username.toLowerCase().includes(q) ||
        roleLabel(u.role).toLowerCase().includes(q) ||
        u.permissions.some(p => p.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'username': cmp = a.username.localeCompare(b.username); break;
        case 'role': cmp = roleLabel(a.role).localeCompare(roleLabel(b.role)); break;
        case 'permissions': cmp = a.permissions.length - b.permissions.length; break;
        case 'createdAt': cmp = a.createdAt - b.createdAt; break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [users, query, sortKey, sortAsc]);

  function SortTh({ label, k }: { label: string; k: SortKey }) {
    return (
      <th className="text-left pb-2 font-medium">
        <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white">
          {label}
          {sortKey === k ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
        </button>
      </th>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-slate-900 dark:text-white text-lg">Users</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search users…"
              className="pl-8 pr-3 py-1.5 w-56 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button onClick={load} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700">
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm"
          >
            <Plus size={15} /> New user
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" />)}
        </div>
      ) : view.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-12">
          {users.length === 0 ? 'No users.' : 'No users match your search.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide border-b border-slate-200 dark:border-slate-700">
                <SortTh label="User" k="username" />
                <SortTh label="Role" k="role" />
                <SortTh label="Folder access" k="permissions" />
                <SortTh label="Created" k="createdAt" />
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {view.map(u => (
                <tr key={u.id} className="hover:bg-slate-100 dark:hover:bg-slate-800/50">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-medium text-slate-600 dark:text-slate-300">
                        {u.username[0].toUpperCase()}
                      </div>
                      <span className="text-slate-800 dark:text-slate-200">{u.username}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs
                      ${u.role === 'admin'   ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' :
                        u.role === 'teacher' ? 'bg-amber-100  text-amber-700  dark:bg-amber-900/40  dark:text-amber-300'  :
                                               'bg-slate-200  text-slate-700  dark:bg-slate-700     dark:text-slate-300'}`}
                    >
                      {u.role === 'admin'   ? <Shield     size={11} /> :
                       u.role === 'teacher' ? <UploadIcon size={11} /> :
                                             <Eye        size={11} />}
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 max-w-xs">
                    {u.role === 'admin' ? (
                      <span className="text-slate-500 text-xs">— full access —</span>
                    ) : u.permissions.length === 0 ? (
                      <span className="text-amber-600 dark:text-amber-500 text-xs">no folders</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.permissions.slice(0, 3).map(p => (
                          <span key={p} dir="auto" className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 text-xs truncate max-w-[120px]">
                            /{p}
                          </span>
                        ))}
                        {u.permissions.length > 3 && (
                          <span className="text-xs text-slate-500">+{u.permissions.length - 3} more</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-500">{formatDate(u.createdAt)}</td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setEditing(u)} className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 p-1">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => del(u)} className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 p-1">
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

      {(editing || creating) && (
        <UserDialog
          user={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={load}
        />
      )}
    </div>
  );
}
