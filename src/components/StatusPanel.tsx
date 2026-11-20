/**
 * StatusPanel.tsx
 *
 * Visual representation of `jj status`.
 * Displays the current working copy (@) change ID, parent commits,
 * modified, added, deleted, conflicted, and untracked files with file stats.
 */

import React from 'react';
import {
  FileCode,
  FilePlus,
  FileMinus,
  FileDiff,
  AlertOctagon,
  Sparkles,
  GitCommit,
  CheckCircle2,
  RefreshCw,
  FileInput,
} from 'lucide-react';
import type { JJStatus, JJFileChange } from '../types/jj';
import { useLanguage } from '../i18n/LanguageContext';

interface StatusPanelProps {
  status: JJStatus | null;
  loading: boolean;
  onRefresh: () => void;
  onSelectFile?: (filePath: string) => void;
  selectedFilePath?: string | null;
  onResolveConflict?: (filePath: string, side: 'ours' | 'theirs') => Promise<boolean>;
}

export function StatusPanel({
  status,
  loading,
  onRefresh,
  onSelectFile,
  selectedFilePath,
  onResolveConflict,
}: StatusPanelProps) {
  const { t } = useLanguage();

  if (!status) {
    return (
      <div className="p-6 text-center text-[#6c7086]">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#89b4fa]" />
        <p className="text-xs">{t('status_loading')}</p>
      </div>
    );
  }

  const { working_copy, parent_commits, modified_files, conflicted_files } = status;
  // `modified_files` already comes from `jj diff`, which includes conflicted
  // paths, so count files once.
  const totalChanges = modified_files.length;

  const getFileIcon = (type: JJFileChange['type']) => {
    switch (type) {
      case 'added':
        return <FilePlus className="w-3.5 h-3.5 text-[#a6e3a1]" />;
      case 'deleted':
        return <FileMinus className="w-3.5 h-3.5 text-[#f38ba8]" />;
      case 'conflict':
        return <AlertOctagon className="w-3.5 h-3.5 text-[#f38ba8]" />;
      case 'renamed':
        return <FileInput className="w-3.5 h-3.5 text-[#f9e2af]" />;
      case 'modified':
      default:
        return <FileCode className="w-3.5 h-3.5 text-[#89b4fa]" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#181825] overflow-hidden select-none">
      {/* Header */}
      <div className="p-3 border-b border-[#313244] bg-[#181825] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <FileDiff className="w-4 h-4 text-[#89b4fa]" />
          <span className="text-xs font-bold uppercase tracking-widest text-[#585b70]">
            {t('status_title')}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#313244] text-[#bac2de]">
            {totalChanges} {t('status_changed_badge')}
          </span>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1 rounded text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244] transition-colors"
          title={t('status_refresh_tooltip')}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#89b4fa]' : ''}`} />
        </button>
      </div>

      {/* Content Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-[#313244]">
        {/* Working Copy Card */}
        <div className="p-3.5 rounded-lg bg-[#1e1e2e] border border-[#313244] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#89b4fa] text-[#11111b] uppercase">
                <Sparkles className="w-2.5 h-2.5" />
                {t('status_working_copy_title')}
              </span>
              <span className="font-mono text-xs font-semibold text-[#89b4fa]">
                {working_copy.change_id?.substring(0, 8)}
              </span>
            </div>
            {working_copy.is_empty ? (
              <span className="text-[10px] text-[#585b70] italic">{t('status_empty_tree')}</span>
            ) : (
              <span className="text-[10px] text-[#a6e3a1] font-medium flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" />
                {t('status_active_changes')}
              </span>
            )}
          </div>

          <p className="text-xs text-[#cdd6f4] font-medium truncate mb-2">
            {working_copy.description || <span className="text-[#585b70] italic">{t('status_no_description')}</span>}
          </p>

          {/* Parent Revisions */}
          <div className="pt-2 border-t border-[#313244]">
            <span className="text-[10px] text-[#585b70] uppercase font-bold tracking-wider block mb-1">
              {t('status_parent_revisions')}
            </span>
            {parent_commits.map(p => (
              <div
                key={p.change_id}
                className="flex items-center gap-2 text-[11px] text-[#bac2de] py-0.5"
              >
                <GitCommit className="w-3 h-3 text-[#cba6f7]" />
                <span className="font-mono text-[#cba6f7]">{p.change_id.substring(0, 8)}</span>
                <span className="truncate text-[#585b70]">{p.description}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Conflicts Alert Section */}
        {conflicted_files.length > 0 && (
          <div className="p-3 rounded-lg bg-[#f38ba8]/10 border border-[#f38ba8]/40 text-xs">
            <div className="flex items-center gap-2 text-[#f38ba8] font-semibold mb-1">
              <AlertOctagon className="w-4 h-4" />
              <span>{t('status_conflicts_title')} ({conflicted_files.length})</span>
            </div>
            <p className="text-[#cdd6f4] text-[11px] mb-2">
              {t('status_conflicts_desc')}
            </p>
            <ul className="space-y-1 font-mono text-[11px] text-[#f38ba8]">
              {conflicted_files.map(f => (
                <li key={f} className="flex items-center gap-1.5 bg-[#11111b]/80 p-1.5 rounded flex-wrap">
                  <span>⚠️</span>
                  <span className="flex-1 min-w-0 truncate">{f}</span>
                  {onResolveConflict && (
                    <>
                      <button
                        type="button"
                        onClick={() => void onResolveConflict(f, 'ours')}
                        className="px-2 py-0.5 rounded bg-[#89b4fa]/20 text-[#89b4fa] hover:bg-[#89b4fa]/30 font-sans font-semibold"
                        title="jj resolve --tool :ours"
                      >
                        {t('status_resolve_ours')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onResolveConflict(f, 'theirs')}
                        className="px-2 py-0.5 rounded bg-[#cba6f7]/20 text-[#cba6f7] hover:bg-[#cba6f7]/30 font-sans font-semibold"
                        title="jj resolve --tool :theirs"
                      >
                        {t('status_resolve_theirs')}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-[#585b70] mt-2 font-mono">{t('status_resolve_hint')}</p>
          </div>
        )}

        {/* Changed Files Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-widest text-[#585b70]">
              {t('status_modified_section')} ({modified_files.length})
            </span>
            <span className="text-[10px] text-[#585b70]">
              {modified_files.reduce((a, b) => a + b.additions, 0)}++ /{' '}
              {modified_files.reduce((a, b) => a + b.deletions, 0)}--
            </span>
          </div>

          {modified_files.length === 0 ? (
            <div className="p-4 rounded-lg bg-[#1e1e2e]/40 border border-dashed border-[#313244] text-center text-xs text-[#585b70]">
              {t('status_clean_state')}
            </div>
          ) : (
            <div className="space-y-1">
              {modified_files.map(file => {
                const isSelected = selectedFilePath === file.path;
                return (
                  <div
                    key={file.path}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectFile?.(file.path)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectFile?.(file.path);
                      }
                    }}
                    className={`flex items-center justify-between p-2 rounded-md text-xs cursor-pointer transition-colors border ${
                      isSelected
                        ? 'bg-[#313244] border-[#89b4fa] text-[#cdd6f4]'
                        : 'bg-[#1e1e2e] border-transparent hover:bg-[#313244]/50 text-[#bac2de] hover:text-[#cdd6f4]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      {getFileIcon(file.type)}
                      <span className="truncate font-mono text-[11px]">{file.path}</span>
                    </div>

                    <div className="flex items-center gap-1.5 font-mono text-[10px] shrink-0">
                      {file.additions > 0 && (
                        <span className="text-[#a6e3a1]">+{file.additions}</span>
                      )}
                      {file.deletions > 0 && (
                        <span className="text-[#f38ba8]">-{file.deletions}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Terminal Command Tip */}
      <div className="p-2.5 bg-[#11111b] border-t border-[#313244] text-[10px] text-[#585b70] flex items-center justify-between shrink-0">
        <span className="font-mono text-[#89b4fa]">jj status</span>
        <span>{t('status_auto_tracking')}</span>
      </div>
    </div>
  );
}
