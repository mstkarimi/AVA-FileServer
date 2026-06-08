import { useState, useEffect } from 'react';
import { Copy, ExternalLink, CheckCircle } from 'lucide-react';
import api from '../api/client';
import Modal from './Modal';
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
    <Modal title={isFolder ? 'Share folder' : 'Share file'} onClose={onClose} maxWidth="max-w-md">
      <div className="p-6">
        <p dir="auto" className="text-sm text-slate-500 dark:text-slate-400 mb-4 truncate">{fileName}</p>

        {loading ? (
          <div className="h-12 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
        ) : (
          <>
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 mb-4">
              <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate font-mono">{url}</span>
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
                className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 rounded-lg px-4 py-2 text-sm transition-colors"
              >
                <ExternalLink size={16} /> Test
              </a>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
