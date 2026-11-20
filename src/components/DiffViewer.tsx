/**
 * DiffViewer.tsx
 *
 * Plain-text diff visualizer for Jujutsu.
 * Supports unified and side-by-side views, file tabs, per-file
 * additions/deletions statistics, and green/red line styling.
 * Very long files are capped so a huge diff cannot freeze the UI.
 */

import React, { useEffect, useState } from 'react';
import {
  FileCode,
  Columns,
  AlignLeft,
  FileDiff,
  FilePlus,
  FileMinus,
} from 'lucide-react';
import type { JJDiffData, JJDiffLine, JJFileDiff } from '../types/jj';
import { useLanguage } from '../i18n/LanguageContext';

const MAX_LINES_PER_FILE = 2000;

interface DiffViewerProps {
  diffData: JJDiffData | null;
  selectedRevisionName?: string;
  onFileSelect?: (path: string) => void;
  selectedFilePath?: string | null;
  loading?: boolean;
}

type SplitRow =
  | { kind: 'header'; line: JJDiffLine }
  | { kind: 'context'; line: JJDiffLine }
  | { kind: 'pair'; left: JJDiffLine | null; right: JJDiffLine | null };

function toSplitRows(lines: JJDiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.type === 'header') {
      rows.push({ kind: 'header', line });
      i += 1;
      continue;
    }
    if (line.type === 'context') {
      rows.push({ kind: 'context', line });
      i += 1;
      continue;
    }
    // Run of adds/deletes: pair them by position so changed lines sit
    // side by side instead of stacking all deletes above all adds.
    const deletes: JJDiffLine[] = [];
    const adds: JJDiffLine[] = [];
    while (i < lines.length && (lines[i].type === 'delete' || lines[i].type === 'add')) {
      if (lines[i].type === 'delete') deletes.push(lines[i]);
      else adds.push(lines[i]);
      i += 1;
    }
    const count = Math.max(deletes.length, adds.length);
    for (let k = 0; k < count; k++) {
      rows.push({ kind: 'pair', left: deletes[k] || null, right: adds[k] || null });
    }
  }
  return rows;
}

