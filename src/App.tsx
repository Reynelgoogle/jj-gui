/**
 * App.tsx
 *
 * Main Jujutsu (jj) Desktop & Web GUI layout:
 * - 3-Column layout: Commit Graph (DAG) | Diff Viewer | Describe & Status Panels
 * - Header with repository switcher, Git push/fetch sync, settings
 * - Action toolbar with quick execution for `jj new`, `jj commit`, `jj undo`, `jj split`
 * - Bottom status bar with real working copy metrics and execution state
 * - Integrated modals for Repo Switching, Commit Splitting, CLI Auditing, and Config
 */

import React, { useState } from 'react';
import { useJJ } from './hooks/useJJ';
import { jjApi } from './services/api';
import { CommitGraph } from './components/CommitGraph';
import { StatusPanel } from './components/StatusPanel';
import { DescribePanel } from './components/DescribePanel';
import { DiffViewer } from './components/DiffViewer';
import { ActionBar } from './components/ActionBar';
import { SyncPanel } from './components/SyncPanel';
import { RepoSelectorModal } from './components/RepoSelectorModal';
import { SplitModal } from './components/SplitModal';
import { CommandLogModal } from './components/CommandLogModal';
import { SettingsModal } from './components/SettingsModal';
import { ToastContainer } from './components/Toast';
import { useLanguage } from './i18n/LanguageContext';
import {
  FileDiff,
  Edit3,
  Sparkles,
  Terminal,
  Activity,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

export default function App() {
  const { t } = useLanguage();
  const {
    commits,
    status,
    selectedCommit,
    setSelectedCommit,
    diffData,
    repoInfo,
    executionLogs,
    operations,
    loading,
    actionInProgress,
    toasts,
    removeToast,
    config,
    setConfig,
    activeRepoPath,
    recentRepos,
    repoError,
    refresh,
    describe,
    newCommit,
    commitWorkingCopy,
    undoLastOperation,
    splitCommit,
    switchToCommit,
    abandonCommit,
    resolveConflict,
    mergeCommits,
    rebaseCommit,
    pushToRemote,
    fetchFromRemote,
    cloneRepo,
    openRepoDialog,
    switchRepo,
    createBookmark,
  } = useJJ();

  const [rightTab, setRightTab] = useState<'describe' | 'status'>('describe');
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isCommandLogModalOpen, setIsCommandLogModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  const isWorkingCopy = selectedCommit?.is_working_copy;
  const workingCopyChangeId = status?.working_copy?.change_id;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#181825] text-[#cdd6f4] overflow-hidden font-sans select-none">
      {/* Top Header: Repo Switcher, Remote Git Sync */}
      <SyncPanel
        repoInfo={repoInfo}
        currentBookmark={status?.current_bookmark}
        onPush={(remote) => pushToRemote(remote, status?.current_bookmark || undefined)}
        onFetch={fetchFromRemote}
        onOpenRepoSelector={() => setIsRepoModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        loading={loading}
      />

      {/* Real repository error banner */}
      {repoError && (
        <div className="flex items-start justify-between gap-3 px-4 py-2 bg-[#f38ba8]/10 border-b border-[#f38ba8]/40 text-xs text-[#f38ba8] shrink-0">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="font-semibold">{t('repo_error_title')}: </span>
              <span className="font-mono break-words">{repoError}</span>
            </div>
          </div>
          <button
            onClick={() => refresh(activeRepoPath)}
            className="shrink-0 flex items-center gap-1 px-2 py-1 rounded border border-[#f38ba8]/40 hover:bg-[#f38ba8]/15 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{t('repo_error_retry')}</span>
          </button>
        </div>
      )}

      {/* Action Toolbar: jj new, jj commit, jj undo, jj split, jj edit */}
      <ActionBar
        onNewCommit={() => newCommit()}
        onCommitWorkingCopy={commitWorkingCopy}
        onUndo={undoLastOperation}
        onSwitchToSelected={() => switchToCommit(selectedCommit?.change_id || '@')}
        canSwitch={!!selectedCommit && !selectedCommit.is_working_copy && !selectedCommit.is_immutable}
        onMerge={(rev1, rev2, message) => mergeCommits(rev1, rev2, message)}
        onRebase={(source, target) => rebaseCommit(source, target)}
        onAbandon={() => abandonCommit(selectedCommit?.change_id || '@')}
        canAbandon={!!selectedCommit && !selectedCommit.is_immutable}
        canMergeOrRebase={!!selectedCommit && !selectedCommit.is_working_copy && !selectedCommit.is_immutable}
        selectedChangeId={selectedCommit && !selectedCommit.is_working_copy ? selectedCommit.change_id : undefined}
        selectedRevisionName={selectedCommit ? (selectedCommit.is_working_copy ? '@' : selectedCommit.short_change_id) : undefined}
        onOpenSplitModal={() => setIsSplitModalOpen(true)}
        onOpenCommandLogs={() => setIsCommandLogModalOpen(true)}
        loading={loading}
        actionInProgress={actionInProgress}
      />

      {/* Main 3-Column Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Column 1: Commit Graph DAG (38% width) */}
        <div className="w-[38%] min-w-[320px] flex flex-col h-full overflow-hidden">
          <CommitGraph
            commits={commits}
            loading={loading}
            selectedCommit={selectedCommit}
            onSelectCommit={commit => {
              setSelectedCommit(commit);
              setSelectedFilePath(null);
            }}
          />
        </div>

        {/* Column 2: Diff Viewer */}
        <div className="flex-1 min-w-[340px] flex flex-col h-full overflow-hidden border-r border-[#313244]">
          <DiffViewer
            diffData={diffData}
            loading={loading}
            selectedRevisionName={isWorkingCopy ? '@' : selectedCommit?.short_change_id || '@'}
            selectedFilePath={selectedFilePath}
            onFileSelect={filePath => setSelectedFilePath(filePath)}
          />
        </div>

        {/* Column 3: Describe & Working Copy Status Panels */}
        <div className="w-[24%] min-w-[260px] max-w-[380px] flex flex-col h-full overflow-hidden bg-[#181825]">
          {/* Sub-tab Navigation */}
          <div className="flex border-b border-[#313244] bg-[#11111b]">
            <button
              onClick={() => setRightTab('describe')}
              className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                rightTab === 'describe'
                  ? 'border-[#89b4fa] text-[#89b4fa] bg-[#181825]'
                  : 'border-transparent text-[#6c7086] hover:text-[#cdd6f4]'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{t('tab_describe')}</span>
            </button>
            <button
              onClick={() => setRightTab('status')}
              className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                rightTab === 'status'
                  ? 'border-[#a6e3a1] text-[#a6e3a1] bg-[#181825]'
                  : 'border-transparent text-[#6c7086] hover:text-[#cdd6f4]'
              }`}
            >
              <FileDiff className="w-3.5 h-3.5" />
              <span>{t('tab_status')}</span>
              {status && status.modified_files.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#a6e3a1] text-[#11111b] text-[10px] font-bold flex items-center justify-center">
                  {status.modified_files.length}
                </span>
              )}
            </button>
          </div>

          {/* Panel Component Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {rightTab === 'describe' ? (
              <DescribePanel
                selectedCommit={selectedCommit}
                onDescribe={describe}
                onCreateBookmark={createBookmark}
                loading={loading}
              />
            ) : (
              <StatusPanel
                status={status}
                loading={loading}
                onRefresh={() => refresh(undefined, false)}
                onResolveConflict={resolveConflict}
                selectedFilePath={selectedFilePath}
                onSelectFile={filePath => setSelectedFilePath(filePath)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <footer className="h-7 bg-[#11111b] border-t border-[#313244] px-3 flex items-center justify-between text-[11px] text-[#6c7086] select-none">
        {/* Left: Active Working Copy */}
        <div className="flex items-center gap-3 font-mono">
          <span className="flex items-center gap-1 text-[#89b4fa]">
            <Sparkles className="w-3 h-3" />
            <span title={workingCopyChangeId || undefined}>
              @ {workingCopyChangeId ? workingCopyChangeId.substring(0, 8) : '—'}
            </span>
          </span>

          <span className="text-[#313244]">|</span>

          <span>
            {status?.modified_files?.length || 0} {t('footer_modified_files')}
          </span>

          {status?.has_conflicts && (
            <span className="text-[#f38ba8] font-semibold">
              ⚠️ {t('footer_conflicts_present')}
            </span>
          )}
        </div>

        {/* Right: Operational Status */}
        <div className="flex items-center gap-3">
          {actionInProgress ? (
            <span className="flex items-center gap-1.5 text-[#89b4fa] animate-pulse">
              <Activity className="w-3 h-3" />
              <span>{actionInProgress}</span>
            </span>
          ) : repoError ? (
            <span className="flex items-center gap-1 text-[#f38ba8]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f38ba8]" />
              <span>{t('repo_error_title')}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[#a6e3a1]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#a6e3a1]" />
              <span>{t('footer_jj_ready')}</span>
            </span>
          )}

          <span className="text-[#313244]">|</span>
          <span className="font-mono text-[10px]">
            {commits.length} {t('footer_commits_count')}
          </span>
          <span className="text-[#313244]">|</span>
          <button
            onClick={() => setIsCommandLogModalOpen(true)}
            className="flex items-center gap-1 font-mono text-[10px] hover:text-[#cdd6f4] transition-colors"
            title={t('cli_logs_tooltip')}
          >
            <Terminal className="w-3 h-3" />
            <span>{t('cli_logs')}</span>
          </button>
        </div>
      </footer>

      {/* Modals & Dialogs */}
      <RepoSelectorModal
        isOpen={isRepoModalOpen}
        onClose={() => setIsRepoModalOpen(false)}
        activeRepoPath={activeRepoPath}
        recentRepos={recentRepos}
        onSwitchRepo={switchRepo}
        onCloneRepo={cloneRepo}
        onOpenNativeDialog={openRepoDialog}
      />

      <SplitModal
        isOpen={isSplitModalOpen}
        onClose={() => setIsSplitModalOpen(false)}
        selectedCommit={selectedCommit}
        diffData={diffData}
        onSplit={splitCommit}
      />

      <CommandLogModal
        isOpen={isCommandLogModalOpen}
        onClose={() => setIsCommandLogModalOpen(false)}
        logs={executionLogs}
        operations={operations}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        config={config}
        onSaveConfig={newCfg => setConfig(newCfg)}
        onTestBinaryPath={async path => jjApi.testBinaryPath(path)}
        activeRepoPath={activeRepoPath}
        onTestRevset={async (revset, repoPath) => {
          try {
            await jjApi.getLog(repoPath, revset);
            return true;
          } catch {
            return false;
          }
        }}
      />

      {/* Non-blocking Toast Alerts */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
