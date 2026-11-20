/**
 * Universal Jujutsu API Client Bridge
 *
 * Automatically detects whether it runs in Electron (window.electronAPI) or in
 * the browser (Express REST API). All failures are propagated as errors: the
 * client never invents commits or reports fake success.
 */

import type {
  JJCommit,
  JJStatus,
  JJDiffData,
  JJRepoInfo,
  JJExecutionLog,
  JJOperationLogEntry,
  JJServiceAPI,
} from '../types/jj';

declare global {
  interface Window {
    electronAPI?: JJServiceAPI;
  }
}

class UniversalJJClient implements JJServiceAPI {
  private isElectron(): boolean {
    return typeof window !== 'undefined' && Boolean(window.electronAPI);
  }

  private async request<T>(url: string, init?: RequestInit, timeoutMs = 30000): Promise<T> {
    // If we are inside Electron but the preload bridge did not load, every
    // call would silently fall through to HTTP and fail with a confusing
    // "cannot connect to server" instead of the real cause.
    if (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      navigator.userAgent.includes('Electron') &&
      !window.electronAPI
    ) {
      throw new Error('El puente de Electron no cargó (preload). Reinicia la aplicación.');
    }

    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error: any) {
      if (error?.name === 'TimeoutError') {
        throw new Error('La operación con Jujutsu superó el tiempo límite');
      }
      throw new Error(`No se pudo conectar con el servidor de Jujutsu: ${error?.message || error}`);
    }

