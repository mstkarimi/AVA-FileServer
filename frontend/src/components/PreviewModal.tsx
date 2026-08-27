import { useEffect, useMemo, useState } from 'react';
import { X, Download, ChevronLeft, ChevronRight, AlertCircle, Loader2, Music } from 'lucide-react';

export interface PreviewItem {
  path: string;
  name: string;
}

interface Props {
  filePath: string;
  fileName: string;
  onClose: () => void;
  /**
   * Other previewable files in the same folder. When supplied, the modal gains
   * prev/next stepping so a folder of scans or recordings can be reviewed
   * without closing and reopening for every file.
   */
  siblings?: PreviewItem[];
}

type Kind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other';

const TEXT_EXT = ['txt', 'md', 'csv', 'log', 'json', 'xml', 'yml', 'yaml', 'srt', 'vtt', 'ini', 'conf'];

function kindOf(name: string): Kind {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus'].includes(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (TEXT_EXT.includes(ext)) return 'text';
  return 'other';
}

function urlFor(path: string): string {
  const token = localStorage.getItem('token') || '';
  return `/api/preview?path=${encodeURIComponent(path)}&t=${encodeURIComponent(token)}`;
}

export default function PreviewModal({ filePath, fileName, onClose, siblings }: Props) {
  // Position is tracked by PATH, not by index. The sibling list can arrive or
  // change after mount (e.g. opening a preview from search navigates the folder
  // first), and an index would then point at the wrong file. With a path, an
  // out-of-list file still previews correctly — stepping is simply disabled
  // until the folder it belongs to has loaded.
  const [curPath, setCurPath] = useState(filePath);
  useEffect(() => { setCurPath(filePath); }, [filePath]);

  const list = useMemo<PreviewItem[]>(() => siblings ?? [], [siblings]);
  const idx = list.findIndex(s => s.path === curPath);
  const current: PreviewItem = idx >= 0
    ? list[idx]
    : { path: curPath, name: curPath === filePath ? fileName : (curPath.split('/').pop() || fileName) };

  const kind = kindOf(current.name);
  const src = urlFor(current.path);
  const canStep = idx >= 0 && list.length > 1;

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [text, setText] = useState<string | null>(null);

  function step(delta: number) {
    if (idx < 0 || list.length < 2) return;
    setCurPath(list[(idx + delta + list.length) % list.length].path);
  }

  // Reset transient state whenever the previewed file changes.
  useEffect(() => {
    setText(null);
    // Types the browser renders itself report readiness via load/error events;
    // the rest have nothing to wait for.
    setStatus(kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'text' ? 'loading' : 'ready');
  }, [current.path, kind]);

  // Text files are fetched (they are small, and go through the same capped
  // endpoint as everything else — one request, no concurrency risk).
  useEffect(() => {
    if (kind !== 'text') return;
    const ctrl = new AbortController();
    // Range-bounded: a preview never needs more than the first 256 KB, and this
    // caps transfer, memory and how long the request holds a server stream slot
    // even when someone opens a multi-megabyte log. A 206 still reports ok.
    fetch(src, { headers: { Range: 'bytes=0-262143' }, signal: ctrl.signal })
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(t => { setText(t); setStatus('ready'); })
      .catch(e => { if (e.name !== 'AbortError') setStatus('error'); });
    return () => ctrl.abort();
  }, [src, kind]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Held-down arrows would otherwise fire dozens of times and start a new
      // file load per repeat.
      if (e.repeat) return;
      if (e.key === 'Escape') { onClose(); return; }
      // Arrow keys belong to the media element while it has focus (seeking and
      // volume), and to any text field.
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === 'VIDEO' || tag === 'AUDIO' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    }
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('modal-open');
    };
    // Re-bound whenever the position changes so the arrow keys never step from
    // a stale index.
  }, [onClose, idx, list]);

  const stepBtn =
    'p-2 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors backdrop-blur-sm disabled:opacity-30';

  return (
    <div
      className="fixed inset-0 bg-black/85 z-50 flex flex-col animate-[fadeIn_120ms_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${current.name}`}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/95 border-b border-slate-700 shrink-0">
        <h3 dir="auto" className="text-sm font-medium text-white truncate flex-1 min-w-0" title={current.name}>
          {current.name}
        </h3>
        {canStep && (
          <span className="text-xs text-slate-400 tabular-nums shrink-0">
            {idx + 1} / {list.length}
          </span>
        )}
        <a
          href={src}
          download={current.name}
          className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          <Download size={15} /> <span className="hidden sm:inline">Download</span>
        </a>
        <button onClick={onClose} aria-label="Close preview" className="text-slate-400 hover:text-white p-1 shrink-0">
          <X size={20} />
        </button>
      </div>

      {/* Body */}
      <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden">
        {canStep && (
          <button onClick={() => step(-1)} aria-label="Previous file" className={`absolute left-3 z-10 ${stepBtn}`}>
            <ChevronLeft size={22} />
          </button>
        )}

        {status === 'loading' && kind !== 'text' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 size={30} className="text-white/60 animate-spin" />
          </div>
        )}

        {status === 'error' ? (
          <div className="text-center text-slate-300">
            <AlertCircle size={40} className="mx-auto mb-3 opacity-60" />
            <p className="mb-4 text-sm">This file could not be loaded.</p>
            <a href={src} download={current.name} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">
              Download instead
            </a>
          </div>
        ) : kind === 'image' ? (
          <img
            key={src}
            src={src}
            alt={current.name}
            onLoad={() => setStatus('ready')}
            onError={() => setStatus('error')}
            className="max-w-full max-h-full object-contain rounded"
          />
        ) : kind === 'video' ? (
          <video
            key={src}
            controls
            preload="metadata"
            src={src}
            onLoadedMetadata={() => setStatus('ready')}
            onError={() => setStatus('error')}
            className="max-w-full max-h-full rounded"
          >
            Your browser does not support video.
          </video>
        ) : kind === 'audio' ? (
          <div className="bg-slate-800 rounded-2xl p-8 flex flex-col items-center gap-4 max-w-md w-full">
            <div className="w-20 h-20 rounded-2xl bg-sky-500/15 flex items-center justify-center">
              <Music size={36} className="text-sky-400" />
            </div>
            <p dir="auto" className="text-slate-300 text-sm text-center break-all">{current.name}</p>
            <audio
              key={src}
              controls
              preload="metadata"
              src={src}
              onLoadedMetadata={() => setStatus('ready')}
              onError={() => setStatus('error')}
              className="w-full"
            />
          </div>
        ) : kind === 'pdf' ? (
          <embed key={src} src={src} type="application/pdf" className="w-full h-full rounded bg-white" />
        ) : kind === 'text' ? (
          status === 'loading' ? (
            <Loader2 size={30} className="text-white/60 animate-spin" />
          ) : (
            <pre
              dir="auto"
              className="w-full h-full overflow-auto bg-slate-900 text-slate-200 text-xs leading-relaxed rounded-lg p-4 whitespace-pre-wrap break-words"
            >
              {text}
            </pre>
          )
        ) : (
          <div className="text-center text-slate-300">
            <AlertCircle size={40} className="mx-auto mb-3 opacity-60" />
            <p className="mb-4 text-sm">No preview available for this file type.</p>
            <a href={src} download={current.name} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">
              Download file
            </a>
          </div>
        )}

        {canStep && (
          <button onClick={() => step(1)} aria-label="Next file" className={`absolute right-3 z-10 ${stepBtn}`}>
            <ChevronRight size={22} />
          </button>
        )}
      </div>
    </div>
  );
}
