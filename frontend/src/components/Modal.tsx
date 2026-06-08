import { useEffect, useRef, ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Tailwind max-width class, e.g. 'max-w-lg' */
  maxWidth?: string;
  /** Disable closing on backdrop click (e.g. while a critical action runs) */
  disableBackdropClose?: boolean;
}

/**
 * Accessible, theme-aware modal shell used across the app.
 * - Esc and backdrop click close it
 * - Locks background scroll while open
 * - role="dialog" + aria-modal, focuses the dialog on mount
 *
 * `children` is rendered in a flex column under the (optional) title bar, so
 * each modal can supply its own scrollable body + sticky footer sections.
 */
export default function Modal({
  title, onClose, children, maxWidth = 'max-w-lg', disableBackdropClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('modal-open');
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('modal-open');
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeIn_120ms_ease-out]"
      onMouseDown={(e) => { if (!disableBackdropClose && e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`w-full ${maxWidth} bg-white dark:bg-slate-800 rounded-2xl shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 flex flex-col max-h-[90vh] focus:outline-none animate-[popIn_140ms_ease-out]`}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