    const text = await response.text();
    let payload: any = undefined;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && typeof payload.error === 'string'
          ? payload.error
          : typeof payload === 'string' && payload
          ? payload
          : `Error HTTP ${response.status} (${response.statusText})`;
      throw new Error(message);
    }

    return payload as T;
  }

  private repoQuery(repoPath?: string): string {
    return repoPath ? `repo=${encodeURIComponent(repoPath)}` : '';
  }

  async getRepoInfo(repoPath?: string): Promise<JJRepoInfo> {
    if (this.isElectron()) return window.electronAPI!.getRepoInfo(repoPath);
    const qs = this.repoQuery(repoPath);
    return this.request<JJRepoInfo>(`/api/jj/info${qs ? `?${qs}` : ''}`);
  }

  async getLog(repoPath?: string, revset?: string): Promise<JJCommit[]> {
    if (this.isElectron()) return window.electronAPI!.getLog(repoPath, revset);
    const params = new URLSearchParams();
    if (repoPath) params.set('repo', repoPath);
    params.set('revset', revset || 'all()');
    return this.request<JJCommit[]>(`/api/jj/log?${params.toString()}`);
  }

  async getStatus(repoPath?: string): Promise<JJStatus> {
    if (this.isElectron()) return window.electronAPI!.getStatus(repoPath);
    const qs = this.repoQuery(repoPath);
    return this.request<JJStatus>(`/api/jj/status${qs ? `?${qs}` : ''}`);
  }

  async describe(revision: string, message: string, repoPath?: string): Promise<{ success: boolean; message: string }> {
    if (this.isElectron()) return window.electronAPI!.describe(revision, message, repoPath);
    return this.request('/api/jj/describe', this.post({ revision, message, repo: repoPath }));
  }

  async newCommit(parentRevision?: string, message?: string, repoPath?: string): Promise<{ success: boolean; change_id?: string }> {
    if (this.isElectron()) return window.electronAPI!.newCommit(parentRevision, message, repoPath);
    return this.request('/api/jj/new', this.post({ parentRevision, message, repo: repoPath }));
  }

  async commit(message: string, repoPath?: string): Promise<{ success: boolean; change_id?: string }> {
    if (this.isElectron()) return window.electronAPI!.commit(message, repoPath);
    return this.request('/api/jj/commit', this.post({ message, repo: repoPath }));
  }

  async undo(repoPath?: string): Promise<{ success: boolean; restored_operation?: string }> {
    if (this.isElectron()) return window.electronAPI!.undo(repoPath);
    return this.request('/api/jj/undo', this.post({ repo: repoPath }));
  }

  async split(
    revision: string,
    filesToSplitOff?: string[],
    repoPath?: string,
    message?: string,
  ): Promise<{ success: boolean; message?: string }> {
    if (this.isElectron()) return window.electronAPI!.split(revision, filesToSplitOff, repoPath, message);
    return this.request(
      '/api/jj/split',
      this.post({ revision, filesToSplitOff, message, repo: repoPath }),
    );
  }

  async rebase(sourceRev: string, destinationRev: string, repoPath?: string): Promise<{ success: boolean }> {
    if (this.isElectron()) return window.electronAPI!.rebase(sourceRev, destinationRev, repoPath);
    return this.request('/api/jj/rebase', this.post({ sourceRev, destinationRev, repo: repoPath }));
  }

  async abandon(revision: string, repoPath?: string): Promise<{ success: boolean }> {
    if (this.isElectron()) return window.electronAPI!.abandon(revision, repoPath);
    return this.request('/api/jj/abandon', this.post({ revision, repo: repoPath }));
  }

  async resolveConflict(filePath: string, side: 'ours' | 'theirs', repoPath?: string): Promise<{ success: boolean; output: string }> {
    if (this.isElectron()) return window.electronAPI!.resolveConflict(filePath, side, repoPath);
    return this.request('/api/jj/resolve', this.post({ file: filePath, side, repo: repoPath }));
  }

  async editCommit(revision: string, repoPath?: string): Promise<{ success: boolean; message?: string }> {
    if (this.isElectron()) return window.electronAPI!.editCommit(revision, repoPath);
    return this.request('/api/jj/edit', this.post({ revision, repo: repoPath }));
  }

  async merge(rev1: string, rev2: string, message?: string, repoPath?: string): Promise<{ success: boolean }> {
    if (this.isElectron()) return window.electronAPI!.merge(rev1, rev2, message, repoPath);
    return this.request('/api/jj/merge', this.post({ rev1, rev2, message, repo: repoPath }));
  }

  async createBookmark(name: string, revision?: string, repoPath?: string): Promise<{ success: boolean }> {
    if (this.isElectron()) return window.electronAPI!.createBookmark(name, revision, repoPath);
    return this.request('/api/jj/bookmark', this.post({ name, revision, repo: repoPath }));
  }

  async getDiff(revision: string, targetRevision?: string, repoPath?: string): Promise<JJDiffData> {
    if (this.isElectron()) return window.electronAPI!.getDiff(revision, targetRevision, repoPath);
    const params = new URLSearchParams({ revision });
    if (targetRevision) params.set('target', targetRevision);
    if (repoPath) params.set('repo', repoPath);
    return this.request<JJDiffData>(`/api/jj/diff?${params.toString()}`);
  }

  async push(remote?: string, bookmark?: string, repoPath?: string): Promise<{ success: boolean; output: string }> {
    if (this.isElectron()) return window.electronAPI!.push(remote, bookmark, repoPath);
    return this.request('/api/jj/push', this.post({ remote, bookmark, repo: repoPath }), 180000);
  }

  async fetch(remote?: string, repoPath?: string): Promise<{ success: boolean; output: string }> {
    if (this.isElectron()) return window.electronAPI!.fetch(remote, repoPath);
    return this.request('/api/jj/fetch', this.post({ remote, repo: repoPath }), 180000);
  }

  async clone(url: string, targetPath: string): Promise<{ success: boolean; output: string }> {
    if (this.isElectron()) return window.electronAPI!.clone(url, targetPath);
    return this.request('/api/jj/clone', this.post({ url, targetPath }), 300000);
  }

  async openRepoDialog(): Promise<string | null> {
    if (this.isElectron()) return window.electronAPI!.openRepoDialog();
    return null;
  }

  async getExecutionLogs(): Promise<JJExecutionLog[]> {
    if (this.isElectron()) return window.electronAPI!.getExecutionLogs();
    return this.request<JJExecutionLog[]>('/api/jj/logs');
  }

  async getOperations(repoPath?: string): Promise<JJOperationLogEntry[]> {
    if (this.isElectron()) return window.electronAPI!.getOperations(repoPath);
    const qs = this.repoQuery(repoPath);
    return this.request<JJOperationLogEntry[]>(`/api/jj/operations${qs ? `?${qs}` : ''}`);
  }

  async setBinaryPath(binaryPath: string): Promise<boolean> {
    if (this.isElectron()) return window.electronAPI!.setBinaryPath(binaryPath);
    const result = await this.request<{ success: boolean }>('/api/jj/binary', this.post({ binaryPath }));
    return Boolean(result?.success);
  }

  async testBinaryPath(binaryPath: string): Promise<boolean> {
    if (this.isElectron()) return window.electronAPI!.testBinaryPath(binaryPath);
    const result = await this.request<{ success: boolean }>('/api/jj/binary/test', this.post({ binaryPath }));
    return Boolean(result?.success);
  }

  onRepoChanged(callback: (repoPath: string) => void): () => void {
    if (this.isElectron()) return window.electronAPI!.onRepoChanged(callback);
    return () => undefined;
  }

  private post(body: unknown): RequestInit {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  }
}

export const jjApi = new UniversalJJClient();
