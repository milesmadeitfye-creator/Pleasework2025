import { useEffect } from 'react';
import { CheckCircle, XCircle, Info, AlertCircle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle className="w-6 h-6" />,
    error: <XCircle className="w-6 h-6" />,
    info: <Info className="w-6 h-6" />,
    warning: <AlertCircle className="w-6 h-6" />,
  };

  const colors = {
    success: 'bg-green-500/10 border-green-500/50 text-green-400',
    error: 'bg-red-500/10 border-red-500/50 text-red-400',
    info: 'bg-blue-500/10 border-blue-500/50 text-blue-400',
    warning: 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400',
  };

  return (
    <div
      className={`relative flex items-center gap-3 px-6 py-4 rounded-xl border backdrop-blur-xl shadow-2xl animate-slideIn pointer-events-auto ${colors[type]}`}
      style={{
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      {icons[type]}
      <p className="font-medium">{message}</p>
      <button
        onClick={onClose}
        className="ml-2 hover:opacity-70 transition-opacity"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

export function useToast() {
  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    const event = new CustomEvent('show-toast', { detail: { message, type } });
    window.dispatchEvent(event);
  };

  return { showToast };
}
