/**
 * CommandLogModal.tsx
 *
 * Real-time CLI execution log auditor for Jujutsu VCS.
 * Inspects raw command lines, parameters, exit codes, execution durations,
 * stdout/stderr streams, and JSON parsed payloads.
 */

import React, { useEffect, useState } from 'react';
import { Terminal, CheckCircle2, XCircle, Copy, Check, X } from 'lucide-react';
import type { JJExecutionLog, JJOperationLogEntry } from '../types/jj';
import { useLanguage } from '../i18n/LanguageContext';

interface CommandLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: JJExecutionLog[];
  operations?: JJOperationLogEntry[];
}

export function CommandLogModal({ isOpen, onClose, logs, operations = [] }: CommandLogModalProps) {
  const { t } = useLanguage();
  const [selectedLogIndex, setSelectedLogIndex] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // The log list grows while the modal is open; reset the selection each
  // time it opens so it never points at a different command than shown.
  useEffect(() => {
    if (isOpen) setSelectedLogIndex(0);
  }, [isOpen]);

  if (!isOpen) return null;

  const activeLog = logs[selectedLogIndex] || logs[0];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-[#181825] border border-[#313244] rounded-2xl w-full max-w-4xl h-[600px] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-3.5 border-b border-[#313244] bg-[#181825] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#89b4fa]" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#cdd6f4]">
              {t('logs_modal_title')}
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#11111b] text-[#89b4fa] border border-[#313244]">
              {logs.length} {t('logs_operations_count')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2-Column Split: Log list on left, Log details on right */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Operations List */}
          <div className="w-1/3 border-r border-[#313244] overflow-y-auto bg-[#11111b] p-2 space-y-1 scrollbar-thin scrollbar-thumb-[#313244]">
            {logs.length === 0 ? (
              <div className="p-4 text-center text-xs text-[#585b70]">
                {t('logs_empty')}
              </div>
            ) : (
              logs.map((log, idx) => {
                const isSelected = idx === selectedLogIndex;
                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLogIndex(idx)}
                    className={`p-2 rounded-lg cursor-pointer transition-colors border text-xs ${
                      isSelected
                        ? 'bg-[#1e1e2e] border-[#89b4fa] text-[#cdd6f4]'
                        : 'bg-[#181825] border-transparent hover:bg-[#1e1e2e]/50 text-[#bac2de]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#89b4fa] truncate max-w-[140px]">
                        {log.success ? (
                          <CheckCircle2 className="w-3 h-3 text-[#a6e3a1]" />
                        ) : (
                          <XCircle className="w-3 h-3 text-[#f38ba8]" />
                        )}
                        <span>jj {log.args[0] || 'status'}</span>
                      </div>
                      <span className="text-[10px] text-[#585b70] font-mono">
                        {log.duration_ms}ms
                      </span>
                    </div>

                    <div className="text-[10px] text-[#585b70] truncate font-mono">
                      {log.command} {log.args.join(' ')}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Detailed Output Inspector */}
          <div className="flex-1 flex flex-col bg-[#181825] overflow-hidden">
            {operations.length > 0 && (
              <div className="px-4 pt-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#585b70] block mb-1">
                  {t('logs_operations_title')} ({operations.length})
                </span>
                <div className="max-h-28 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-[#313244]">
                  {operations.map(op => (
                    <div key={op.id} className="p-2 bg-[#11111b] rounded border border-[#313244] text-[11px] text-[#bac2de] flex items-center justify-between gap-2">
                      <span className="truncate">{op.description}</span>
                      <span className="text-[#585b70] shrink-0 font-mono">{op.timestamp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeLog ? (
              <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-3 font-mono text-xs select-text scrollbar-thin scrollbar-thumb-[#313244]">
                {/* Command Line Box */}
                <div className="p-3 bg-[#11111b] rounded-lg border border-[#313244] flex items-center justify-between">
                  <div className="text-[#89b4fa] font-bold">
                    $ {activeLog.command} {activeLog.args.join(' ')}
                  </div>
                  <button
                    onClick={() => handleCopy(`${activeLog.command} ${activeLog.args.join(' ')}`, 'cmd')}
                    className="p-1 rounded hover:bg-[#313244] text-[#bac2de]"
                    title={t('logs_copy_btn')}
                  >
                    {copiedId === 'cmd' ? <Check className="w-3.5 h-3.5 text-[#a6e3a1]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Metadata Row */}
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="p-2 bg-[#11111b] rounded border border-[#313244]">
                    <span className="text-[#585b70] block text-[10px] uppercase font-bold">{t('logs_exit_code')}</span>
                    <span className={activeLog.exit_code === 0 ? 'text-[#a6e3a1] font-bold' : 'text-[#f38ba8] font-bold'}>
                      {activeLog.exit_code} ({activeLog.success ? t('logs_exit_success') : t('logs_exit_failure')})
                    </span>
                  </div>

                  <div className="p-2 bg-[#11111b] rounded border border-[#313244]">
                    <span className="text-[#585b70] block text-[10px] uppercase font-bold">{t('logs_duration')}</span>
                    <span className="text-[#cdd6f4] font-bold">{activeLog.duration_ms} ms</span>
                  </div>

                  <div className="p-2 bg-[#11111b] rounded border border-[#313244]">
                    <span className="text-[#585b70] block text-[10px] uppercase font-bold">{t('logs_timestamp')}</span>
                    <span className="text-[#cdd6f4] truncate block">
                      {new Date(activeLog.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {/* Raw stdout output */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#585b70] block mb-1">
                    {t('logs_stdout')}
                  </span>
                  <pre className="p-3 bg-[#11111b] border border-[#313244] rounded-lg text-[11px] text-[#cdd6f4] overflow-x-auto max-h-40 scrollbar-thin">
                    {activeLog.stdout || '<empty stdout>'}
                  </pre>
                </div>

                {/* Raw stderr if any */}
                {activeLog.stderr && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#f38ba8] block mb-1">
                      {t('logs_stderr')}
                    </span>
                    <pre className="p-3 bg-[#f38ba8]/10 border border-[#f38ba8]/30 rounded-lg text-[11px] text-[#f38ba8] overflow-x-auto max-h-32">
                      {activeLog.stderr}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-[#585b70]">
                {t('logs_empty')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
