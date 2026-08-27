import { ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';

interface Props {
  currentPath: string;
  onNavigate: (path: string) => void;
  onBack: () => void;
  onForward: () => void;
  canBack: boolean;
  canForward: boolean;
}

/**
 * Back / Forward / Up cluster, like the one at the top-left of Windows
 * Explorer. Back and Forward walk the app's own visited-folder history (the
 * pages push each folder as a `?path=` history entry); Up goes to the parent.
 */
export default function NavCluster({ currentPath, onNavigate, onBack, onForward, canBack, canForward }: Props) {
  const parent = (() => {
    if (currentPath === '/' || !currentPath) return null;
    const segs = currentPath.split('/').filter(Boolean);
    segs.pop();
    return segs.length ? '/' + segs.join('/') : '/';
  })();

  const base =
    'w-8 h-8 flex items-center justify-center rounded-lg transition-colors ' +
    'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 ' +
    'disabled:opacity-35 disabled:pointer-events-none';

  return (
    <div className="flex items-center gap-0.5">
      <button onClick={onBack} disabled={!canBack} className={base} title="Back" aria-label="Back">
        <ArrowLeft size={18} />
      </button>
      <button onClick={onForward} disabled={!canForward} className={base} title="Forward" aria-label="Forward">
        <ArrowRight size={18} />
      </button>
      <button
        onClick={() => parent && onNavigate(parent)}
        disabled={!parent}
        className={base}
        title="Up one level"
        aria-label="Up one level"
      >
        <ArrowUp size={18} />
      </button>
    </div>
  );
}
