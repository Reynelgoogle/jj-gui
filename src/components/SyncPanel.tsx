/**
 * SyncPanel.tsx
 *
 * Header panel coordinating GitHub & remote Git synchronization:
 * - `jj git push`
 * - `jj git fetch`
 * - Displays the real remote URL, current bookmark and jj version
 */

import React from 'react';
import {
  UploadCloud,
  DownloadCloud,
  Github,
  GitBranch,
  FolderGit2,
  Settings,
  AlertTriangle,
} from 'lucide-react';
import type { JJRepoInfo } from '../types/jj';
import { useLanguage } from '../i18n/LanguageContext';

interface SyncPanelProps {
  repoInfo: JJRepoInfo | null;
  currentBookmark?: string;
  onPush: (remote?: string, bookmark?: string) => Promise<boolean>;
  onFetch: (remote?: string) => Promise<boolean>;
  onOpenRepoSelector: () => void;
  onOpenSettings: () => void;
  loading: boolean;
}

export function SyncPanel({
  repoInfo,
  currentBookmark,
  onPush,
  onFetch,
  onOpenRepoSelector,
  onOpenSettings,
  loading,
}: SyncPanelProps) {
  const { language, setLanguage, t } = useLanguage();

  const remote = repoInfo?.remote_name || '';
  const hasRemote = Boolean(repoInfo?.remote_url || repoInfo?.remote_name);
  const branch = currentBookmark || repoInfo?.default_branch || '';
  const invalidRepo = repoInfo != null && !repoInfo.is_valid;

  return (
    <header className="h-12 border-b border-[#313244] bg-[#181825] flex items-center justify-between px-4 shrink-0 select-none">
      {/* Left: Repository Pill & jj Version */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenRepoSelector}
          className="flex items-center gap-2 px-3 py-1 bg-[#313244] hover:bg-[#45475a] rounded text-sm text-[#bac2de] transition-colors group min-w-0"
          title={repoInfo?.path || t('repo_switch_title')}
        >
          <FolderGit2 className="w-3.5 h-3.5 text-[#89b4fa] shrink-0 group-hover:scale-110 transition-transform" />
          <span className="font-medium text-xs text-[#cdd6f4] truncate max-w-[200px]">
            {repoInfo?.name || '—'}
          </span>
          {branch && (
            <>
              <span className="text-xs text-[#585b70]">/</span>
              <span className="font-mono text-xs text-[#89b4fa] flex items-center gap-1 truncate max-w-[140px]">
                <GitBranch className="w-3 h-3 shrink-0" />
                {branch}
              </span>
            </>
          )}
        </button>

        {/* Jujutsu CLI Version Badge */}
        <span
          className="hidden lg:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-[#11111b] text-[#bac2de] border border-[#313244]"
          title={t('cli_version')}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              invalidRepo ? 'bg-[#f38ba8]' : repoInfo?.is_jj_installed ? 'bg-[#a6e3a1]' : 'bg-[#f38ba8]'
            }`}
          />
          {repoInfo?.jj_version || '—'}
        </span>

        {invalidRepo && (
          <span className="hidden xl:inline-flex items-center gap-1 text-[11px] text-[#f38ba8]">
            <AlertTriangle className="w-3.5 h-3.5" />
            {t('repo_error_title')}
          </span>
        )}
      </div>

      {/* Center: Remote Git URL */}
      <div className="hidden md:flex items-center gap-2 text-xs min-w-0 max-w-[300px]">
        <Github className={`w-3.5 h-3.5 shrink-0 ${hasRemote ? 'text-[#bac2de]' : 'text-[#585b70]'}`} />
        <span
          className={`font-mono text-[11px] truncate ${
            hasRemote ? 'text-[#585b70] hover:text-[#bac2de]' : 'text-[#fab387]'
          } transition-colors`}
          title={repoInfo?.remote_url || t('sync_no_remote')}
        >
          {repoInfo?.remote_url || t('sync_no_remote')}
        </span>
        {repoInfo?.remote_name && (
          <span className="shrink-0 px-1.5 py-0.5 rounded bg-[#11111b] border border-[#313244] text-[10px] font-mono text-[#89b4fa]">
            {repoInfo.remote_name}
          </span>
        )}
      </div>

      {/* Right: Language Switcher, Fetch, Push, & Settings Buttons */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Quick Language Toggle Pill */}
        <div className="flex items-center bg-[#11111b] p-0.5 rounded-lg border border-[#313244] text-[11px] font-medium mr-1">
          <button
            onClick={() => setLanguage('es')}
            className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
              language === 'es'
                ? 'bg-[#89b4fa] text-[#11111b] font-bold shadow-xs'
                : 'text-[#585b70] hover:text-[#cdd6f4]'
            }`}
            title="Cambiar idioma a Español"
          >
            <span>ES</span>
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
              language === 'en'
                ? 'bg-[#89b4fa] text-[#11111b] font-bold shadow-xs'
                : 'text-[#585b70] hover:text-[#cdd6f4]'
            }`}
            title="Switch language to English"
          >
            <span>EN</span>
          </button>
        </div>

        {/* Fetch Button (jj git fetch) */}
        <button
          onClick={() => onFetch(remote || undefined)}
          disabled={loading || !hasRemote}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#313244] text-[#cdd6f4] rounded text-sm transition-colors border border-transparent hover:border-[#45475a] disabled:opacity-40 disabled:cursor-not-allowed"
          title={hasRemote ? t('fetch_tooltip') : t('sync_no_remote')}
        >
          <DownloadCloud className="w-3.5 h-3.5 text-[#89b4fa]" />
          <span className="text-xs font-medium">{t('fetch_btn')}</span>
        </button>

        {/* Push Button (jj git push) */}
        <button
          onClick={() => onPush(remote || undefined)}
          disabled={loading || !hasRemote}
          className="flex items-center gap-2 px-3 py-1.5 bg-[#89b4fa] text-[#11111b] font-semibold rounded text-sm hover:opacity-90 active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title={hasRemote ? t('push_tooltip') : t('sync_no_remote')}
        >
          <UploadCloud className="w-3.5 h-3.5 text-[#11111b]" />
          <span className="text-xs">{t('push_btn')}</span>
        </button>

        {/* Settings modal trigger */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244] transition-colors ml-1"
          title={t('settings_btn')}
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
