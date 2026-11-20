/**
 * Jujutsu (jj) VCS Service
 *
 * Executes the real `jj` CLI, parses its output, and surfaces errors instead of
 * fabricating repository data. Every mutating command uses explicit arguments so
 * the GUI never spawns an interactive editor (which would hang a GUI process).
 */

import { execFile } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { promisify } from 'node:util';
import { DEFAULT_REPO_PATH } from '../src/services/defaultRepo';
import type {
  JJCommit,
  JJStatus,
  JJDiffData,
  JJFileDiff,
  JJRepoInfo,
  JJExecutionLog,
  JJOperationLogEntry,
  JJFileChange,
} from '../src/types/jj';

const execFilePromise = promisify(execFile);

// In-memory execution log for auditing & debugging (last 200 commands)
const executionLogs: JJExecutionLog[] = [];
const MAX_LOGS = 200;

let activeRepoPath = DEFAULT_REPO_PATH;
let configuredBinaryPath = 'jj';

interface BinaryCheck {
  binary: string;
  available: boolean;
  version?: string;
}
let binaryCheckCache: BinaryCheck | null = null;

function logCommand(
  command: string,
  args: string[],
  exit_code: number,
  duration_ms: number,
  stdout: string,
  stderr: string,
): JJExecutionLog {
  const log: JJExecutionLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    command,
    args,
    exit_code,
    duration_ms,
    timestamp: new Date().toISOString(),
    stdout,
    stderr,
    success: exit_code === 0,
  };
  executionLogs.unshift(log);
  if (executionLogs.length > MAX_LOGS) {
    executionLogs.length = MAX_LOGS;
  }
  return log;
}

/**
 * JSONL template for `jj log -T`. Produces one JSON object per commit.
 */
const LOG_TEMPLATE =
  `'{ "id": ' ++ commit_id.short(64).escape_json() ++ ', "change_id": ' ++ change_id.short(32).escape_json() ++ ', "description": ' ++ description.escape_json() ++ ', "author": { "name": ' ++ author.name().escape_json() ++ ', "email": ' ++ json(author.email()) ++ ' }, "timestamp": ' ++ committer.timestamp().ago().escape_json() ++ ', "is_working_copy": ' ++ if(current_working_copy, "true", "false") ++ ', "is_empty": ' ++ if(empty, "true", "false") ++ ', "is_immutable": ' ++ if(immutable, "true", "false") ++ ', "is_conflict": ' ++ if(conflict, "true", "false") ++ ', "parents": [ ' ++ parents.map(|c| c.change_id().short(32).escape_json()).join(", ") ++ ' ], "bookmarks": [ ' ++ bookmarks.map(|b| b.name().escape_json()).join(", ") ++ ' ], "tags": [ ' ++ tags.map(|t| t.name().escape_json()).join(", ") ++ ' ], "branches": [ ' ++ remote_bookmarks.map(|b| b.name().escape_json()).join(", ") ++ ' ] }' ++ "\\n"`;

const OP_LOG_TEMPLATE =
  `id.short(12) ++ "\\t" ++ description.first_line() ++ "\\t" ++ user ++ "\\t" ++ time.start().format("%Y-%m-%d %H:%M") ++ "\\n"`;

function parseJsonLines(raw: string): any[] {
  const result: any[] = [];
  let malformed = 0;
  const rawLines = raw.split(/\r?\n/);
  for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
    const line = rawLines[lineIdx];
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      result.push(JSON.parse(trimmed));
    } catch {
      // Count malformed lines instead of silently dropping commits
      malformed += 1;
    }
  }
  if (malformed > 0) {
    console.warn(`[jj-service] ${malformed} línea(s) malformadas descartadas del log de jj`);
  }
  return result;
}