export function DiffViewer({
  diffData,
  selectedRevisionName = '@',
  onFileSelect,
  selectedFilePath,
  loading = false,
}: DiffViewerProps) {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  // Keep the active tab in sync with the selected file (and reset it whenever
  // the revision/diff changes so we never point at a stale index).
  useEffect(() => {
    if (!diffData || diffData.files.length === 0) {
      setActiveFileIndex(0);
      return;
    }
    if (selectedFilePath) {
      const index = diffData.files.findIndex(file => file.path === selectedFilePath);
      if (index >= 0) {
        setActiveFileIndex(index);
        return;
      }
    }
    setActiveFileIndex(0);
  }, [diffData, selectedFilePath]);

  if (!diffData || !diffData.files || diffData.files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-[#6c7086] bg-[#181825]">
        <FileDiff className="w-12 h-12 mb-3 text-[#313244]" />
        {loading ? (
          <h3 className="text-sm font-semibold text-[#cdd6f4] mb-1">{t('diff_loading')}</h3>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-[#cdd6f4] mb-1">{t('diff_empty_title')}</h3>
            <p className="text-xs max-w-sm">
              {t('diff_empty_desc', { rev: selectedRevisionName })}
            </p>
          </>
        )}
      </div>
    );
  }

  const activeFile =
    diffData.files.find(file => file.path === selectedFilePath) ||
    diffData.files[activeFileIndex] ||
    diffData.files[0];
  const { summary } = diffData;
  const visibleLines = activeFile.lines.slice(0, MAX_LINES_PER_FILE);
  const truncated = activeFile.lines.length > MAX_LINES_PER_FILE;

  const statusLabel = (status: string) => {
    switch (status) {
      case 'added':
        return t('diff_status_added');
      case 'deleted':
        return t('diff_status_deleted');
      case 'modified':
        return t('diff_status_modified');
      case 'conflict':
        return t('diff_status_conflict');
      case 'renamed':
        return t('diff_status_renamed');
      default:
        return status;
    }
  };

  const renderUnifiedLine = (line: JJDiffLine, key: number) => {
    if (line.type === 'header') {
      return (
        <div key={key} className="px-3 py-1 bg-[#181825] text-[#89b4fa] text-[11px] font-semibold">
          {line.content}
        </div>
      );
    }
    if (line.type === 'add') {
      return (
        <div key={key} className="flex items-stretch bg-[#a6e3a1]/10 text-[#a6e3a1] hover:bg-[#a6e3a1]/15 transition-colors">
          <span className="w-10 py-0.5 px-2 text-right text-[11px] text-[#a6e3a1]/60 select-none bg-[#a6e3a1]/5">
            {line.newLineNumber}
          </span>
          <span className="w-6 py-0.5 text-center text-[#a6e3a1] select-none font-bold">+</span>
          <span className="py-0.5 px-2 flex-1 whitespace-pre-wrap break-all">{line.content}</span>
        </div>
      );
    }
    if (line.type === 'delete') {
      return (
        <div key={key} className="flex items-stretch bg-[#f38ba8]/10 text-[#f38ba8] hover:bg-[#f38ba8]/15 transition-colors">
          <span className="w-10 py-0.5 px-2 text-right text-[11px] text-[#f38ba8]/60 select-none bg-[#f38ba8]/5">
            {line.oldLineNumber}
          </span>
          <span className="w-6 py-0.5 text-center text-[#f38ba8] select-none font-bold">-</span>
          <span className="py-0.5 px-2 flex-1 whitespace-pre-wrap break-all">{line.content}</span>
        </div>
      );
    }
    return (
      <div key={key} className="flex items-stretch text-[#bac2de] hover:bg-[#181825]/40 transition-colors">
        <span className="w-10 py-0.5 px-2 text-right text-[11px] text-[#585b70] select-none">
          {line.newLineNumber || line.oldLineNumber}
        </span>
        <span className="w-6 py-0.5 text-center text-[#585b70] select-none"> </span>
        <span className="py-0.5 px-2 flex-1 whitespace-pre-wrap break-all text-[#cdd6f4]">{line.content}</span>
      </div>
    );
  };

  const renderSplitCell = (line: JJDiffLine | null, side: 'left' | 'right') => {
    if (!line) return <div className="flex-1 bg-[#181825]/30" />;
    const isAdd = line.type === 'add';
    const isDelete = line.type === 'delete';
    const num = side === 'left' ? line.oldLineNumber : line.newLineNumber;
    return (
      <div
        className={`flex items-stretch flex-1 min-w-0 ${
          isAdd ? 'bg-[#a6e3a1]/10 text-[#a6e3a1]' : isDelete ? 'bg-[#f38ba8]/10 text-[#f38ba8]' : 'text-[#cdd6f4]'
        }`}
      >
        <span className="w-9 py-0.5 px-2 text-right text-[11px] text-[#585b70] select-none shrink-0">
          {num}
        </span>
        <span className="w-5 py-0.5 text-center select-none font-bold shrink-0">
          {isAdd ? '+' : isDelete ? '-' : ' '}
        </span>
        <span className="py-0.5 px-2 flex-1 whitespace-pre-wrap break-all">{line.content}</span>
      </div>
    );
  };

  const renderSplitLine = (row: SplitRow, key: number) => {
    if (row.kind === 'header') {
      return (
        <div key={key} className="px-3 py-1 bg-[#181825] text-[#89b4fa] text-[11px] font-semibold">
          {row.line.content}
        </div>
      );
    }
    if (row.kind === 'context') {
      return (
        <div key={key} className="flex items-stretch text-[#bac2de] hover:bg-[#181825]/40 transition-colors">
          {renderSplitCell(row.line, 'left')}
          {renderSplitCell(row.line, 'right')}
        </div>
      );
    }
    return (
      <div key={key} className="flex items-stretch">
        {renderSplitCell(row.left, 'left')}
        {renderSplitCell(row.right, 'right')}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] border-r border-[#313244] overflow-hidden select-none">
      {/* Diff Header Bar */}
      <div className="p-3 text-xs font-bold uppercase tracking-widest text-[#585b70] border-b border-[#313244] flex justify-between items-center bg-[#181825] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="w-4 h-4 text-[#89b4fa] shrink-0" />
          <span className="truncate">
            {t('diff_title')} {selectedRevisionName}
          </span>
          <span className="text-[10px] lowercase text-[#89b4fa] bg-[#89b4fa]/10 px-2 py-0.5 rounded font-mono">
            {diffData.files.length} {t('diff_files_changed')}
          </span>
        </div>

        {/* View Mode Toggle (Unified vs Split) */}
        <div className="flex items-center gap-1 bg-[#11111b] p-0.5 rounded-lg border border-[#313244]">
          <button
            onClick={() => setViewMode('unified')}
            className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${
              viewMode === 'unified'
                ? 'bg-[#313244] text-[#cdd6f4]'
                : 'text-[#585b70] hover:text-[#cdd6f4]'
            }`}
            title={t('diff_unified')}
          >
            <AlignLeft className="w-3.5 h-3.5" />
            <span>{t('diff_unified')}</span>
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${
              viewMode === 'split'
                ? 'bg-[#313244] text-[#cdd6f4]'
                : 'text-[#585b70] hover:text-[#cdd6f4]'
            }`}
            title={t('diff_split')}
          >
            <Columns className="w-3.5 h-3.5" />
            <span>{t('diff_split')}</span>
          </button>
        </div>
      </div>

      {/* Main Diff Content with File List Tab Strip */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Horizontal File Tabs */}
        <div className="flex items-center gap-1 px-3 py-1.5 bg-[#11111b] border-b border-[#313244] overflow-x-auto scrollbar-none">
          {diffData.files.map((file, idx) => {
            const isActive = idx === activeFileIndex;
            return (
              <button
                key={file.path}
                onClick={() => {
                  setActiveFileIndex(idx);
                  onFileSelect?.(file.path);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-mono flex items-center gap-1.5 whitespace-nowrap transition-all border ${
                  isActive
                    ? 'bg-[#181825] text-[#89b4fa] border-[#89b4fa]/50 shadow-sm'
                    : 'bg-transparent text-[#585b70] hover:text-[#bac2de] border-transparent hover:bg-[#181825]/40'
                }`}
              >
                {file.status === 'added' ? (
                  <FilePlus className="w-3 h-3 text-[#a6e3a1]" />
                ) : file.status === 'deleted' ? (
                  <FileMinus className="w-3 h-3 text-[#f38ba8]" />
                ) : (
                  <FileCode className="w-3 h-3 text-[#89b4fa]" />
                )}
                <span>{file.path.split('/').pop()}</span>
                <span className="text-[10px] text-[#585b70]">
                  (+{file.additions}/-{file.deletions})
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected File Diff Content */}
        <div className="flex-1 overflow-auto p-3 font-mono text-[13px] scrollbar-thin scrollbar-thumb-[#313244]">
          <div className="bg-[#11111b] rounded-lg border border-[#313244] overflow-hidden">
            {/* File Path Header */}
            <div className="p-2 bg-[#313244]/40 border-b border-[#313244] flex items-center justify-between text-xs text-[#bac2de]">
              <span className="font-semibold text-[#cdd6f4] truncate">
                {activeFile.status === 'renamed' && activeFile.old_path
                  ? `${activeFile.old_path} → ${activeFile.path}`
                  : activeFile.path}
              </span>
              <span className="text-[11px] text-[#585b70] uppercase shrink-0">
                {statusLabel(activeFile.status)}
              </span>
            </div>

            {/* Line Rendering */}
            {activeFile.is_binary ? (
              <div className="p-4 text-xs text-[#585b70] text-center">{t('diff_binary')}</div>
            ) : (
              <div className="divide-y divide-[#1e1e2e]/50 select-text">
                {viewMode === 'split'
                  ? toSplitRows(visibleLines).map((row, i) => renderSplitLine(row, i))
                  : visibleLines.map((line, i) => renderUnifiedLine(line, i))}
              </div>
            )}
            {activeFile.no_newline_at_eof && (
              <div className="px-3 py-1 bg-[#181825] text-[#f9e2af] text-[11px]">
                \ {t('diff_no_newline')}
              </div>
            )}
            {truncated && (
              <div className="px-3 py-1 bg-[#181825] text-[#585b70] text-[11px]">
                {t('diff_truncated', { n: MAX_LINES_PER_FILE, total: activeFile.lines.length })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-2.5 bg-[#11111b] border-t border-[#313244] text-[10px] text-[#585b70] flex items-center justify-between shrink-0">
        <span className="font-mono text-[#89b4fa]">jj diff -r {selectedRevisionName}</span>
        <span>{diffData.files.length} {t('diff_files_changed')}</span>
      </div>
    </div>
  );
}
