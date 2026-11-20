/**
 * SplitModal.tsx
 *
 * Non-interactive commit splitter dialog.
 *
 * `jj split` is always executed with an explicit message (`-m`) and a list of
 * filesets, so the CLI never opens an editor and the GUI never hangs. The file
 * list comes from the real diff of the selected revision.
 */

import React, { useEffect, useState } from 'react';
import { GitFork, X, FileCode, CheckSquare, Square, AlertTriangle } from 'lucide-react';
import type { JJCommit, JJDiffData } from '../types/jj';
import { useLanguage } from '../i18n/LanguageContext';

interface SplitModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCommit: JJCommit | null;
  diffData: JJDiffData | null;
  onSplit: (revision: string, filesToSplitOff?: string[], message?: string) => Promise<boolean>;
}

export function SplitModal({
  isOpen,
  onClose,
  selectedCommit,
  diffData,
  onSplit,
}: SplitModalProps) {
  const { t } = useLanguage();
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const targetRev = selectedCommit?.is_working_copy ? '@' : selectedCommit?.change_id || '@';
  const availableFiles = diffData?.files?.map(file => file.path) || [];

  // Reset the form every time the dialog opens or the target revision changes.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedFiles([]);
    setMessage('');
    setError(null);
    setIsProcessing(false);
  }, [isOpen, targetRev]);

  if (!isOpen) return null;

  const toggleFile = (path: string) => {
    setError(null);
    setSelectedFiles(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path],
    );
  };

  const handleSplitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      setError(t('split_no_selection'));
      return;
    }
    setError(null);
    setIsProcessing(true);
    try {
      const ok = await onSplit(targetRev, selectedFiles, message.trim() || undefined);
      if (ok) {
        onClose();
      } else {
        setError(t('split_failed'));
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const canSubmit = availableFiles.length > 0 && selectedFiles.length > 0 && !isProcessing;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-[#181825] border border-[#313244] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-3.5 border-b border-[#313244] bg-[#181825] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitFork className="w-4 h-4 text-[#cba6f7]" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#cdd6f4]">
              {t('split_modal_title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSplitSubmit} className="p-5 space-y-4">
          <p className="text-xs text-[#bac2de] leading-relaxed">
            {t('split_modal_desc', { rev: targetRev })}
          </p>

          <div>
            <span className="text-[10px] font-bold text-[#585b70] uppercase tracking-wider block mb-2">
              {t('split_files_title')} ({availableFiles.length})
            </span>

            {availableFiles.length === 0 ? (
              <div className="p-3 rounded-lg bg-[#11111b] border border-dashed border-[#313244] text-center text-xs text-[#585b70]">
                {t('split_files_empty')}
              </div>
            ) : (
              <>
                <p className="text-[11px] text-[#585b70] mb-1.5">{t('split_select_hint')}</p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-[#313244]">
                  {availableFiles.map(path => {
                    const isChecked = selectedFiles.includes(path);
                    return (
                      <div
                        key={path}
                        onClick={() => toggleFile(path)}
                        className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-[#313244] border-[#cba6f7] text-[#cdd6f4]'
                            : 'bg-[#11111b] border-[#313244] text-[#bac2de] hover:border-[#45475a]'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-mono text-xs truncate">
                          <FileCode className="w-4 h-4 text-[#89b4fa]" />
                          <span className="truncate">{path}</span>
                        </div>

                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-[#cba6f7]" />
                        ) : (
                          <Square className="w-4 h-4 text-[#585b70]" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div>
            <label className="text-[10px] font-bold text-[#585b70] uppercase tracking-wider block mb-1.5">
              {t('split_message_label')}
            </label>
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t('split_message_placeholder')}
              className="w-full bg-[#11111b] border border-[#313244] rounded-lg px-3 py-2 text-xs text-[#cdd6f4] placeholder-[#585b70] focus:outline-none focus:border-[#cba6f7]"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[11px] text-[#f38ba8]">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-2.5 bg-[#11111b] rounded-lg border border-[#313244] text-[11px] text-[#585b70] font-mono break-all">
            $ jj split -r {targetRev} -m "{message.trim() || '...'}" {selectedFiles.map(f => `"${f}"`).join(' ')}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs text-[#bac2de] hover:bg-[#313244]"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 rounded-lg bg-[#cba6f7] hover:bg-[#b4befe] text-[#11111b] text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              <GitFork className="w-4 h-4" />
              <span>{isProcessing ? t('split_executing') : t('split_execute_btn')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
