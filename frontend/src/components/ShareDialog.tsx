import { useState, useEffect } from 'react';
import { X, Copy, ExternalLink, CheckCircle } from 'lucide-react';
import api from '../api/client';
import { toast } from './Toast';

interface Props {
  filePath: string;
  fileName: string;
  isFolder?: boolean;
  onClose: () => void;
}

export default function ShareDialog({ filePath, fileName, isFolder, onClose }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const body: { filePath: string; type?: 'file' | 'folder' } = { filePath };
    if (isFolder) body.type = 'folder';
    api.post('/shares', body)
      .then(res => setUrl(res.data.url))
      .catch(() => toast('Failed to create share link', 'error'))
      .finally(() => setLoading(false));
  }, [filePath, isFolder]);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast('Link copied!', 'success');
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="font-semibold text-white">Share File</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-6">
          <p dir="auto" className="text-sm text-slate-400 mb-4 truncate">{fileName}</p>

          {loading ? (
            <div className="h-12 bg-slate-700 rounded-lg animate-pulse" />
          ) : (
            <>
              <div className="flex items-center gap-2 bg-slate-700 rounded-lg px-3 py-2 mb-4">
                <span className="flex-1 text-sm text-slate-300 truncate font-mono">{url}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copy}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 text-sm font-medium transition-colors"
                >
                  {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg px-4 py-2 text-sm transition-colors"
                >
                  <ExternalLink size={16} /> Test
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
