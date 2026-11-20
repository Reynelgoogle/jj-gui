/**
 * React hook for Jujutsu VCS state management.
 *
 * This hook is the single source of truth for repository state. It never
 * fabricates data: if jj fails, the error is exposed through `repoError` and a
 * toast, and the previous (real) data is kept on screen.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { jjApi } from '../services/api';
import { DEFAULT_REPO_PATH } from '../services/defaultRepo';
import type {
  JJCommit,
  JJStatus,
  JJDiffData,
  JJRepoInfo,
  JJExecutionLog,
  JJOperationLogEntry,
  JJConfig,
} from '../types/jj';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
  timestamp: number;
}

const CONFIG_KEY = 'jj_gui_config_v1';
const RECENT_KEY = 'jj_gui_recent_repos_v1';
const LAST_REPO_KEY = 'jj_gui_last_repo';

const DEFAULT_CONFIG: JJConfig = {
  binaryPath: 'jj',
  autoRefresh: true,
  autoRefreshInterval: 30,
  revsetQuery: 'all()',
};

function loadConfig(): JJConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<JJConfig>;
    return {
      binaryPath: typeof parsed.binaryPath === 'string' && parsed.binaryPath ? parsed.binaryPath : 'jj',
      autoRefresh: parsed.autoRefresh !== false,
      autoRefreshInterval:
        typeof parsed.autoRefreshInterval === 'number' && parsed.autoRefreshInterval >= 5
          ? Math.min(parsed.autoRefreshInterval, 3600)
          : 30,
      revsetQuery:
        typeof parsed.revsetQuery === 'string' && parsed.revsetQuery.trim()
          ? parsed.revsetQuery
          : 'all()',
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function loadRecentRepos(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

function loadInitialRepo(): string {
  try {
    const last = localStorage.getItem(LAST_REPO_KEY);
    if (last) return last;
  } catch {
    // ignore
  }
  const recent = loadRecentRepos();
  return recent[0] || DEFAULT_REPO_PATH;
}

export function useJJ() {
  const [commits, setCommits] = useState<JJCommit[]>([]);
  const [status, setStatus] = useState<JJStatus | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<JJCommit | null>(null);
  const [diffData, setDiffData] = useState<JJDiffData | null>(null);
  const [repoInfo, setRepoInfo] = useState<JJRepoInfo | null>(null);
  const [executionLogs, setExecutionLogs] = useState<JJExecutionLog[]>([]);
  const [operations, setOperations] = useState<JJOperationLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [activeRepoPath, setActiveRepoPath] = useState<string>(loadInitialRepo);
  const [config, setConfigState] = useState<JJConfig>(loadConfig);
  const [recentRepos, setRecentRepos] = useState<string[]>(() => {
    const recent = loadRecentRepos();
    const initial = loadInitialRepo();
    if (!initial) return recent;
    return recent.includes(initial) ? recent : [initial, ...recent].slice(0, 8);
  });

  const isMountedRef = useRef(true);
  const activeRepoRef = useRef(activeRepoPath);
  const configRef = useRef(config);
  const actionsRef = useRef<Record<string, () => void>>({});
  // Generation counter + in-flight count: a refresh that started earlier
  // must never overwrite newer data, and `loading` only turns off when the
  // last in-flight refresh finishes.
  const refreshSeqRef = useRef(0);
  const refreshInFlightRef = useRef(0);

  useEffect(() => {
    activeRepoRef.current = activeRepoPath;
  }, [activeRepoPath]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const addToast = useCallback(
    (type: 'success' | 'error' | 'info', title: string, message?: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      setToasts(prev => [...prev.slice(-4), { id, type, title, message, timestamp: Date.now() }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4500);
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addRecentRepo = useCallback((repoPath: string) => {
    if (!repoPath) return;
    try {
      localStorage.setItem(LAST_REPO_KEY, repoPath);
    } catch {
      // ignore
    }
    setRecentRepos(prev => {
      const next = [repoPath, ...prev.filter(p => p.toLowerCase() !== repoPath.toLowerCase())].slice(0, 8);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const refresh = useCallback(
    async (customPath?: string, silent = false) => {
      const targetPath = customPath || activeRepoRef.current;
      const revset = configRef.current.revsetQuery || 'all()';
      const generation = ++refreshSeqRef.current;
      const isStale = () => !isMountedRef.current || generation !== refreshSeqRef.current;

      // No repo selected yet (first launch): show the picker state instead
      // of asking jj about an empty path.
      if (!targetPath) {
        setRepoInfo(null);
        setRepoError('Elige un repositorio para empezar.');
        setCommits([]);
        setStatus(null);
        setSelectedCommit(null);
        setDiffData(null);
        setLoading(false);
        return;
      }

      refreshInFlightRef.current += 1;
      if (!silent) setLoading(true);

      try {
        const info = await jjApi.getRepoInfo(targetPath);
        if (isStale()) return;
        setRepoInfo(info);

        if (!info.is_valid) {
          const message = info.error || `El repositorio no es válido: ${targetPath}`;
          setRepoError(message);
          setCommits([]);
          setStatus(null);
          setSelectedCommit(null);
          setDiffData(null);
          if (!silent) addToast('error', 'Repositorio inválido', message);
          return;
        }

        // Core data is applied as it arrives: a failure in `status` must
        // not discard a good `log`, and the auxiliary calls (operations,
        // execution logs) never fail the whole refresh on their own.
        // The service serializes jj invocations, so these run one at a time
        // without contending for the working-copy lock.
        const logRes = await jjApi.getLog(targetPath, revset);
        if (isStale()) return;
        setCommits(logRes);
        setRepoError(null);

        setSelectedCommit(prevSelected => {
          if (prevSelected) {
            const match = logRes.find(
              c => c.change_id === prevSelected.change_id || c.id === prevSelected.id,
            );
            if (match) return match;
          }
          return logRes.find(c => c.is_working_copy) || logRes[0] || null;
        });

        try {
          const statusRes = await jjApi.getStatus(targetPath);
          if (!isStale()) setStatus(statusRes);
        } catch (error: any) {
          if (!isStale()) {
            setRepoError(error?.message || 'No se pudo leer el estado de la copia de trabajo');
          }
        }

        try {
          const opsRes = await jjApi.getOperations(targetPath);
          if (!isStale()) setOperations(opsRes);
        } catch {
          // Auxiliary data: keep the previous operations list.
        }

        try {
          const logsRes = await jjApi.getExecutionLogs();
          if (!isStale()) setExecutionLogs(logsRes);
        } catch {
          // Auxiliary data: keep the previous log list.
        }
      } catch (error: any) {
        if (isStale()) return;
        const message = error?.message || 'No se pudo comunicar con Jujutsu';
        setRepoError(message);
        if (!silent) addToast('error', 'Error de Jujutsu', message);
      } finally {
        refreshInFlightRef.current -= 1;
        if (isMountedRef.current && !silent && refreshInFlightRef.current <= 0) {
          setLoading(false);
        }
      }
    },
    [addToast],
  );

  // Restore the jj binary saved in the preferences. If it is a custom path and
  // the initial refresh ran with the default `jj`, refresh again afterwards.
  useEffect(() => {
    const binary = configRef.current.binaryPath || 'jj';
    jjApi
      .setBinaryPath(binary)
      .then(ok => {
        if (!ok) {
          addToast('error', 'Binario jj inválido', binary);
          return;
        }
        if (binary !== 'jj') {
          refresh(activeRepoRef.current, true);
        }
      })
      .catch((error: any) => addToast('error', 'No se pudo probar jj', error?.message || binary));
  }, [addToast, refresh]);

  // Load data whenever the repository or revset changes.
  useEffect(() => {
    refresh(activeRepoPath);
  }, [activeRepoPath, config.revsetQuery, refresh]);

  // Load diff when the selected commit changes.
  useEffect(() => {
    let cancelled = false;
    async function loadDiff() {
      if (!selectedCommit) {
        setDiffData(null);
        return;
      }
      try {
        const rev = selectedCommit.is_working_copy ? '@' : selectedCommit.change_id || selectedCommit.id;
        const diff = await jjApi.getDiff(rev, undefined, activeRepoPath);
        if (!cancelled) setDiffData(diff);
      } catch (error: any) {
        if (!cancelled) {
          setDiffData(null);
          addToast('error', 'No se pudo cargar el diff', error?.message);
        }
      }
    }
    loadDiff();
    return () => {
      cancelled = true;
    };
  }, [selectedCommit, activeRepoPath, addToast]);

  // Auto refresh interval
  useEffect(() => {
    if (!config.autoRefresh || config.autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      refresh(activeRepoPath, true);
    }, config.autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [config.autoRefresh, config.autoRefreshInterval, activeRepoPath, refresh]);

  // Native Electron events
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api) return;

    const unsubscribeRepo = api.onRepoChanged((newRepo: string) => {
      setActiveRepoPath(newRepo);
      addRecentRepo(newRepo);
      addToast('info', 'Repositorio abierto', newRepo);
    });

    const unsubscribeQuick = api.onQuickAction?.(action => {
      if (action === 'commit') {
        window.dispatchEvent(new CustomEvent('jj:open-commit-prompt'));
        return;
      }
      actionsRef.current[action]?.();
    });

    return () => {
      unsubscribeRepo();
      unsubscribeQuick?.();
    };
  }, [addRecentRepo, addToast]);

  const describe = async (message: string, revision?: string): Promise<boolean> => {
    const rev =
      revision || (selectedCommit?.is_working_copy ? '@' : selectedCommit?.change_id || '@');
    setActionInProgress(`Describiendo ${rev}...`);
    try {
      const res = await jjApi.describe(rev, message, activeRepoPath);
      if (!res.success) {
        addToast('error', 'No se pudo describir', res.message);
        return false;
      }
      addToast('success', 'Descripción actualizada', rev);
      await refresh(activeRepoPath, true);
      return true;
    } catch (error: any) {
      addToast('error', 'Error al describir', error.message);
      return false;
    } finally {
      setActionInProgress(null);
    }
  };

  const newCommit = async (parentRevision?: string, message?: string): Promise<boolean> => {
    setActionInProgress('Creando nueva copia de trabajo...');
    try {
      await jjApi.newCommit(parentRevision, message, activeRepoPath);
      addToast('success', 'Nuevo commit', 'La copia de trabajo (@) es un commit nuevo.');
      await refresh(activeRepoPath);
      return true;
    } catch (error: any) {
      addToast('error', 'Error en jj new', error.message);
      return false;
    } finally {
      setActionInProgress(null);
    }
  };

  const commitWorkingCopy = async (message: string): Promise<boolean> => {
    setActionInProgress('Cerrando copia de trabajo...');
    try {
      await jjApi.commit(message, activeRepoPath);
      addToast('success', 'Commit creado', message);
      await refresh(activeRepoPath);
      return true;
    } catch (error: any) {
      addToast('error', 'Error en jj commit', error.message);
      return false;
    } finally {
      setActionInProgress(null);
    }
  };

  const undoLastOperation = async (): Promise<boolean> => {
    setActionInProgress('Deshaciendo la última operación...');
    try {
      const res = await jjApi.undo(activeRepoPath);
      addToast('info', 'Operación deshecha', res.restored_operation || 'Estado restaurado');
      await refresh(activeRepoPath);
      return true;
    } catch (error: any) {
      addToast('error', 'Error en jj undo', error.message);
      return false;
    } finally {
      setActionInProgress(null);
    }
  };

  const splitCommit = async (revision: string, filesToSplitOff?: string[], message?: string): Promise<boolean> => {
    setActionInProgress(`Dividiendo ${revision}...`);
    try {
      const res = await jjApi.split(revision, filesToSplitOff, activeRepoPath, message);
      if (!res.success) {
        addToast('error', 'No se pudo dividir', res.message);
        return false;
      }
      addToast('success', 'Commit dividido', res.message || 'Se crearon dos revisiones.');
      await refresh(activeRepoPath);
      return true;
    } catch (error: any) {
      addToast('error', 'Error en jj split', error.message);
      return false;
    } finally {
      setActionInProgress(null);
    }
  };

  const switchToCommit = async (revision: string): Promise<boolean> => {
    setActionInProgress(`Moviendo la copia de trabajo a ${revision}...`);
    try {
      const res = await jjApi.editCommit(revision, activeRepoPath);
      if (!res.success) {
        addToast('error', 'No se pudo cambiar de revisión', res.message);
        return false;
      }
      addToast('success', 'Copia de trabajo movida', `Ahora en ${revision}`);
      await refresh(activeRepoPath);
      return true;
    } catch (error: any) {
      addToast('error', 'Error en jj edit', error.message);
      return false;
    } finally {
      setActionInProgress(null);
    }
  };

  const abandonCommit = async (revision: string): Promise<boolean> => {
    setActionInProgress(`Descartando ${revision}...`);
    try {
      await jjApi.abandon(revision, activeRepoPath);
      addToast('success', 'Revisión descartada', revision);
      await refresh(activeRepoPath);
      return true;
    } catch (error: any) {
      addToast('error', 'Error en jj abandon', error.message);
      return false;
    } finally {
      setActionInProgress(null);
    }
  };

  const resolveConflict = async (filePath: string, side: 'ours' | 'theirs'): Promise<boolean> => {
    setActionInProgress(`Resolviendo ${filePath}...`);
    try {
      await jjApi.resolveConflict(filePath, side, activeRepoPath);
      addToast('success', 'Conflicto resuelto', `${filePath} (${side === 'ours' ? 'nuestro' : 'suyo'})`);
      await refresh(activeRepoPath);
      return true;
    } catch (error: any) {
      addToast('error', 'Error al resolver el conflicto', error.message);
      return false;
    } finally {
      setActionInProgress(null);
    }
  };

  const mergeCommits = async (rev1: string, rev2: string, message?: string): Promise<boolean> => {
    setActionInProgress(`Fusionando ${rev1} + ${rev2}...`);
    try {
      await jjApi.merge(rev1, rev2, message, activeRepoPath);
      addToast('success', 'Merge creado', `Padres: ${rev1} y ${rev2}`);
      await refresh(activeRepoPath);
      return true;
    } catch (error: any) {
      addToast('error', 'Error en jj new (merge)', error.message);
      return false;
    } finally {
      setActionInProgress(null);
    }
  };

  const rebaseCommit = async (source: string, target: string): Promise<boolean> => {
    setActionInProgress(`Rebasando ${source} sobre ${target}...`);
    try {
      await jjApi.rebase(source, target, activeRepoPath);
      addToast('success', 'Rebase completado', `${source} → ${target}`);
      await refresh(activeRepoPath);
      return true;
    } catch (error: any) {
      addToast('error', 'Error en jj rebase', error.message);
      return false;
    } finally {
      setActionInProgress(null);
    }
  };

  const pushToRemote = async (remote?: string, bookmark?: string): Promise<boolean> => {
    if (!remote && !repoInfo?.remote_name) {
      addToast('error', 'Sin remoto configurado', 'Añade uno con: jj git remote add origin <url>');
      return false;
    }
    setActionInProgress('Subiendo cambios al remoto...');
    try {
      const res = await jjApi.push(remote, bookmark, activeRepoPath);
      addToast('success', 'Push completado', res.output);
      await refresh(activeRepoPath);
      return true;
    } catch (error: any) {
      addToast('error', 'Error en jj git push', error.message);
      return false;
    } finally {
      setActionInProgress(null);
    }
  };

  const fetchFromRemote = async (remote?: string): Promise<boolean> => {
    if (!remote && !repoInfo?.remote_name) {
      addToast('error', 'Sin remoto configurado', 'Añade uno con: jj git remote add origin <url>');
      return false;
    }
    setActionInProgress('Descargando cambios del remoto...');
    try {
      const res = await jjApi.fetch(remote, activeRepoPath);
      addToast('info', 'Fetch completado', res.output);
      await refresh(activeRepoPath);
      return true;
    } catch (error: any) {
      addToast('error', 'Error en jj git fetch', error.message);
      return false;
    } finally {
      setActionInProgress(null);
    }
  };

  const cloneRepo = async (url: string, targetPath: string): Promise<boolean> => {
    setActionInProgress(`Clonando ${url}...`);
    try {
      const res = await jjApi.clone(url, targetPath);
      setActiveRepoPath(targetPath);
      addRecentRepo(targetPath);
      addToast('success', 'Repositorio clonado', res.output || targetPath);
      await refresh(targetPath);
      return true;
    } catch (error: any) {
      addToast('error', 'Error al clonar', error.message);
      return false;
    } finally {
      setActionInProgress(null);
    }
  };

  const openRepoDialog = async () => {
    try {
      const folder = await jjApi.openRepoDialog();
      if (folder) {
        setActiveRepoPath(folder);
        addRecentRepo(folder);
        addToast('info', 'Repositorio seleccionado', folder);
      }
    } catch (error: any) {
      addToast('error', 'Error al abrir el diálogo', error.message);
    }
  };

  const switchRepo = async (newPath: string) => {
    const repoPath = newPath.trim();
    if (!repoPath) return;
    setActiveRepoPath(repoPath);
    addRecentRepo(repoPath);
    addToast('info', 'Repositorio cambiado', repoPath);
  };

  const createBookmark = async (name: string, revision?: string): Promise<boolean> => {
    setActionInProgress(`Creando bookmark ${name}...`);
    try {
      await jjApi.createBookmark(
        name,
        revision || (selectedCommit?.is_working_copy ? '@' : selectedCommit?.change_id),
        activeRepoPath,
      );
      addToast('success', 'Bookmark creado', name);
      await refresh(activeRepoPath, true);
      return true;
    } catch (error: any) {
      addToast('error', 'Error al crear el bookmark', error.message);
      return false;
    } finally {
      setActionInProgress(null);
    }
  };

  const setConfig = useCallback(
    (next: JJConfig) => {
      const previous = configRef.current;
      const persist = (cfg: JJConfig) => {
        setConfigState(cfg);
        configRef.current = cfg;
        try {
          localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
        } catch {
          // ignore
        }
      };

      // Validate a changed binary BEFORE persisting it: a broken path saved
      // here would make every refresh fail on the next launch.
      if (next.binaryPath !== previous.binaryPath) {
        jjApi
          .setBinaryPath(next.binaryPath)
          .then(ok => {
            if (ok) {
              persist(next);
              addToast('success', 'Binario jj actualizado', next.binaryPath);
            } else {
              addToast('error', 'Binario jj inválido', next.binaryPath);
            }
          })
          .catch((error: any) => addToast('error', 'No se pudo probar jj', error.message));
        return;
      }
      persist(next);
    },
    [addToast],
  );

  // Keep a ref with the latest action handlers for Electron menu shortcuts.
  // Assigned in an effect, not during render.
  useEffect(() => {
    actionsRef.current = {
      new: () => void newCommit(),
      undo: () => void undoLastOperation(),
      push: () => void pushToRemote(repoInfo?.remote_name),
      fetch: () => void fetchFromRemote(repoInfo?.remote_name),
    };
  });

  return {
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
    addToast,
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
  };
}
