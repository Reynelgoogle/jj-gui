/**
 * DescribePanel.tsx
 *
 * Dedicated panel for editing and applying commit descriptions in Jujutsu.
 * Supports `jj describe -m "message"` for the working copy (@) or
 * `jj describe -r <id> -m "message"` for historical revisions.
 */

import React, { useState, useEffect } from 'react';
import { Check, Tag, BookmarkPlus } from 'lucide-react';
import type { JJCommit } from '../types/jj';
import { useLanguage } from '../i18n/LanguageContext';

interface DescribePanelProps {
  selectedCommit: JJCommit | null;
  onDescribe: (message: string, revision?: string) => Promise<boolean>;
  onCreateBookmark?: (name: string, revision?: string) => Promise<boolean>;
  loading: boolean;
}

export function DescribePanel({
  selectedCommit,
  onDescribe,
  onCreateBookmark,
  loading,
}: DescribePanelProps) {
  const { t } = useLanguage();
  const [message, setMessage] = useState('');
  const [bookmarkInput, setBookmarkInput] = useState('');
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [showBookmarkForm, setShowBookmarkForm] = useState(false);

  const CONVENTIONAL_PRESETS = [
    { label: 'feat:', prefix: 'feat: ', desc: t('describe_presets_feat') },
    { label: 'fix:', prefix: 'fix: ', desc: t('describe_presets_fix') },
    { label: 'refactor:', prefix: 'refactor: ', desc: t('describe_presets_refactor') },
    { label: 'perf:', prefix: 'perf: ', desc: t('describe_presets_perf') },
    { label: 'docs:', prefix: 'docs: ', desc: t('describe_presets_docs') },
  ];

  // Sync the textarea only when the selected revision or its real description
  // changes. Auto-refresh replaces the commit object every few seconds, so
  // depending on the whole object would wipe the user's unsaved text.
  const selectedChangeId = selectedCommit?.change_id;
  const selectedDescription = selectedCommit?.description;

  useEffect(() => {
    setMessage(selectedDescription || '');
  }, [selectedChangeId, selectedDescription]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    const rev = selectedCommit?.is_working_copy ? '@' : selectedCommit?.change_id;
    await onDescribe(message, rev);
  };

  const handleApplyPreset = (prefix: string) => {
    if (!message.startsWith(prefix)) {
      setMessage(prefix + message.replace(/^(feat|fix|refactor|perf|docs|chore):?\s*/, ''));
    }
  };

  const handleCreateBookmarkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = bookmarkInput.trim();
    if (!name || !onCreateBookmark) return;
    // jj bookmark names: letters, digits, -, ., _ and / (not starting with
    // a dot or slash). Validate here so jj's error is not the first signal.
    if (!/^[A-Za-z0-9][A-Za-z0-9._/\-]*$/.test(name)) {
      setBookmarkError(t('describe_bookmark_invalid'));
      return;
    }
    setBookmarkError(null);
    const rev = selectedCommit?.is_working_copy ? '@' : selectedCommit?.change_id;
    const ok = await onCreateBookmark(name, rev);
    if (ok) {
      setBookmarkInput('');
      setShowBookmarkForm(false);
    }
  };

  const isWorkingCopy = selectedCommit?.is_working_copy;

  return (
    <div className="flex flex-col h-full bg-[#181825] overflow-hidden select-none">
      {/* Top Describe Action Section */}
      <div className="p-4 border-b border-[#313244]">
        <div className="text-xs font-bold uppercase tracking-widest text-[#585b70] mb-3 flex items-center justify-between">
          <span>{t('describe_action_title')}</span>
          {selectedCommit && (
            <span className="font-mono text-[10px] lowercase text-[#89b4fa] bg-[#89b4fa]/10 px-2 py-0.5 rounded">
              {isWorkingCopy ? '@' : selectedCommit.short_change_id}
            </span>
          )}
        </div>

        {selectedCommit?.is_immutable && (
          <p className="text-[11px] text-[#f9e2af] mb-2">{t('describe_immutable')}</p>
        )}

        {/* Textarea */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            rows={4}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={t('describe_textarea_placeholder')}
            className="w-full h-32 bg-[#1e1e2e] border border-[#313244] rounded p-3 text-sm text-[#cdd6f4] placeholder-[#585b70] focus:outline-none focus:border-[#89b4fa] resize-none leading-relaxed transition-colors"
          />

          <button
            type="submit"
            disabled={loading || !message.trim() || Boolean(selectedCommit?.is_immutable)}
            className="w-full py-2 bg-[#89b4fa] text-[#11111b] font-bold rounded text-sm hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50 shadow-sm flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{t('describe_save_btn')}</span>
          </button>
        </form>
      </div>

      {/* Scrollable Quick Presets & Bookmarks */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-[#313244]">
        {/* Quick Presets */}
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-[#585b70] mb-2">
            {t('describe_presets_title')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CONVENTIONAL_PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => handleApplyPreset(p.prefix)}
                className="px-2.5 py-1 rounded text-xs font-mono font-medium bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition-colors"
                title={p.desc}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bookmarks Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-widest text-[#585b70]">
              {t('describe_bookmarks_title')}
            </span>
            <button
              onClick={() => setShowBookmarkForm(!showBookmarkForm)}
              className="text-xs text-[#89b4fa] hover:underline flex items-center gap-1"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span>{showBookmarkForm ? t('describe_cancel_bookmark') : t('describe_new_bookmark_btn')}</span>
            </button>
          </div>

          {showBookmarkForm && (
            <form onSubmit={handleCreateBookmarkSubmit} className="space-y-2 bg-[#11111b] p-3 rounded-lg border border-[#313244] mb-2">
              <input
                type="text"
                value={bookmarkInput}
                onChange={e => setBookmarkInput(e.target.value)}
                placeholder={t('describe_bookmark_placeholder')}
                className="w-full bg-[#1e1e2e] border border-[#313244] rounded px-2.5 py-1.5 text-xs text-[#cdd6f4] placeholder-[#585b70] focus:outline-none focus:border-[#a6e3a1]"
              />
              {bookmarkError && (
                <p className="text-[11px] text-[#f38ba8]">{bookmarkError}</p>
              )}
              <button
                type="submit"
                disabled={!bookmarkInput.trim()}
                className="w-full py-1.5 px-2 rounded text-xs font-bold bg-[#a6e3a1] text-[#11111b] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {t('describe_create_bookmark_btn')}
              </button>
            </form>
          )}

          {selectedCommit?.bookmarks && selectedCommit.bookmarks.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedCommit.bookmarks.map(b => (
                <span
                  key={b}
                  className="px-2 py-0.5 rounded text-xs font-mono bg-[#a6e3a1]/15 text-[#a6e3a1] border border-[#a6e3a1]/30 flex items-center gap-1"
                >
                  <Tag className="w-3 h-3" />
                  {b}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-[#585b70] italic">{t('describe_no_bookmarks')}</span>
          )}
        </div>
      </div>

      {/* Working Copy Status Footer Banner */}
      <div className="mt-auto p-4 bg-[#11111b]/50 border-t border-[#313244] shrink-0">
        <div className="text-[10px] text-[#585b70] uppercase font-bold mb-2">
          {t('status_working_copy_title')}
        </div>
        <div className="flex items-center gap-2 text-xs text-[#a6e3a1]">
          <span className="w-2 h-2 rounded-full bg-[#a6e3a1]" />
          <span className="font-mono">
            {selectedCommit?.is_working_copy
              ? `@ ${t('describe_active_revision')}`
              : selectedCommit?.short_change_id || '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
