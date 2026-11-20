/**
 * TypeScript types and interfaces for Jujutsu (jj) VCS GUI
 */

export interface JJCommit {
  id: string; // Commit hash (e.g. 32-char hex)
  short_id: string; // Short commit hash (e.g. 10-char hex)
  change_id: string; // Jujutsu change identifier (e.g. "kkmpptxz")
  short_change_id: string; // Short change identifier (e.g. "kkm")
  description: string; // Commit message / description
  author: {
    name: string;
    email: string;
    timestamp?: string;
  };
  committer?: {
    name: string;
    email: string;
    timestamp?: string;
  };
  timestamp: string; // Formatted or ISO date
  is_working_copy: boolean; // Whether this is the '@' working copy commit
  is_head?: boolean; // Root or tip of a branch
  is_empty?: boolean; // True if no tree changes
  is_conflict?: boolean; // True if contains merge conflicts
  is_immutable?: boolean; // True if in immutable ancestor set (e.g. trunk/main)
  parents: string[]; // Parent change_ids or commit IDs
  branches: string[]; // Git branch references pointing to this commit
  bookmarks: string[]; // JJ bookmarks attached to this commit
  tags: string[]; // Git tags
  graph_position?: {
    column: number;
    row: number;
  };
}

export type FileChangeType = 'modified' | 'added' | 'deleted' | 'renamed' | 'conflict' | 'untracked';

export interface JJFileChange {
  path: string;
  old_path?: string;
  type: FileChangeType;
  additions: number;
  deletions: number;
  is_binary?: boolean;
}

export interface JJDiffLine {
  type: 'add' | 'delete' | 'context' | 'header';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export interface JJFileDiff {
  path: string;
  old_path?: string;
  status: FileChangeType;
  lines: JJDiffLine[];
  additions: number;
  deletions: number;
  is_binary?: boolean;
  no_newline_at_eof?: boolean;
}

export interface JJDiffData {
  revision: string;
  target_revision?: string;
  files: JJFileDiff[];
  summary: {
    files_changed: number;
    additions: number;
    deletions: number;
  };
}

export interface JJStatus {
  working_copy: {
    change_id: string;
    commit_id: string;
    description: string;
    is_empty: boolean;
    is_conflict: boolean;
  };
  parent_commits: {
    change_id: string;
    commit_id: string;
    description: string;
  }[];
  modified_files: JJFileChange[];
  conflicted_files: string[];
  divergent_changes?: string[];
  current_bookmark?: string;
  has_conflicts: boolean;
}

export interface JJOperationLogEntry {
  id: string;
  description: string;
  user: string;
  timestamp: string;
  current?: boolean;
}

export interface JJRepoInfo {
  name: string;
  path: string;
  is_valid: boolean;
  is_jj_installed: boolean;
  jj_version?: string;
  remote_url?: string;
  remote_name?: string;
  default_branch?: string;
  bookmarks_count: number;
  error?: string;
}

export interface JJExecutionLog {
  id: string;
  command: string;
  args: string[];
  exit_code: number;
  duration_ms: number;
  timestamp: string;
  stdout: string;
  stderr: string;
  parsed_json?: any;
  success: boolean;
}

export interface JJConfig {
  binaryPath: string;
  autoRefresh: boolean;
  autoRefreshInterval: number; // in seconds
  revsetQuery: string;
}

export interface JJServiceAPI {
  getRepoInfo(repoPath?: string): Promise<JJRepoInfo>;
  getLog(repoPath?: string, revset?: string): Promise<JJCommit[]>;
  getStatus(repoPath?: string): Promise<JJStatus>;
  describe(revision: string, message: string, repoPath?: string): Promise<{ success: boolean; message: string }>;
  newCommit(parentRevision?: string, message?: string, repoPath?: string): Promise<{ success: boolean; change_id?: string }>;
  commit(message: string, repoPath?: string): Promise<{ success: boolean; change_id?: string }>;
  undo(repoPath?: string): Promise<{ success: boolean; restored_operation?: string }>;
  split(revision: string, filesToSplitOff?: string[], repoPath?: string, message?: string): Promise<{ success: boolean; message?: string }>;
  rebase(sourceRev: string, destinationRev: string, repoPath?: string): Promise<{ success: boolean }>;
  abandon(revision: string, repoPath?: string): Promise<{ success: boolean }>;
  resolveConflict(filePath: string, side: 'ours' | 'theirs', repoPath?: string): Promise<{ success: boolean; output: string }>;
  editCommit(revision: string, repoPath?: string): Promise<{ success: boolean; message?: string }>;
  merge(rev1: string, rev2: string, message?: string, repoPath?: string): Promise<{ success: boolean }>;
  createBookmark(name: string, revision?: string, repoPath?: string): Promise<{ success: boolean }>;
  getDiff(revision: string, targetRevision?: string, repoPath?: string): Promise<JJDiffData>;
  push(remote?: string, bookmark?: string, repoPath?: string): Promise<{ success: boolean; output: string }>;
  fetch(remote?: string, repoPath?: string): Promise<{ success: boolean; output: string }>;
  clone(url: string, targetPath: string): Promise<{ success: boolean; output: string }>;
  openRepoDialog(): Promise<string | null>;
  getExecutionLogs(): Promise<JJExecutionLog[]>;
  getOperations(repoPath?: string): Promise<JJOperationLogEntry[]>;
  setBinaryPath(path: string): Promise<boolean>;
  testBinaryPath(path: string): Promise<boolean>;
  onRepoChanged(callback: (repoPath: string) => void): () => void;
  onQuickAction?(callback: (action: string) => void): () => void;
}