async function checkJj(binaryPath: string = configuredBinaryPath): Promise<BinaryCheck> {
  if (binaryCheckCache && binaryCheckCache.binary === binaryPath) {
    return binaryCheckCache;
  }
  try {
    const res = await execFilePromise(binaryPath, ['--version'], { timeout: 5000 });
    binaryCheckCache = {
      binary: binaryPath,
      available: true,
      version: res.stdout.trim() || 'jj',
    };
  } catch {
    // Never cache a negative result: jj may be installed right after a failure
    binaryCheckCache = null;
    return { binary: binaryPath, available: false };
  }
  return binaryCheckCache;
}

function toBool(value: unknown): boolean {
  return value === true || value === 'true';
}

function normalizeCommit(raw: any): JJCommit {
  const id = String(raw?.id ?? '');
  const changeId = String(raw?.change_id ?? '');
  // The root commit has an epoch timestamp (1970): `ago()` renders it as
  // "56 years ago". Show no date for it instead of a misleading one.
  const isRoot = /^0+$/.test(id) || changeId === 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
  const dedupe = (values: unknown[]): string[] => [...new Set(values.map(String))];
  return {
    id,
    short_id: id.substring(0, 12),
    change_id: changeId,
    short_change_id: changeId.substring(0, 8),
    description: String(raw?.description ?? '').trim(),
    author: {
      name: String(raw?.author?.name ?? ''),
      email: String(raw?.author?.email ?? ''),
    },
    timestamp: isRoot ? '' : String(raw?.timestamp ?? ''),
    is_working_copy: toBool(raw?.is_working_copy),
    is_empty: toBool(raw?.is_empty),
    is_conflict: toBool(raw?.is_conflict),
    is_immutable: toBool(raw?.is_immutable),
    parents: Array.isArray(raw?.parents) ? raw.parents.map(String) : [],
    branches: Array.isArray(raw?.branches) ? dedupe(raw.branches) : [],
    bookmarks: Array.isArray(raw?.bookmarks) ? dedupe(raw.bookmarks) : [],
    tags: Array.isArray(raw?.tags) ? dedupe(raw.tags) : [],
  };
}

// All jj invocations go through one queue per process: concurrent jj commands
// on the same repo contend for the working-copy lock and can leave Git HEAD
// stale, so they are serialized here instead of racing.
let jjQueue: Promise<unknown> = Promise.resolve();

function enqueueJj<T>(task: () => Promise<T>): Promise<T> {
  const run = jjQueue.then(task, task);
  jjQueue = run.catch(() => undefined);
  return run;
}

/**
 * Executes a jj command. Throws a readable error on failure; never falls back to
 * simulated data.
 */
