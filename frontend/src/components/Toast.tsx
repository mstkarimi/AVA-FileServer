import { useState, useCallback, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let counter = 0;
type AddToast = (message: string, type?: ToastType) => void;
let globalAdd: AddToast = () => {};

export function toast(message: string, type: ToastType = 'info') {
  globalAdd(message, type);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const add: AddToast = useCallback((message, type = 'info') => {
    const id = ++counter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  useEffect(() => {
    globalAdd = add;
  }, [add]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg pointer-events-auto text-sm
            ${t.type === 'success' ? 'bg-green-900 border border-green-700 text-green-200' : ''}
            ${t.type === 'error' ? 'bg-red-900 border border-red-700 text-red-200' : ''}
            ${t.type === 'info' ? 'bg-slate-700 border border-slate-600 text-slate-200' : ''}
          `}
        >
          {t.type === 'success' && <CheckCircle size={16} className="mt-0.5 shrink-0" />}
          {t.type === 'error' && <AlertCircle size={16} className="mt-0.5 shrink-0" />}
          {t.type === 'info' && <Info size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => setToasts(prev => prev.filter(t2 => t2.id !== t.id))}
            className="shrink-0 opacity-60 hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
