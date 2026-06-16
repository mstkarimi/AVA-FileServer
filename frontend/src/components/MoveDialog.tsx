import { useState } from 'react';
import { Move, FolderInput } from 'lucide-react';
import Modal from './Modal';
import FileTree from './FileTree';

interface Props {
  count: number;
  /** Folder the items currently live in (offered as disabled "you're already here" hint). */
  currentPath: string;
  onClose: () => void;
  onConfirm: (destPath: string) => void;
}

export default function MoveDialog({ count, currentPath, onClose, onConfirm }: Props) {
  const [dest, setDest] = useState('/');
  const sameAsCurrent = dest === currentPath;

  return (
    <Modal title={`Move ${count} item${count === 1 ? '' : 's'}`} onClose={onClose} maxWidth="max-w-md">
      <div className="p-6 pt-4">
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
          <FolderInput size={15} /> Choose a destination folder:
        </p>
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg h-64 overflow-y-auto bg-slate-50 dark:bg-slate-900/40 px-1">
          <FileTree currentPath={dest} onNavigate={setDest} />
        </div>
        <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Destination:{' '}
          <span dir="auto" className="font-mono text-slate-900 dark:text-white break-all">{dest}</span>
        </div>
        {sameAsCurrent && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
            This is the current folder — pick a different one.
          </p>
        )}
      </div>
      <div className="flex gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
        <button
          onClick={() => onConfirm(dest)}
          disabled={sameAsCurrent}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg py-2 text-sm font-medium transition-colors"
        >
          <Move size={16} /> Move here
        </button>
        <button onClick={onClose} className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 rounded-lg py-2 text-sm transition-colors">
          Cancel
        </button>
      </div>
    </Modal>
  );
}
