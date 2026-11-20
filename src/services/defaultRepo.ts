/**
 * Default repository used on first launch.
 *
 * - In the browser/Vite build the value is injected as `__JJ_DEFAULT_REPO__`
 *   (see `vite.config.ts`, sourced from `VITE_DEFAULT_REPO`).
 * - In Electron and the Node server it is read from `process.env.VITE_DEFAULT_REPO`.
 * - Otherwise there is NO default: the user picks a repository the first
 *   time (an empty value means "no repo selected yet"). Never hardcode a
 *   personal path here; the previous default pointed at the author's PC.
 *
 * After the first launch the GUI remembers the last opened repo in localStorage.
 */

declare const __JJ_DEFAULT_REPO__: string;

function readNodeEnv(): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const value = process.env.VITE_DEFAULT_REPO;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readInjectedEnv(): string | undefined {
  // `typeof` is safe even when the identifier was not defined (Node bundles).
  const value = typeof __JJ_DEFAULT_REPO__ === 'string' ? __JJ_DEFAULT_REPO__ : '';
  return value.trim() ? value.trim() : undefined;
}

export const DEFAULT_REPO_PATH: string = readNodeEnv() || readInjectedEnv() || '';
