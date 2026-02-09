import { useState, useEffect } from 'react';

let toastListeners = [];
let toastIdCounter = 0;

export function showToast(message, type = 'error', duration = 5000) {
  const id = toastIdCounter++;
  const toast = { id, message, type, duration };
  toastListeners.forEach(listener => listener(toast));
  return id;
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const listener = (toast) => {
      setToasts(prev => [...prev, toast]);
      
      // Auto-remove after duration
      if (toast.duration > 0) {
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toast.id));
        }, toast.duration);
      }
    };

    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  }, []);

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto min-w-[300px] max-w-md p-4 rounded-lg shadow-xl border ${
            toast.type === 'error'
              ? 'bg-red-500/90 border-red-600 text-white'
              : toast.type === 'success'
              ? 'bg-green-500/90 border-green-600 text-white'
              : 'bg-blue-500/90 border-blue-600 text-white'
          } animate-in slide-in-from-right`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium flex-1">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-white/80 hover:text-white text-xl leading-none"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
