import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Shield, Eye, RefreshCw } from 'lucide-react';
import api, { User } from '../api/client';
import UserDialog from './UserDialog';
import { toast } from './Toast';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

export default function UsersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-white text-lg">Users</h2>
        <div className="flex gap-2">
          <button onClick={load} className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-slate-700">
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
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-700 rounded-xl animate-pulse" />)}
        </div>
      ) : users.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-12">No users.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-700">
                <th className="text-left pb-2 font-medium">User</th>
                <th className="text-left pb-2 font-medium">Role</th>
                <th className="text-left pb-2 font-medium">Folder access</th>
                <th className="text-left pb-2 font-medium">Created</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-800/50">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-medium text-slate-300">
                        {u.username[0].toUpperCase()}
                      </div>
                      <span className="text-slate-200">{u.username}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs
                      ${u.role === 'admin' ? 'bg-purple-900/40 text-purple-300' : 'bg-slate-700 text-slate-300'}`}
                    >
                      {u.role === 'admin' ? <Shield size={11} /> : <Eye size={11} />}
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 pr-4 max-w-xs">
                    {u.role === 'admin' ? (
                      <span className="text-slate-500 text-xs">— full access —</span>
                    ) : u.permissions.length === 0 ? (
                      <span className="text-amber-500 text-xs">no folders</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.permissions.slice(0, 3).map(p => (
                          <span key={p} dir="auto" className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-xs truncate max-w-[120px]">
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
                      <button onClick={() => setEditing(u)} className="text-slate-400 hover:text-blue-400 p-1">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => del(u)} className="text-slate-400 hover:text-red-400 p-1">
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
