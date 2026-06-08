import { useState, useEffect, FormEvent } from 'react';
import api, { User, Role } from '../api/client';
import PermissionPicker from './PermissionPicker';
import Modal from './Modal';
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

  const inputCls =
    'w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60';

  return (
    <Modal title={user ? `Edit user: ${user.username}` : 'New user'} onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={submit} className="flex flex-col min-h-0 flex-1">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Username</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={!!user}
              required
              minLength={3}
              autoFocus={!user}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">
              {user ? 'New password (leave blank to keep)' : 'Password'}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required={!user}
              minLength={6}
              placeholder={user ? '••••••••' : 'min 6 chars'}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Role</label>
            <div className="flex gap-2">
              {([
                { value: 'viewer',  label: 'Viewer'   },
                { value: 'teacher', label: 'Uploader' },
                { value: 'admin',   label: 'Admin'    },
              ] as { value: Role; label: string }[]).map(({ value, label }) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setRole(value)}
                  aria-pressed={role === value}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                    ${role === value
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {role === 'teacher' && (
              <p className="mt-1.5 text-xs text-slate-500" dir="rtl">
                «Uploader» می‌تواند فایل آپلود کند و لینک اشتراک بسازد — نه ساخت پوشه، نه حذف، نه تغییر نام.
              </p>
            )}
          </div>

          {(role === 'viewer' || role === 'teacher') && (
            <div>
              <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">
                Folder access ({permissions.length} selected)
              </label>
              <PermissionPicker selected={permissions} onChange={setPermissions} />
              <p className="mt-1 text-xs text-slate-500">
                Granted access is recursive into subfolders. Selecting a parent covers all children.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/40 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg px-3 py-2 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            {saving ? 'Saving…' : user ? 'Update' : 'Create'}
          </button>
          <button type="button" onClick={onClose} className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 rounded-lg py-2 text-sm transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