export async function executeJJCommand(
  args: string[],
  cwd: string = activeRepoPath,
  binaryPath: string = configuredBinaryPath,
  timeoutMs = 20000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return enqueueJj(async () => {
  const startTime = Date.now();

  if (!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    throw new Error(`El repositorio no existe o no es una carpeta: ${cwd}`);
  }

  const check = await checkJj(binaryPath);
  if (!check.available) {
    throw new Error(
      `No se encontró el ejecutable de Jujutsu ("${binaryPath}"). Instala jj y asegúrate de que esté en el PATH.`,
    );
  }

  try {
    const result = await execFilePromise(binaryPath, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        PAGER: 'cat',
        NO_COLOR: '1',
      },
    });

    logCommand(binaryPath, args, 0, Date.now() - startTime, result.stdout, result.stderr);
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error: any) {
    const stdout = String(error.stdout || '');
    const stderr = String(error.stderr || '');
    const exitCode = typeof error.code === 'number' ? error.code : 1;
    const detail = stderr.trim() || stdout.trim() || error.message || 'Error ejecutando jj';
    logCommand(binaryPath, args, exitCode, Date.now() - startTime, stdout, stderr || detail);

    if (error.code === 'ENOENT') {
      throw new Error(`No se encontró el ejecutable de Jujutsu ("${binaryPath}").`);
    }
    if (error.killed || error.signal) {
      throw new Error(`El comando jj superó el tiempo límite de ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw new Error(detail);
  }
  });
}

export async function getRepoInfo(repoPath: string = activeRepoPath): Promise<JJRepoInfo> {
  const check = await checkJj();
  // Neutral description of the path: it is only returned with `is_valid: false`
  // and an explicit error, never as if it were a working repository.
  const baseInfo: JJRepoInfo = {
    name: path.basename(repoPath) || 'repositorio',
    path: repoPath,
    is_valid: false,
    is_jj_installed: check.available,
    jj_version: check.version,
    bookmarks_count: 0,
  };

  if (!check.available) {
    return { ...baseInfo, error: 'Jujutsu (jj) no está instalado o no está en el PATH.' };
  }

  try {
    const rootRes = await executeJJCommand(['root'], repoPath);
    const root = rootRes.stdout.trim() || repoPath;

    let bookmarksCount = 0;
    let remoteUrl: string | undefined;
    let remoteName: string | undefined;
    let defaultBranch: string | undefined;

    try {
      const bmRes = await executeJJCommand(['bookmark', 'list', '-T', 'name ++ "\\n"'], root);
      bookmarksCount = bmRes.stdout
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean).length;
    } catch {
      // A repo without bookmarks is still valid
    }

    try {
      const remoteRes = await executeJJCommand(['git', 'remote', 'list'], root);
      const first = remoteRes.stdout.split(/\r?\n/).find(l => l.trim());
      if (first) {
        const [name, ...rest] = first.trim().split(/\s+/);
        remoteName = name;
        remoteUrl = rest.join(' ');
      }
    } catch {
      // No remotes configured
    }

    try {
      const trunkRes = await executeJJCommand(['log', '--no-graph', '-r', 'trunk()', '-T', 'bookmarks.join(" ")'], root);
      defaultBranch = trunkRes.stdout.trim().split(/\s+/).filter(Boolean)[0];
    } catch {
      // trunk() may not resolve in an empty repo
    }

    return {
      name: path.basename(root) || 'repositorio',
      path: root,
      is_valid: true,
      is_jj_installed: true,
      jj_version: check.version,
      remote_url: remoteUrl,
      remote_name: remoteName,
      default_branch: defaultBranch,
      bookmarks_count: bookmarksCount,
    };
  } catch (error: any) {
    return { ...baseInfo, error: error.message };
  }
}

export async function getLog(repoPath: string = activeRepoPath, revset: string = 'all()', limit = 500): Promise<JJCommit[]> {
  const res = await executeJJCommand(
    ['log', '--no-graph', '--color', 'never', '-r', revset, '--limit', String(limit), '-T', LOG_TEMPLATE],
    repoPath,
  );
  return parseJsonLines(res.stdout).map(normalizeCommit);
}

export async function getStatus(repoPath: string = activeRepoPath): Promise<JJStatus> {
  const wcRes = await executeJJCommand(
    ['log', '--no-graph', '--color', 'never', '-r', '@', '-T', LOG_TEMPLATE],
    repoPath,
  );
  const wcRaw = parseJsonLines(wcRes.stdout)[0];
  if (!wcRaw) {
    throw new Error('No se encontró la copia de trabajo (@) en este repositorio.');
  }
  const wc = normalizeCommit(wcRaw);

  let parentCommits: JJStatus['parent_commits'] = [];
  try {
    const pRes = await executeJJCommand(
      ['log', '--no-graph', '--color', 'never', '-r', '@-', '-T', LOG_TEMPLATE],
      repoPath,
    );
    parentCommits = parseJsonLines(pRes.stdout).map(p => ({
      change_id: String(p.change_id ?? ''),
      commit_id: String(p.id ?? ''),
      description: String(p.description ?? '').trim(),
    }));
  } catch {
    // A working-copy commit always has a parent, but keep the UI resilient
  }

  const conflictedFiles = await listConflicts(repoPath);

  let modifiedFiles: JJFileChange[] = [];
  try {
    // `jj diff -r @` returns nothing when the working copy is in conflict,
    // even though the files carry conflict markers. In that case diff
    // explicitly against the first parent so the conflicted files show up.
    const hasConflict = wc.is_conflict || conflictedFiles.length > 0;
    const parentId = parentCommits[0]?.change_id;
    const diff =
      hasConflict && parentId
        ? await getDiff('@', parentId, repoPath)
        : await getDiff('@', undefined, repoPath);
    modifiedFiles = diff.files.map(file => ({
      path: file.path,
      old_path: file.old_path,
      type: file.status === 'renamed' ? 'renamed' : file.status,
      additions: file.additions,
      deletions: file.deletions,
    }));
  } catch {
    // Diff can fail for an uncommitted/partially broken working copy
  }

  return {
    working_copy: {
      change_id: wc.change_id,
      commit_id: wc.id,
      description: wc.description,
      is_empty: Boolean(wc.is_empty),
      is_conflict: Boolean(wc.is_conflict),
    },
    parent_commits: parentCommits,
    modified_files: modifiedFiles,
    conflicted_files: conflictedFiles,
    has_conflicts: wc.is_conflict || conflictedFiles.length > 0,
    current_bookmark: wc.bookmarks[0] || '',
  };
}

async function listConflicts(repoPath: string): Promise<string[]> {
  try {
    const res = await executeJJCommand(['resolve', '--list'], repoPath);
    return res.stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      // `jj resolve --list` prints "<path>    2-sided conflict": strip the
      // known suffix instead of cutting at the first double space, so a
      // filename containing two spaces in a row survives intact.
      .map(line => {
        const m = line.match(/^(.*?)\s{2,}\d+-sided conflict$/);
        return (m ? m[1] : line).replace(/\\/g, '/');
      })
      .filter(Boolean);
  } catch (error: any) {
    // jj exits with code 2 and prints "No conflicts found" when there are none
    if (/no conflicts/i.test(error.message || '')) return [];
    return [];
  }
}

export async function describe(
  revision: string,
  message: string,
  repoPath: string = activeRepoPath,
): Promise<{ success: boolean; message: string }> {
  if (!message || !message.trim()) {
    throw new Error('El mensaje de la descripción es obligatorio');
  }
  const args = !revision || revision === '@' ? ['describe', '-m', message] : ['describe', '-r', revision, '-m', message];
  const res = await executeJJCommand(args, repoPath);
  return { success: true, message: res.stdout || res.stderr };
}

export async function newCommit(
  parentRevision?: string,
  message?: string,
  repoPath: string = activeRepoPath,
): Promise<{ success: boolean; change_id?: string }> {
  const args = ['new'];
  if (parentRevision) args.push(parentRevision);
  if (message) args.push('-m', message);
  await executeJJCommand(args, repoPath);
  return { success: true };
}

export async function commit(
  message: string,
  repoPath: string = activeRepoPath,
): Promise<{ success: boolean; change_id?: string }> {
  await executeJJCommand(['commit', '-m', message], repoPath);
  return { success: true };
}

export async function undo(
  repoPath: string = activeRepoPath,
): Promise<{ success: boolean; restored_operation?: string }> {
  const res = await executeJJCommand(['undo'], repoPath);
  return { success: true, restored_operation: (res.stdout || res.stderr).trim() };
}

export async function split(
  revision: string = '@',
  filesToSplitOff?: string[],
  repoPath: string = activeRepoPath,
  message?: string,
): Promise<{ success: boolean; message?: string }> {
  // In jj, the filesets given to `split` stay in the ORIGINAL (first)
  // commit; the rest move to the new child commit. The name says what jj
  // does with them: they are the files split off into the first part.
  const files = (filesToSplitOff || []).filter(Boolean);
  if (files.length === 0) {
    return {
      success: false,
      message: 'Selecciona al menos un archivo para dividir el commit.',
    };
  }

  // Reject paths that do not exist in the repo: jj would exit 0 with only a
  // "No matching entries" warning and create an empty split.
  const missing = files.filter(f => !fs.existsSync(path.join(repoPath, f)));
  if (missing.length > 0) {
    return {
      success: false,
      message: `No existe(n) en el repositorio: ${missing.join(', ')}`,
    };
  }

  // `-m` prevents jj from opening an interactive editor for the description.
  // Filesets are always provided, so jj never starts the interactive diff editor.
  const res = await executeJJCommand(
    ['split', '-r', revision, '-m', message || 'Dividir commit', ...files],
    repoPath,
  );
  const output = (res.stderr || res.stdout).trim();
  if (/No matching entries/i.test(output)) {
    throw new Error(output);
  }
  return { success: true, message: output };
}

export async function rebase(
  sourceRev: string,
  destinationRev: string,
  repoPath: string = activeRepoPath,
): Promise<{ success: boolean }> {
  // `-r` rebases only the selected revision, without its descendants.
  // (`-s` would drag the whole subtree, which is not what "move this
  // commit" means in the UI.)
  await executeJJCommand(['rebase', '-r', sourceRev, '-d', destinationRev], repoPath);
  return { success: true };
}

export async function abandon(
  revision: string,
  repoPath: string = activeRepoPath,
): Promise<{ success: boolean }> {
  await executeJJCommand(['abandon', revision], repoPath);
  return { success: true };
}

export async function editCommit(
  revision: string = '@',
  repoPath: string = activeRepoPath,
): Promise<{ success: boolean; message?: string }> {
  const res = await executeJJCommand(['edit', revision], repoPath);
  return { success: true, message: (res.stdout || res.stderr).trim() };
}

export async function merge(
  rev1: string,
  rev2: string,
  message?: string,
  repoPath: string = activeRepoPath,
): Promise<{ success: boolean }> {
  const args = ['new', rev1, rev2];
  if (message) args.push('-m', message);
  await executeJJCommand(args, repoPath);
  return { success: true };
}

export async function createBookmark(
  name: string,
  revision: string = '@',
  repoPath: string = activeRepoPath,
): Promise<{ success: boolean }> {
  await executeJJCommand(['bookmark', 'create', name, '-r', revision], repoPath);
  return { success: true };
}

export async function getDiff(
  revision: string = '@',
  targetRevision?: string,
  repoPath: string = activeRepoPath,
): Promise<JJDiffData> {
  const args = targetRevision
    ? ['diff', '--from', targetRevision, '--to', revision, '--git', '--color', 'never']
    : ['diff', '-r', revision, '--git', '--color', 'never'];
  const res = await executeJJCommand(args, repoPath);
  const parsed = parseUnifiedDiff(res.stdout, revision, targetRevision);
  // A conflicted working copy diffs to nothing with `-r @`; diffing
  // explicitly against its first parent shows the conflict markers.
  // (`@-` cannot be used here: on a merge it resolves to every parent.)
  if (parsed.files.length === 0 && revision === '@' && !targetRevision) {
    try {
      const parentRes = await executeJJCommand(
        ['log', '--no-graph', '--color', 'never', '-r', 'parents(@)', '-T', 'change_id.short(32) ++ "\\n"'],
        repoPath,
      );
      const firstParent = parentRes.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0];
      if (firstParent) {
        const res2 = await executeJJCommand(
          ['diff', '--from', firstParent, '--to', '@', '--git', '--color', 'never'],
          repoPath,
        );
        return parseUnifiedDiff(res2.stdout, revision, firstParent);
      }
    } catch {
      return parsed;
    }
  }
  return parsed;
}

interface HunkState {
  oldLine: number;
  newLine: number;
}

function parseUnifiedDiff(raw: string, revision: string, targetRevision?: string): JJDiffData {
  const files: JJFileDiff[] = [];
  let current: JJFileDiff | null = null;
  let hunk: HunkState = { oldLine: 0, newLine: 0 };

  // jj/git quote paths with non-ASCII or special chars as "a/…": strip the
  // quotes (and unescape) so the UI shows the real filename.
  const unquote = (p: string): string => {
    const t = p.trim();
    if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
      try {
        return JSON.parse(t);
      } catch {
        return t.slice(1, -1);
      }
    }
    return t;
  };

  const flush = () => {
    if (!current) return;
    files.push(current);
    current = null;
  };

  const rawLines = raw.split(/\r?\n/);
  for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
    const line = rawLines[lineIdx];
    if (line.startsWith('diff --git ')) {
      flush();
      const match = line.match(/diff --git a\/(.*?) b\/(.*)$/);
      const filePath = unquote(match ? match[2] || match[1] : '').replace(/\\/g, '/');
      current = {
        path: filePath,
        status: 'modified',
        additions: 0,
        deletions: 0,
        lines: [],
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith('new file mode')) {
      current.status = 'added';
      continue;
    }
    if (line.startsWith('deleted file mode')) {
      current.status = 'deleted';
      continue;
    }
    if (line.startsWith('rename from ')) {
      current.old_path = unquote(line.substring('rename from '.length)).replace(/\\/g, '/');
      current.status = 'renamed';
      continue;
    }
    if (line.startsWith('rename to ')) {
      current.path = unquote(line.substring('rename to '.length)).replace(/\\/g, '/');
      continue;
    }
    if (line.startsWith('Binary files ')) {
      current.is_binary = true;
      continue;
    }
    if (
      line.startsWith('index ') ||
      line.startsWith('old mode ') ||
      line.startsWith('new mode ') ||
      line.startsWith('similarity index ') ||
      line.startsWith('dissimilarity index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ')
    ) {
      continue;
    }

    if (line.startsWith('@@')) {
      const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        hunk = { oldLine: Number(match[1]), newLine: Number(match[2]) };
      }
      current.lines.push({ type: 'header', content: line });
      continue;
    }

    if (line.startsWith('+')) {
      current.lines.push({ type: 'add', newLineNumber: hunk.newLine, content: line.slice(1) });
      hunk.newLine += 1;
      current.additions += 1;
    } else if (line.startsWith('-')) {
      current.lines.push({ type: 'delete', oldLineNumber: hunk.oldLine, content: line.slice(1) });
      hunk.oldLine += 1;
      current.deletions += 1;
    } else if (line.startsWith(' ')) {
      current.lines.push({
        type: 'context',
        oldLineNumber: hunk.oldLine,
        newLineNumber: hunk.newLine,
        content: line.slice(1),
      });
      hunk.oldLine += 1;
      hunk.newLine += 1;
    } else if (line === '') {
      // A blank context line comes through as an empty line, not " ".
      // Dropping it would shift every line number below it. The one
      // exception is the trailing "" produced by the final newline of the
      // whole diff output, which is not a real line.
      if (lineIdx === rawLines.length - 1) continue;
      current.lines.push({
        type: 'context',
        oldLineNumber: hunk.oldLine,
        newLineNumber: hunk.newLine,
        content: '',
      });
      hunk.oldLine += 1;
      hunk.newLine += 1;
    } else if (line === '\\ No newline at end of file') {
      current.no_newline_at_eof = true;
      continue;
    }
  }
  flush();

  return {
    revision,
    target_revision: targetRevision,
    files,
    summary: {
      files_changed: files.length,
      additions: files.reduce((acc, file) => acc + file.additions, 0),
      deletions: files.reduce((acc, file) => acc + file.deletions, 0),
    },
  };
}

export async function push(
  remote: string = 'origin',
  bookmark?: string,
  repoPath: string = activeRepoPath,
): Promise<{ success: boolean; output: string }> {
  const args = ['git', 'push', '--remote', remote];
  if (bookmark) args.push('--bookmark', bookmark);
  const res = await executeJJCommand(args, repoPath, configuredBinaryPath, 120000);
  const output = (res.stdout || res.stderr).trim();
  // jj exits 0 even when it pushed nothing ("Nothing changed" / "No matching
  // bookmarks"): reporting success then would be a lie in the UI.
  if (/Nothing changed/i.test(output) || /No matching bookmarks/i.test(output)) {
    throw new Error(output);
  }
  return { success: true, output };
}

export async function fetch(
  remote: string = 'origin',
  repoPath: string = activeRepoPath,
): Promise<{ success: boolean; output: string }> {
  const res = await executeJJCommand(
    ['git', 'fetch', '--remote', remote],
    repoPath,
    configuredBinaryPath,
    120000,
  );
  return { success: true, output: (res.stdout || res.stderr).trim() };
}

export async function clone(
  url: string,
  targetPath: string,
): Promise<{ success: boolean; output: string }> {
  const target = path.resolve(targetPath);
  const parent = path.dirname(target);
  if (!fs.existsSync(parent)) {
    throw new Error(`La carpeta destino no existe: ${parent}`);
  }
  const res = await executeJJCommand(
    ['git', 'clone', url, target],
    parent,
    configuredBinaryPath,
    300000,
  );
  // Deliberately NOT changing the server's active repo here: the caller
  // (the UI) switches repos itself, and a clone must not move another
  // client/view off the repo it was looking at.
  return { success: true, output: (res.stdout || res.stderr).trim() };
}

export async function setBinaryPath(newPath: string): Promise<boolean> {
  const candidate = newPath.trim();
  if (!candidate) return false;
  const check = await checkJj(candidate);
  if (!check.available) return false;
  configuredBinaryPath = candidate;
  binaryCheckCache = check;
  return true;
}

/**
 * Read-only check of a jj binary: runs `--version` without changing the
 * configured binary and without polluting the cache. Used by the
 * "Probar" button in Preferences, which must not apply what it tests.
 */
export async function testBinaryPath(candidate: string): Promise<boolean> {
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  try {
    await execFilePromise(trimmed, ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve one conflicted file non-interactively with a built-in tool:
 * `:ours` keeps side #1 (first parent), `:theirs` keeps side #2.
 * Anything needing a real merge tool still goes through `jj resolve` on
 * the command line, which would open an editor and hang the GUI.
 */
export async function resolveConflict(
  filePath: string,
  side: 'ours' | 'theirs',
  repoPath: string = activeRepoPath,
): Promise<{ success: boolean; output: string }> {
  if (!filePath || !filePath.trim()) {
    throw new Error('Falta el archivo en conflicto a resolver');
  }
  const tool = side === 'ours' ? ':ours' : ':theirs';
  const res = await executeJJCommand(['resolve', '--tool', tool, filePath.trim()], repoPath);
  return { success: true, output: (res.stdout || res.stderr).trim() };
}

export async function setActiveRepo(newPath: string): Promise<JJRepoInfo> {
  activeRepoPath = newPath;
  return getRepoInfo(newPath);
}

export function getExecutionLogs(): JJExecutionLog[] {
  return executionLogs;
}

export async function getOperations(repoPath: string = activeRepoPath): Promise<JJOperationLogEntry[]> {
  // Errors propagate like in getLog/getStatus: returning [] here made a
  // broken repo indistinguishable from "no operations".
  const res = await executeJJCommand(
    ['op', 'log', '--no-graph', '--color', 'never', '--limit', '50', '-T', OP_LOG_TEMPLATE],
    repoPath,
  );
  return res.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [id, description, user, timestamp] = line.split('\t');
      return {
        id: id || `op-${index}`,
        description: description || '(sin descripción)',
        user: user || '',
        timestamp: timestamp || '',
        current: index === 0,
      };
    });
}
