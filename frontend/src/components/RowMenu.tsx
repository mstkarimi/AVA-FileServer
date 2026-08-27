import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';

export interface MenuItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** Draw a separator above this item. */
  separated?: boolean;
}

interface Props {
  items: MenuItem[];
  /** Announced by screen readers, e.g. the entry name. */
  label: string;
  /** Keeps the trigger visible while its menu is open even in hover-only rows. */
  onOpenChange?: (open: boolean) => void;
}

const MENU_W = 200;

/**
 * The per-row overflow menu.
 *
 * Positioned `fixed` from the trigger's bounding rect rather than `absolute`
 * inside the row: the listing scrolls inside an `overflow-y-auto` container, so
 * an absolutely-positioned menu was clipped for rows near the bottom — the
 * actions on the last file in a folder were unreachable. Fixed positioning also
 * lets it flip upward when there is no room below.
 */
export default function RowMenu({ items, label, onOpenChange }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  function set(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const h = Math.min(items.length * 38 + 16, 400);
    const below = window.innerHeight - r.bottom;
    // Flip above the trigger when the menu would overflow the viewport bottom.
    const top = below < h + 12 ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    const left = Math.min(Math.max(8, r.right - MENU_W), window.innerWidth - MENU_W - 8);
    setPos({ top, left });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const close = () => set(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); set(false); btnRef.current?.focus(); }
    };
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      set(false);
    };
    // A fixed menu would visually detach from its row on scroll, so close it.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown, true);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && pos) menuRef.current?.focus();
  }, [open, pos]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={e => { e.stopPropagation(); e.preventDefault(); set(!open); }}
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`p-1.5 rounded-lg transition-colors text-slate-400 hover:text-slate-700 hover:bg-slate-200
          dark:hover:text-slate-100 dark:hover:bg-slate-600 ${open ? 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-100' : ''}`}
      >
        <MoreVertical size={16} />
      </button>

      {open && pos && (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          onClick={e => e.stopPropagation()}
          style={{ top: pos.top, left: pos.left, width: MENU_W }}
          className="fixed z-50 py-1 rounded-xl border border-slate-200 bg-white shadow-2xl outline-none
            dark:border-slate-700 dark:bg-slate-800 animate-[popIn_120ms_ease-out]"
        >
          {items.map((it, i) => (
            <div key={it.label}>
              {it.separated && i > 0 && <div className="my-1 border-t border-slate-200 dark:border-slate-700" />}
              <button
                role="menuitem"
                onClick={() => { set(false); it.onClick(); }}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left transition-colors ${
                  it.danger
                    ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span className="shrink-0">{it.icon}</span>
                <span className="truncate">{it.label}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
