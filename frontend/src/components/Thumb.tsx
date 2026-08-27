import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  isThumbable, loadThumb, cachedThumb, thumbFailed, thumbsDisabled, onThumbsDisabled,
} from '../lib/thumbs';

interface Props {
  /** Absolute path of the file, e.g. "/My Material/cover.jpg". */
  path: string;
  name: string;
  type: 'file' | 'dir';
  size: number;
  /** Rendered when there is no thumbnail (always the file-type icon). */
  fallback: ReactNode;
  /** Square edge in px. */
  edge: number;
}

/**
 * A thumbnail that only ever loads while visible, never exceeds the global
 * in-flight budget, and silently becomes an icon when the server is busy.
 * See lib/thumbs.ts for why those guarantees matter here.
 */
export default function Thumb({ path, name, type, size, fallback, edge }: Props) {
  const eligible = isThumbable(name, type, size);
  const [url, setUrl] = useState<string | null>(() => (eligible ? cachedThumb(path) ?? null : null));
  const [off, setOff] = useState(() => thumbsDisabled());
  const holder = useRef<HTMLDivElement | null>(null);

  // If the breaker trips mid-scroll, every mounted tile drops to its icon.
  useEffect(() => onThumbsDisabled(() => setOff(true)), []);

  useEffect(() => {
    if (!eligible || off || url || thumbFailed(path)) return;
    const el = holder.current;
    if (!el) return;

    const ctrl = new AbortController();
    let started = false;
    let settle: ReturnType<typeof setTimeout> | null = null;

    const io = new IntersectionObserver(
      entries => {
        const visible = entries.some(e => e.isIntersecting);
        if (visible) {
          if (started || settle) return;
          // Only fetch once a tile has been continuously visible for a moment.
          // A flick-scroll sweeps past dozens of tiles in well under this, so
          // the queue fills with what the user actually stopped on rather than
          // with everything that blurred by.
          settle = setTimeout(() => {
            settle = null;
            started = true;
            loadThumb(path, ctrl.signal).then(u => { if (u && !ctrl.signal.aborted) setUrl(u); });
          }, 120);
        } else if (settle) {
          // Scrolled away before settling — never ask for it at all.
          clearTimeout(settle);
          settle = null;
        }
      },
      // Start a little before the tile scrolls in, so it is usually ready —
      // but not so early that a fast scroll queues the whole folder.
      { rootMargin: '150px' }
    );
    io.observe(el);

    return () => {
      if (settle) clearTimeout(settle);
      io.disconnect();
      ctrl.abort();
    };
  }, [path, eligible, off, url]);

  return (
    <div
      ref={holder}
      style={{ width: edge, height: edge }}
      className="shrink-0 flex items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-700/50"
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="w-full h-full object-cover animate-[fadeIn_150ms_ease-out]"
        />
      ) : (
        fallback
      )}
    </div>
  );
}
