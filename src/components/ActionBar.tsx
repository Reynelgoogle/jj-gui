/**
 * ActionBar.tsx
 *
 * Primary toolbar providing fast, one-click execution of core Jujutsu commands:
 * - `jj new` (New working copy commit)
 * - `jj commit -m "..."` (Close current commit)
 * - `jj undo` (Undo last repo operation)
 * - `jj split` (Divide revision into parts)
 * - `jj rebase` (Reorganize parent lineage)
 * - `jj abandon` (Discard unwanted change)
 */

import React, { useEffect, useState } from 'react';
import {
  PlusCircle,
  CheckCircle,
  Undo2,
  GitFork,
  GitMerge,
  GitBranch,
  ArrowRightLeft,
  Terminal,
  Trash2,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface ActionBarProps {
  onNewCommit: () => Promise<boolean>;
  onCommitWorkingCopy: (message: string) => Promise<boolean>;
  onUndo: () => Promise<boolean>;
  onSwitchToSelected: () => Promise<boolean>;
  canSwitch: boolean;
  onMerge: (rev1: string, rev2: string, message?: string) => Promise<boolean>;
  onRebase: (source: string, target: string) => Promise<boolean>;
  onAbandon: () => Promise<boolean>;
  canAbandon: boolean;
  canMergeOrRebase: boolean;
  selectedChangeId?: string;
  selectedRevisionName?: string;
  onOpenSplitModal: () => void;
  onOpenCommandLogs: () => void;
  loading: boolean;
  actionInProgress: string | null;
}

export function ActionBar({
  onNewCommit,
  onCommitWorkingCopy,
  onUndo,
  onSwitchToSelected,
  canSwitch,
  onMerge,
  onRebase,
  onAbandon,
  canAbandon,
  canMergeOrRebase,
  selectedChangeId,
  selectedRevisionName,
  onOpenSplitModal,
  onOpenCommandLogs,
  loading,
  actionInProgress,
}: ActionBarProps) {
  const { t } = useLanguage();
  const [commitPromptOpen, setCommitPromptOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [mergePromptOpen, setMergePromptOpen] = useState(false);
  const [mergeMessage, setMergeMessage] = useState('');
  const [rebasePromptOpen, setRebasePromptOpen] = useState(false);
  const [rebaseTarget, setRebaseTarget] = useState('@');

  // The Electron application menu sends `jj:open-commit-prompt` when the user
  // picks "Commit Working Copy..." so the same inline form is reused.
  useEffect(() => {
    const handler = () => setCommitPromptOpen(true);
    window.addEventListener('jj:open-commit-prompt', handler);
    return () => window.removeEventListener('jj:open-commit-prompt', handler);
  }, []);

  const busy = loading || Boolean(actionInProgress);

  // Only one prompt open at a time, and Escape closes whichever is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCommitPromptOpen(false);
        setMergePromptOpen(false);
        setRebasePromptOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleCommitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim()) return;
    const ok = await onCommitWorkingCopy(commitMessage.trim());
    if (ok) {
      setCommitMessage('');
      setCommitPromptOpen(false);
    }
  };

  const handleUndo = async () => {
    if (!window.confirm(t('confirm_undo'))) return;
    await onUndo();
  };

  const handleSwitch = async () => {
    if (!window.confirm(t('confirm_switch'))) return;
    await onSwitchToSelected();
  };

  const handleAbandon = async () => {
    if (!window.confirm(t('confirm_abandon'))) return;
    await onAbandon();
  };

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChangeId) return;
    if (!window.confirm(t('confirm_merge'))) return;
    const ok = await onMerge('@', selectedChangeId, mergeMessage.trim() || undefined);
    if (ok) {
      setMergeMessage('');
      setMergePromptOpen(false);
    }
  };

  const handleRebaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChangeId) return;
    if (!window.confirm(t('confirm_rebase'))) return;
    const ok = await onRebase(selectedChangeId, rebaseTarget.trim() || '@');
    if (ok) setRebasePromptOpen(false);
  };

  return (
    <div className="relative bg-[#181825] border-b border-[#313244] px-4 py-2 flex items-center justify-between gap-3 select-none shrink-0">
      {/* Left Quick Action Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* New Commit (jj new) */}
        <button
          onClick={onNewCommit}
          disabled={busy}
          className="px-3 py-1.5 rounded text-xs font-semibold bg-[#89b4fa] hover:opacity-90 text-[#11111b] transition-all flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
          title={t('new_commit_tooltip')}
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>{t('new_commit')}</span>
        </button>

        {/* Commit Working Copy (jj commit) */}
        <button
          onClick={() => { setMergePromptOpen(false); setRebasePromptOpen(false); setCommitPromptOpen(!commitPromptOpen); }}
          disabled={busy}
          className="px-3 py-1.5 rounded text-xs font-semibold bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] border border-[#45475a] transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          title={t('close_commit_tooltip')}
        >
          <CheckCircle className="w-3.5 h-3.5 text-[#a6e3a1]" />
          <span>{t('close_commit')}</span>
        </button>

        {/* Undo (jj undo) */}
        <button
          onClick={handleUndo}
          disabled={busy}
          className="px-3 py-1.5 rounded text-xs font-semibold bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition-all flex items-center gap-1.5 border border-[#45475a] active:scale-95 disabled:opacity-50"
          title={t('undo_tooltip')}
        >
          <Undo2 className="w-3.5 h-3.5 text-[#f9e2af]" />
          <span>{t('undo')}</span>
        </button>

        {/* Split Commit (jj split) */}
        <button
          onClick={onOpenSplitModal}
          disabled={busy}
          className="px-3 py-1.5 rounded text-xs font-semibold bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition-all flex items-center gap-1.5 border border-[#45475a] active:scale-95 disabled:opacity-50"
          title={t('split_commit_tooltip')}
        >
          <GitFork className="w-3.5 h-3.5 text-[#cba6f7]" />
          <span>{t('split_commit')}</span>
        </button>

        {/* Switch to selected commit (jj edit) */}
        <button
          onClick={handleSwitch}
          disabled={busy || !canSwitch}
          className="px-3 py-1.5 rounded text-xs font-semibold bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition-all flex items-center gap-1.5 border border-[#45475a] active:scale-95 disabled:opacity-50"
          title={t('switch_commit_tooltip')}
        >
          <ArrowRightLeft className="w-3.5 h-3.5 text-[#a6e3a1]" />
          <span>{t('switch_commit')}</span>
        </button>

        {/* Merge selected commit into working copy (jj new @ <rev>) */}
        <button
          onClick={() => { setCommitPromptOpen(false); setRebasePromptOpen(false); setMergePromptOpen(!mergePromptOpen); }}
          disabled={busy || !canMergeOrRebase}
          className="px-3 py-1.5 rounded text-xs font-semibold bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition-all flex items-center gap-1.5 border border-[#45475a] active:scale-95 disabled:opacity-50"
          title={t('merge_commit_tooltip')}
        >
          <GitMerge className="w-3.5 h-3.5 text-[#cba6f7]" />
          <span>{t('merge_commit')}</span>
        </button>

        {/* Rebase selected commit onto a target (jj rebase -r <rev> -d <target>) */}
        <button
          onClick={() => { setCommitPromptOpen(false); setMergePromptOpen(false); setRebasePromptOpen(!rebasePromptOpen); }}
          disabled={busy || !canMergeOrRebase}
          className="px-3 py-1.5 rounded text-xs font-semibold bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition-all flex items-center gap-1.5 border border-[#45475a] active:scale-95 disabled:opacity-50"
          title={t('rebase_commit_tooltip')}
        >
          <GitBranch className="w-3.5 h-3.5 text-[#f9e2af]" />
          <span>{t('rebase_commit')}</span>
        </button>
        {/* Abandon selected commit (jj abandon) */}
        <button
          onClick={handleAbandon}
          disabled={busy || !canAbandon}
          className="px-3 py-1.5 rounded text-xs font-semibold bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition-all flex items-center gap-1.5 border border-[#45475a] active:scale-95 disabled:opacity-50"
          title={t('abandon_tooltip')}
        >
          <Trash2 className="w-3.5 h-3.5 text-[#f38ba8]" />
          <span>{t('abandon_btn')}</span>
        </button>
      </div>

      {/* Right Terminal Logs Trigger & Status */}
      <div className="flex items-center gap-3">
        {actionInProgress && (
          <span className="text-xs text-[#89b4fa] animate-pulse flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#89b4fa]" />
            {actionInProgress}
          </span>
        )}

        <button
          onClick={onOpenCommandLogs}
          className="px-2.5 py-1.5 rounded text-xs font-mono bg-[#11111b] hover:bg-[#313244] text-[#89b4fa] border border-[#313244] transition-colors flex items-center gap-1.5"
          title={t('cli_logs_tooltip')}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>{t('cli_logs')}</span>
        </button>
      </div>

      {/* Commit Prompt Popup Drawer */}
      {commitPromptOpen && (
        <div className="absolute top-12 left-4 z-40 bg-[#181825] border border-[#89b4fa]/60 rounded-xl p-3 shadow-2xl w-96 animate-in fade-in zoom-in-95 duration-150">
          <form onSubmit={handleCommitSubmit} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#cdd6f4]">
                {t('close_commit_modal_title')}
              </span>
              <button
                type="button"
                onClick={() => setCommitPromptOpen(false)}
                className="text-xs text-[#585b70] hover:text-[#cdd6f4]"
              >
                ✕
              </button>
            </div>

            <textarea
              autoFocus
              rows={3}
              value={commitMessage}
              onChange={e => setCommitMessage(e.target.value)}
              placeholder={t('close_commit_placeholder')}
              className="w-full bg-[#11111b] border border-[#313244] rounded px-2.5 py-1.5 text-xs text-[#cdd6f4] placeholder-[#585b70] focus:outline-none focus:border-[#89b4fa] resize-none"
            />

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCommitPromptOpen(false)}
                className="px-2.5 py-1 rounded text-xs text-[#bac2de] hover:bg-[#313244]"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={!commitMessage.trim() || busy}
                className="px-3 py-1 rounded text-xs font-semibold bg-[#89b4fa] text-[#11111b] hover:opacity-90 disabled:opacity-50"
              >
                {t('execute_commit')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Merge Prompt Popup Drawer */}
      {mergePromptOpen && (
        <div className="absolute top-12 left-4 z-40 bg-[#181825] border border-[#cba6f7]/60 rounded-xl p-3 shadow-2xl w-96 animate-in fade-in zoom-in-95 duration-150">
          <form onSubmit={handleMergeSubmit} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#cdd6f4]">
                {t('merge_modal_title')}
              </span>
              <button
                type="button"
                onClick={() => setMergePromptOpen(false)}
                className="text-xs text-[#585b70] hover:text-[#cdd6f4]"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-[#bac2de]">
              {t('merge_modal_desc')} <code className="text-[#cba6f7] font-mono">{selectedRevisionName || '@'}</code>
            </p>

            <input
              type="text"
              value={mergeMessage}
              onChange={e => setMergeMessage(e.target.value)}
              placeholder={t('merge_message_placeholder')}
              className="w-full bg-[#11111b] border border-[#313244] rounded px-2.5 py-1.5 text-xs text-[#cdd6f4] placeholder-[#585b70] focus:outline-none focus:border-[#cba6f7]"
            />

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMergePromptOpen(false)}
                className="px-2.5 py-1 rounded text-xs text-[#bac2de] hover:bg-[#313244]"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={!selectedChangeId || busy}
                className="px-3 py-1 rounded text-xs font-semibold bg-[#cba6f7] text-[#11111b] hover:opacity-90 disabled:opacity-50"
              >
                {t('merge_execute_btn')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rebase Prompt Popup Drawer */}
      {rebasePromptOpen && (
        <div className="absolute top-12 left-4 z-40 bg-[#181825] border border-[#f9e2af]/60 rounded-xl p-3 shadow-2xl w-96 animate-in fade-in zoom-in-95 duration-150">
          <form onSubmit={handleRebaseSubmit} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#cdd6f4]">
                {t('rebase_modal_title')}
              </span>
              <button
                type="button"
                onClick={() => setRebasePromptOpen(false)}
                className="text-xs text-[#585b70] hover:text-[#cdd6f4]"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-[#bac2de]">
              {t('rebase_modal_desc')} <code className="text-[#f9e2af] font-mono">{selectedRevisionName || '@'}</code>
            </p>

            <input
              type="text"
              value={rebaseTarget}
              onChange={e => setRebaseTarget(e.target.value)}
              placeholder={t('rebase_target_placeholder')}
              className="w-full bg-[#11111b] border border-[#313244] rounded px-2.5 py-1.5 text-xs text-[#cdd6f4] placeholder-[#585b70] focus:outline-none focus:border-[#f9e2af]"
            />

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRebasePromptOpen(false)}
                className="px-2.5 py-1 rounded text-xs text-[#bac2de] hover:bg-[#313244]"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={!selectedChangeId || busy}
                className="px-3 py-1 rounded text-xs font-semibold bg-[#f9e2af] text-[#11111b] hover:opacity-90 disabled:opacity-50"
              >
                {t('rebase_execute_btn')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
