import { X, Download } from 'lucide-react';

interface Props {
  filePath: string;
  fileName: string;
  onClose: () => void;
}

function getPreviewType(name: string): 'image' | 'video' | 'audio' | 'pdf' | 'other' {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  return 'other';
}

export default function PreviewModal({ filePath, fileName, onClose }: Props) {
  const type = getPreviewType(fileName);
  // Use /api/preview with auth (token sent via axios default header, but here we need a URL)
  // Build URL with token as query param for media elements that can't set headers
  const token = localStorage.getItem('token') || '';
  const previewUrl = `/api/preview?path=${encodeURIComponent(filePath)}&t=${encodeURIComponent(token)}`;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <h3 dir="auto" className="text-sm font-medium text-white truncate max-w-lg">{fileName}</h3>
        <div className="flex items-center gap-2">
          <a
            href={previewUrl}
            download={fileName}
            className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Download size={15} /> Download
          </a>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        {type === 'image' && (
          <img src={previewUrl} alt={fileName} className="max-w-full max-h-full object-contain rounded" />
        )}
        {type === 'video' && (
          <video controls src={previewUrl} className="max-w-full max-h-full rounded">
            Your browser does not support video.
          </video>
        )}
        {type === 'audio' && (
          <div className="bg-slate-800 rounded-2xl p-8 flex flex-col items-center gap-4 max-w-md w-full">
            <div className="text-5xl">🎵</div>
            <p dir="auto" className="text-slate-300 text-sm text-center">{fileName}</p>
            <audio controls src={previewUrl} className="w-full" />
          </div>
        )}
        {type === 'pdf' && (
          <embed src={previewUrl} type="application/pdf" className="w-full h-full rounded" />
        )}
        {type === 'other' && (
          <div className="text-center text-slate-400">
            <p className="mb-4">Preview not available for this file type.</p>
            <a href={previewUrl} download={fileName} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg">
              Download File
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
