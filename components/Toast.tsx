
import React, { useEffect } from 'react';
import { Icons } from '../constants';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-xs pointer-events-none" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  const bgClass = {
    success: 'bg-[#c9a84c] border-emerald-400/20',
    error: 'bg-red-500 border-red-400/20',
    info: 'bg-indigo-500 border-indigo-400/20',
  }[toast.type];

  return (
    <div className={`${bgClass} border text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom-4 fade-in pointer-events-auto`}>
      <p className="text-xs font-black uppercase tracking-tight">{toast.message}</p>
      <button onClick={() => onRemove(toast.id)} aria-label="Close notification" className="opacity-50 hover:opacity-100 transition-opacity">
        <Icons.X className="w-3 h-3" />
      </button>
    </div>
  );
};

export default Toast;
