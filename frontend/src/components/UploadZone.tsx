import { useState, useRef, DragEvent } from 'react';
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import api from '../api/client';
import { toast } from './Toast';

interface UploadItem {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface Props {
  currentPath: string;
  onDone: () => void;
  onClose: () => void;
}

export default function UploadZone({ currentPath, onDone, onClose }: Props) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: File[]) {
    setItems(prev => [
      ...prev,
      ...files.map(f => ({ file: f, status: 'pending' as const })),
    ]);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  async function uploadAll() {
    setUploading(true);
    for (let i = 0; i < items.length; i++) {
      if (items[i].status !== 'pending') continue;
      setItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'uploading' } : it));

      const fd = new FormData();
      fd.append('files', items[i].file, items[i].file.name);

      try {
        await api.post('/files/upload', fd, {
          params: { path: currentPath },
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'done' } : it));
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Upload failed';
        setItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'error', error: msg } : it));
      }
    }
    setUploading(false);
    toast('Upload complete', 'success');
    onDone();
  }

  const hasPending = items.some(i => i.status === 'pending');

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="font-semibold text-white">Upload Files</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
          className={`m-4 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
            ${dragging ? 'border-blue-500 bg-blue-900/20' : 'border-slate-600 hover:border-slate-500'}
          `}
        >
          <Upload size={32} className="mx-auto mb-2 text-slate-400" />
          <p className="text-slate-400 text-sm">Drag & drop files here or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => addFiles(Array.from(e.target.files || []))}
          />
        </div>

        {items.length > 0 && (
          <div className="mx-4 mb-4 max-h-48 overflow-y-auto space-y-1">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-slate-700/50 rounded-lg px-3 py-2 text-sm">
                {item.status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-slate-500 shrink-0" />}
                {item.status === 'uploading' && <Loader2 size={16} className="shrink-0 animate-spin text-blue-400" />}
                {item.status === 'done' && <CheckCircle size={16} className="shrink-0 text-green-400" />}
                {item.status === 'error' && <AlertCircle size={16} className="shrink-0 text-red-400" />}
                <span dir="auto" className="flex-1 truncate text-slate-300">{item.file.name}</span>
                {item.error && <span className="text-red-400 text-xs">{item.error}</span>}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={uploadAll}
            disabled={!hasPending || uploading}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-lg py-2 font-medium text-sm transition-colors"
          >
            {uploading ? 'Uploading…' : `Upload ${items.filter(i => i.status === 'pending').length} file(s)`}
          </button>
          <button onClick={onClose} className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg py-2 text-sm transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
