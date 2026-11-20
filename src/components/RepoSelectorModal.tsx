/**
 * RepoSelectorModal.tsx
 *
 * Repository switcher and clone dialog:
 * - Open a local directory via the native dialog (Electron only) or a path
 * - Clone a remote repo with `jj git clone <url>`
 * - List the repositories actually opened during this session
 */

import React, { useEffect, useState } from 'react';
import { FolderOpen, DownloadCloud, FolderGit2, X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface RepoSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRepoPath: string;
  recentRepos: string[];
  onSwitchRepo: (path: string) => Promise<void>;
  onCloneRepo: (url: string, path: string) => Promise<boolean>;
  onOpenNativeDialog: () => Promise<void>;
}

function parentDir(repoPath: string): string {
  // Clone target defaults to the parent of the repo currently open, not to
  // a hardcoded path from the author's machine.
  return repoPath.replace(/[\\/]+[^\\/]*$/, '') || repoPath;
}

function repoName(repoPath: string): string {
  const parts = repoPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || repoPath;
}

export function RepoSelectorModal({
  isOpen,
  onClose,
  activeRepoPath,
  recentRepos,
  onSwitchRepo,
  onCloneRepo,
  onOpenNativeDialog,
}: RepoSelectorModalProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'open' | 'clone'>('open');
  const [customPath, setCustomPath] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneTargetPath, setCloneTargetPath] = useState('');
  const [isCloning, setIsCloning] = useState(false);

  // Fresh form every time the dialog opens; the clone target starts at the
  // parent of the repo currently open.
  useEffect(() => {
    if (!isOpen) return;
    setCustomPath('');
    setCloneUrl('');
    setCloneTargetPath(parentDir(activeRepoPath));
    setIsCloning(false);
  }, [isOpen, activeRepoPath]);

  if (!isOpen) return null;

  const hasNativeDialog =
    typeof window !== 'undefined' && Boolean(window.electronAPI?.openRepoDialog);

  const handleCustomPathSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPath.trim()) return;
    await onSwitchRepo(customPath.trim());
    setCustomPath('');
    onClose();
  };

  const handleCloneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneUrl.trim() || !cloneTargetPath.trim()) return;
    setIsCloning(true);
    try {
      const ok = await onCloneRepo(cloneUrl.trim(), cloneTargetPath.trim());
      if (ok) onClose();
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#181825] border border-[#313244] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-3.5 border-b border-[#313244] bg-[#181825] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-[#89b4fa]" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#cdd6f4]">
              {t('repo_modal_title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Headers */}
        <div className="flex border-b border-[#313244] bg-[#11111b]">
          <button
            onClick={() => setActiveTab('open')}
            className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'open'
                ? 'border-[#89b4fa] text-[#89b4fa] bg-[#181825]'
                : 'border-transparent text-[#585b70] hover:text-[#cdd6f4]'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>{t('repo_tab_open')}</span>
          </button>
          <button
            onClick={() => setActiveTab('clone')}
            className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'clone'
                ? 'border-[#89b4fa] text-[#89b4fa] bg-[#181825]'
                : 'border-transparent text-[#585b70] hover:text-[#cdd6f4]'
            }`}
          >
            <DownloadCloud className="w-4 h-4" />
            <span>{t('repo_tab_clone')}</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 space-y-4">
          {activeTab === 'open' ? (
            <>
              {/* Native Browse Button (Electron only) */}
              {hasNativeDialog ? (
                <button
                  onClick={async () => {
                    await onOpenNativeDialog();
                    onClose();
                  }}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#89b4fa] hover:bg-[#b4befe] text-[#11111b] font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>{t('repo_browse_native_btn')}</span>
                </button>
              ) : (
                <p className="text-[11px] text-[#585b70] bg-[#11111b] border border-[#313244] rounded-lg p-2.5">
                  {t('repo_native_unavailable')}
                </p>
              )}

              {/* Or Manual Path */}
              <form onSubmit={handleCustomPathSubmit} className="space-y-2">
                <label className="text-[10px] font-bold text-[#585b70] uppercase tracking-wider block">
                  {t('repo_or_manual_path')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customPath}
                    onChange={e => setCustomPath(e.target.value)}
                    placeholder={activeRepoPath || 'C:\\repos\\mi-proyecto'}
                    className="flex-1 bg-[#11111b] border border-[#313244] rounded-lg px-3 py-2 text-xs text-[#cdd6f4] placeholder-[#585b70] focus:outline-none focus:border-[#89b4fa]"
                  />
                  <button
                    type="submit"
                    disabled={!customPath.trim()}
                    className="px-4 py-2 rounded-lg bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] text-xs font-semibold disabled:opacity-50"
                  >
                    {t('repo_open_btn')}
                  </button>
                </div>
              </form>

              {/* Recent Repositories */}
              <div className="pt-2">
                <span className="text-[10px] font-bold text-[#585b70] uppercase tracking-wider block mb-2">
                  {t('repo_recent_title')}
                </span>

                {recentRepos.length === 0 ? (
                  <p className="text-xs text-[#585b70] italic">{t('repo_no_recent')}</p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin scrollbar-thumb-[#313244]">
                    {recentRepos.map(repoPath => {
                      const isActive = activeRepoPath.toLowerCase() === repoPath.toLowerCase();
                      return (
                        <div
                          key={repoPath}
                          onClick={async () => {
                            await onSwitchRepo(repoPath);
                            onClose();
                          }}
                          className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                            isActive
                              ? 'bg-[#313244] border-[#89b4fa]'
                              : 'bg-[#1e1e2e] border-[#313244] hover:bg-[#313244]/60'
                          }`}
                          title={repoPath}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-[#cdd6f4] truncate">
                                {repoName(repoPath)}
                              </span>
                              {isActive && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-[#89b4fa] text-[#11111b] font-bold shrink-0">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-[#585b70] font-mono block truncate">
                              {repoPath}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Clone with jj git clone */
            <form onSubmit={handleCloneSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-[#bac2de] block mb-1">
                  {t('repo_clone_url_label')}
                </label>
                <input
                  type="text"
                  required
                  value={cloneUrl}
                  onChange={e => setCloneUrl(e.target.value)}
                  placeholder="https://github.com/martinvonz/jj.git"
                  className="w-full bg-[#11111b] border border-[#313244] rounded-lg px-3 py-2 text-xs text-[#cdd6f4] placeholder-[#585b70] focus:outline-none focus:border-[#89b4fa]"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[#bac2de] block mb-1">
                  {t('repo_clone_target_label')}
                </label>
                <input
                  type="text"
                  required
                  value={cloneTargetPath}
                  onChange={e => setCloneTargetPath(e.target.value)}
                  placeholder="ej: C:\\repos\\mi-proyecto"
                  className="w-full bg-[#11111b] border border-[#313244] rounded-lg px-3 py-2 text-xs text-[#cdd6f4] placeholder-[#585b70] focus:outline-none focus:border-[#89b4fa]"
                />
              </div>

              <div className="p-3 bg-[#11111b] rounded-lg border border-[#313244] text-[11px] text-[#585b70] font-mono break-all">
                $ jj git clone {cloneUrl || '<url>'} {cloneTargetPath || '<path>'}
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
                  disabled={isCloning || !cloneUrl.trim() || !cloneTargetPath.trim()}
                  className="px-4 py-2 rounded-lg bg-[#a6e3a1] hover:bg-[#94e2d5] text-[#11111b] text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
                >
                  <DownloadCloud className="w-4 h-4" />
                  <span>{isCloning ? t('repo_cloning_btn') : t('repo_clone_btn')}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
