/**
 * Electron Preload Script
 *
 * Exposes a secure, typed IPC bridge to the React renderer process
 * without leaking raw child_process or filesystem permissions.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  JJCommit,
  JJStatus,
  JJDiffData,
  JJRepoInfo,
  JJExecutionLog,
  JJOperationLogEntry
} from '../src/types/jj';

const electronAPI = {
  // JJ Command Invocations
  getRepoInfo: (repoPath?: string): Promise<JJRepoInfo> => {
    return ipcRenderer.invoke('jj:getRepoInfo', repoPath);
  },

  getLog: (repoPath?: string, revset?: string): Promise<JJCommit[]> => {
    return ipcRenderer.invoke('jj:getLog', repoPath, revset);
  },

  getStatus: (repoPath?: string): Promise<JJStatus> => {
    return ipcRenderer.invoke('jj:getStatus', repoPath);
  },

  describe: (revision: string, message: string, repoPath?: string): Promise<{ success: boolean; message: string }> => {
    return ipcRenderer.invoke('jj:describe', revision, message, repoPath);
  },

  newCommit: (parentRevision?: string, message?: string, repoPath?: string): Promise<{ success: boolean; change_id?: string }> => {
    return ipcRenderer.invoke('jj:newCommit', parentRevision, message, repoPath);
  },

  commit: (message: string, repoPath?: string): Promise<{ success: boolean; change_id?: string }> => {
    return ipcRenderer.invoke('jj:commit', message, repoPath);
  },

  undo: (repoPath?: string): Promise<{ success: boolean; restored_operation?: string }> => {
    return ipcRenderer.invoke('jj:undo', repoPath);
  },

  split: (revision: string, filesToSplitOff?: string[], repoPath?: string, message?: string): Promise<{ success: boolean; message?: string }> => {
    return ipcRenderer.invoke('jj:split', revision, filesToSplitOff, repoPath, message);
  },

  rebase: (sourceRev: string, destinationRev: string, repoPath?: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('jj:rebase', sourceRev, destinationRev, repoPath);
  },

  abandon: (revision: string, repoPath?: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('jj:abandon', revision, repoPath);
  },

  resolveConflict: (filePath: string, side: 'ours' | 'theirs', repoPath?: string): Promise<{ success: boolean; output: string }> => {
    return ipcRenderer.invoke('jj:resolve', filePath, side, repoPath);
  },

  editCommit: (revision: string, repoPath?: string): Promise<{ success: boolean; message?: string }> => {
    return ipcRenderer.invoke('jj:editCommit', revision, repoPath);
  },

  merge: (rev1: string, rev2: string, message?: string, repoPath?: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('jj:merge', rev1, rev2, message, repoPath);
  },

  createBookmark: (name: string, revision?: string, repoPath?: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('jj:createBookmark', name, revision, repoPath);
  },

  getDiff: (revision: string, targetRevision?: string, repoPath?: string): Promise<JJDiffData> => {
    return ipcRenderer.invoke('jj:getDiff', revision, targetRevision, repoPath);
  },

  push: (remote?: string, bookmark?: string, repoPath?: string): Promise<{ success: boolean; output: string }> => {
    return ipcRenderer.invoke('jj:push', remote, bookmark, repoPath);
  },

  fetch: (remote?: string, repoPath?: string): Promise<{ success: boolean; output: string }> => {
    return ipcRenderer.invoke('jj:fetch', remote, repoPath);
  },

  clone: (url: string, targetPath: string): Promise<{ success: boolean; output: string }> => {
    return ipcRenderer.invoke('jj:clone', url, targetPath);
  },

  openRepoDialog: (): Promise<string | null> => {
    return ipcRenderer.invoke('jj:openRepoDialog');
  },

  getExecutionLogs: (): Promise<JJExecutionLog[]> => {
    return ipcRenderer.invoke('jj:getExecutionLogs');
  },

  getOperations: (repoPath?: string): Promise<JJOperationLogEntry[]> => {
    return ipcRenderer.invoke('jj:getOperations', repoPath);
  },

  setBinaryPath: (path: string): Promise<boolean> => {
    return ipcRenderer.invoke('jj:setBinaryPath', path);
  },

  testBinaryPath: (path: string): Promise<boolean> => {
    return ipcRenderer.invoke('jj:testBinaryPath', path);
  },

  onRepoChanged: (callback: (repoPath: string) => void) => {
    const subscription = (_event: any, value: string) => callback(value);
    ipcRenderer.on('repo:changed', subscription);
    return () => {
      ipcRenderer.removeListener('repo:changed', subscription);
    };
  },

  onQuickAction: (callback: (action: string) => void) => {
    const subscription = (_event: any, action: string) => callback(action);
    ipcRenderer.on('jj:quickAction', subscription);
    return () => {
      ipcRenderer.removeListener('jj:quickAction', subscription);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
