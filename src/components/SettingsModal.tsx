/**
 * SettingsModal.tsx
 *
 * JJ Desktop GUI configuration & preferences:
 * - JJ executable binary path (`jj` or custom path) with live validation
 * - Default revset query filter (`all()`, `ancestors(@)`, `heads(all())`)
 * - Auto-refresh toggle & polling interval
 */

import React, { useEffect, useState } from 'react';
import {
  Settings,
  Save,
  X,
  Cpu,
  RefreshCw,
  Sliders,
  Check,
  Globe,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import type { JJConfig } from '../types/jj';
import { useLanguage } from '../i18n/LanguageContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: JJConfig;
  onSaveConfig: (newConfig: JJConfig) => void;
  onTestBinaryPath?: (path: string) => Promise<boolean>;
  activeRepoPath?: string;
  onTestRevset?: (revset: string, repoPath: string) => Promise<boolean>;
}

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

export function SettingsModal({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onTestBinaryPath,
  activeRepoPath,
  onTestRevset,
}: SettingsModalProps) {
  const { language, setLanguage, t } = useLanguage();
  const [formState, setFormState] = useState<JJConfig>(config);
  const [selectedLang, setSelectedLang] = useState<'es' | 'en'>(language);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [testState, setTestState] = useState<TestState>('idle');
  const [revsetTestState, setRevsetTestState] = useState<TestState>('idle');

  // Re-sync the form with the live config every time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    setFormState(config);
    setSelectedLang(language);
    setSavedSuccess(false);
    setTestState('idle');
    setRevsetTestState('idle');
  }, [isOpen, config, language]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLanguage(selectedLang);
    onSaveConfig({
      ...formState,
      binaryPath: formState.binaryPath.trim() || 'jj',
      revsetQuery: formState.revsetQuery.trim() || 'all()',
      autoRefreshInterval: Math.min(3600, Math.max(5, Number(formState.autoRefreshInterval) || 30)),
    });
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const handleTestRevset = async () => {
    if (!onTestRevset || !activeRepoPath) return;
    setRevsetTestState('testing');
    try {
      const ok = await onTestRevset(formState.revsetQuery.trim() || 'all()', activeRepoPath);
      setRevsetTestState(ok ? 'ok' : 'fail');
    } catch {
      setRevsetTestState('fail');
    }
  };

  const handleTestBinary = async () => {
    if (!onTestBinaryPath) return;
    setTestState('testing');
    try {
      const ok = await onTestBinaryPath(formState.binaryPath.trim() || 'jj');
      setTestState(ok ? 'ok' : 'fail');
    } catch {
      setTestState('fail');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-[#181825] border border-[#313244] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-3.5 border-b border-[#313244] bg-[#181825] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#89b4fa]" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#cdd6f4]">
              {t('settings_title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Language Selection Setting */}
          <div className="p-3 rounded-lg bg-[#11111b] border border-[#313244]">
            <label className="font-semibold text-[#bac2de] flex items-center gap-1.5 mb-1.5">
              <Globe className="w-3.5 h-3.5 text-[#89b4fa]" />
              <span>{t('settings_language_label')}</span>
            </label>
            <p className="text-[11px] text-[#585b70] mb-2.5">{t('settings_language_desc')}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedLang('es')}
                className={`p-2 rounded-lg border text-xs font-medium flex items-center justify-between transition-all ${
                  selectedLang === 'es'
                    ? 'bg-[#181825] border-[#89b4fa] text-[#89b4fa] shadow-sm font-semibold'
                    : 'bg-[#11111b] border-[#313244] text-[#a6adc8] hover:border-[#45475a]'
                }`}
              >
                <span>🇪🇸 Español (Spanish)</span>
                {selectedLang === 'es' && <Check className="w-3.5 h-3.5 text-[#89b4fa]" />}
              </button>

              <button
                type="button"
                onClick={() => setSelectedLang('en')}
                className={`p-2 rounded-lg border text-xs font-medium flex items-center justify-between transition-all ${
                  selectedLang === 'en'
                    ? 'bg-[#181825] border-[#89b4fa] text-[#89b4fa] shadow-sm font-semibold'
                    : 'bg-[#11111b] border-[#313244] text-[#a6adc8] hover:border-[#45475a]'
                }`}
              >
                <span>🇺🇸 English</span>
                {selectedLang === 'en' && <Check className="w-3.5 h-3.5 text-[#89b4fa]" />}
              </button>
            </div>
          </div>

          {/* Binary Path Field */}
          <div>
            <label className="font-semibold text-[#bac2de] flex items-center gap-1.5 mb-1">
              <Cpu className="w-3.5 h-3.5 text-[#89b4fa]" />
              <span>{t('settings_binary_label')}</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formState.binaryPath}
                onChange={e => {
                  setFormState({ ...formState, binaryPath: e.target.value });
                  setTestState('idle');
                }}
                placeholder={t('settings_binary_placeholder')}
                className="flex-1 bg-[#11111b] border border-[#313244] rounded-lg px-3 py-2 text-[#cdd6f4] font-mono placeholder-[#585b70] focus:outline-none focus:border-[#89b4fa]"
              />
              {onTestBinaryPath && (
                <button
                  type="button"
                  onClick={handleTestBinary}
                  disabled={testState === 'testing'}
                  className="px-3 py-2 rounded-lg bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] font-semibold disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                >
                  {testState === 'testing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('settings_binary_test_btn')}</span>
                </button>
              )}
            </div>
            {testState === 'ok' && (
              <p className="text-[11px] text-[#a6e3a1] mt-1 flex items-center gap-1">
                <Check className="w-3 h-3" />
                {t('settings_binary_test_ok')}
              </p>
            )}
            {testState === 'fail' && (
              <p className="text-[11px] text-[#f38ba8] mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {t('settings_binary_test_fail')}
              </p>
            )}
            <p className="text-[11px] text-[#585b70] mt-1">{t('settings_binary_desc')}</p>
          </div>

          {/* Revset Query Filter */}
          <div>
            <label className="font-semibold text-[#bac2de] flex items-center gap-1.5 mb-1">
              <Sliders className="w-3.5 h-3.5 text-[#a6e3a1]" />
              <span>{t('settings_revset_label')}</span>
            </label>
            <input
              type="text"
              value={formState.revsetQuery}
              onChange={e => setFormState({ ...formState, revsetQuery: e.target.value })}
              placeholder={t('settings_revset_placeholder')}
              className="w-full bg-[#11111b] border border-[#313244] rounded-lg px-3 py-2 text-[#cdd6f4] font-mono placeholder-[#585b70] focus:outline-none focus:border-[#89b4fa]"
            />
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {['all()', 'ancestors(@)', 'heads(all())', 'visible_heads()'].map(query => (
                <button
                  key={query}
                  type="button"
                  onClick={() => setFormState({ ...formState, revsetQuery: query })}
                  className="px-2 py-0.5 rounded bg-[#11111b] text-[10px] font-mono text-[#89b4fa] hover:bg-[#313244] border border-[#313244]"
                >
                  {query}
                </button>
              ))}
            </div>
            {onTestRevset && activeRepoPath && (
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleTestRevset}
                  disabled={revsetTestState === 'testing'}
                  className="px-3 py-1.5 rounded-lg bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] font-semibold disabled:opacity-50 flex items-center gap-1.5"
                >
                  {revsetTestState === 'testing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('settings_revset_test_btn')}</span>
                </button>
                {revsetTestState === 'ok' && (
                  <span className="text-[11px] text-[#a6e3a1] flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    {t('settings_revset_test_ok')}
                  </span>
                )}
                {revsetTestState === 'fail' && (
                  <span className="text-[11px] text-[#f38ba8] flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {t('settings_revset_test_fail')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Auto Refresh */}
          <div className="p-3 rounded-lg bg-[#11111b] border border-[#313244] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-[#89b4fa]" />
                <div>
                  <span className="font-semibold text-[#cdd6f4] block">
                    {t('settings_auto_refresh_label')}
                  </span>
                  <span className="text-[11px] text-[#585b70]">
                    {t('settings_auto_refresh_desc', { sec: formState.autoRefreshInterval })}
                  </span>
                </div>
              </div>

              <input
                type="checkbox"
                checked={formState.autoRefresh}
                onChange={e => setFormState({ ...formState, autoRefresh: e.target.checked })}
                className="w-4 h-4 accent-[#89b4fa] rounded cursor-pointer"
              />
            </div>

            {formState.autoRefresh && (
              <label className="flex items-center gap-2 text-[#bac2de]">
                <span>{t('settings_interval_label')}</span>
                <input
                  type="number"
                  min={5}
                  max={3600}
                  value={formState.autoRefreshInterval}
                  onChange={e =>
                    setFormState({
                      ...formState,
                      autoRefreshInterval: Math.max(5, Number(e.target.value) || 5),
                    })
                  }
                  className="w-20 bg-[#181825] border border-[#313244] rounded px-2 py-1 font-mono text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
                />
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs text-[#bac2de] hover:bg-[#313244]"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#89b4fa] hover:bg-[#b4befe] text-[#11111b] text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              {savedSuccess ? <Check className="w-4 h-4 text-emerald-950" /> : <Save className="w-4 h-4" />}
              <span>{savedSuccess ? t('settings_saved_success') : t('settings_save_btn')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
