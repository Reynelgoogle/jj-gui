/**
 * Toast.tsx
 *
 * Floating feedback alerts for command completion, sync events, and error diagnosis.
 */

import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import type { ToastMessage } from '../hooks/useJJ';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-8 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none select-none">
      {toasts.map(toast => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 rounded-xl border shadow-xl flex items-start gap-3 transition-all duration-200 animate-in slide-in-from-bottom-3 ${
              isSuccess
                ? 'bg-[#181825] border-[#a6e3a1]/60 text-[#cdd6f4]'
                : isError
                ? 'bg-[#181825] border-[#f38ba8]/60 text-[#cdd6f4]'
                : 'bg-[#181825] border-[#89b4fa]/60 text-[#cdd6f4]'
            }`}
          >
            {isSuccess && <CheckCircle2 className="w-4 h-4 text-[#a6e3a1] shrink-0 mt-0.5" />}
            {isError && <AlertCircle className="w-4 h-4 text-[#f38ba8] shrink-0 mt-0.5" />}
            {!isSuccess && !isError && <Info className="w-4 h-4 text-[#89b4fa] shrink-0 mt-0.5" />}

            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-[#cdd6f4] leading-tight">
                {toast.title}
              </h4>
              {toast.message && (
                <p className="text-[11px] text-[#a6adc8] mt-0.5 break-words font-mono">
                  {toast.message}
                </p>
              )}
            </div>

            <button
              onClick={() => onRemove(toast.id)}
              className="p-1 rounded-lg text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
