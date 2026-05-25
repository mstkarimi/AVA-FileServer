import { useState, useEffect, FormEvent } from 'react';
import { X } from 'lucide-react';
import api, { User, Role } from '../api/client';
import PermissionPicker from './PermissionPicker';
import { toast } from './Toast';

interface Props {
  user: User | null;       // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

export default function UserDialog({ user, onClose, onSaved }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setRole(user.role);
      setPermissions(user.permissions);
      setPassword('');
    }
  }, [user]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const hasPermissions = role === 'viewer' || role === 'teacher';
      if (user) {
        const body: Record<string, unknown> = { role };
        if (password) body.password = password;
        body.permissions = hasPermissions ? permissions : [];
        await api.patch(`/admin/users/${user.id}`, body);
        toast('User updated', 'success');
      } else {
        await api.post('/admin/users', {
          username,
          password,
          role,
          permissions: hasPermissions ? permissions : [],
        });
        toast('User created', 'success');
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
          <h2 className="font-semibold text-white">{user ? `Edit user: ${user.username}` : 'New user'}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Username</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={!!user}
              required
              minLength={3}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              {user ? 'New password (leave blank to keep)' : 'Password'}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required={!user}
              minLength={6}
              placeholder={user ? '••••••••' : 'min 6 chars'}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Role</label>
            <div className="flex gap-2">
              {([
                { value: 'viewer',  label: 'بیننده'  },
                { value: 'teacher', label: 'استاد'   },
                { value: 'admin',   label: 'Admin'   },
              ] as { value: Role; label: string }[]).map(({ value, label }) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setRole(value)}
                  className={`flex-1 py-2 rounded-lg text-sm transition-colors
                    ${role === value ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {role === 'teacher' && (
              <p className="mt-1.5 text-xs text-slate-500">
                استاد می‌تواند فایل آپلود کند و لینک اشتراک بسازد — نه mkdir، نه حذف، نه تغییر نام.
              </p>
            )}
          </div>

          {(role === 'viewer' || role === 'teacher') && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Folder access ({permissions.length} selected)
              </label>
              <PermissionPicker selected={permissions} onChange={setPermissions} />
              <p className="mt-1 text-xs text-slate-500">
                Granted access is recursive into subfolders. Selecting a parent covers all children.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-3 py-2 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-slate-700 shrink-0">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg py-2 text-sm font-medium"
          >
            {saving ? 'Saving…' : user ? 'Update' : 'Create'}
          </button>
          <button type="button" onClick={onClose} className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg py-2 text-sm">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
