/**
 * Electron Main Process
 *
 * Coordinates native window lifecycle, application menus, dialogs,
 * and handles IPC requests between React and Jujutsu CLI service.
 */

// Loads `.env` before the jj service resolves its default repository.
import 'dotenv/config';
import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import * as path from 'node:path';
import * as jjService from './jj-service';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#1e1e2e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // In development, `npm run dev:electron` sets VITE_DEV_SERVER_URL.
  // Otherwise load the production bundle built by `npm run build`.
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Without this, a failed load (e.g. `electron .` without a build) leaves
  // an invisible window and the app looks hung.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    dialog.showErrorBox(
      'No se pudo cargar Jujutsu GUI',
      `La interfaz no cargó (${errorCode}: ${errorDescription}). Ejecuta \`npm run build\` y vuelve a intentarlo.`,
    );
    app.quit();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  createApplicationMenu();
}

function createApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template: any[] = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Repository',
      submenu: [
        {
          label: 'Open Repository...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const folder = await handleOpenRepoDialog();
            if (folder && mainWindow) {
              mainWindow.webContents.send('repo:changed', folder);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'New Working Copy (@)',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow?.webContents.send('jj:quickAction', 'new');
          },
        },
        {
          label: 'Commit Working Copy...',
          accelerator: 'CmdOrCtrl+Enter',
          click: () => {
            mainWindow?.webContents.send('jj:quickAction', 'commit');
          },
        },
        {
          label: 'Undo Last Operation (jj)',
          accelerator: 'CmdOrCtrl+Alt+Z',
          click: () => {
            mainWindow?.webContents.send('jj:quickAction', 'undo');
          },
        },
        { type: 'separator' },
        {
          label: 'Push to Remote',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => {
            mainWindow?.webContents.send('jj:quickAction', 'push');
          },
        },
        {
          label: 'Fetch from Remote',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => {
            mainWindow?.webContents.send('jj:quickAction', 'fetch');
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Jujutsu Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/martinvonz/jj');
          },
        },
        {
          label: 'Jujutsu Discord Community',
          click: async () => {
            await shell.openExternal('https://discord.gg/vcs');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function handleOpenRepoDialog(): Promise<string | null> {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    // No `createDirectory`: a freshly created folder is never a jj repo
    // and would only fail later with a confusing banner.
    properties: ['openDirectory'],
    title: 'Select Jujutsu Repository Directory',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
}

// Register IPC Handlers
function registerIpcHandlers() {
  ipcMain.handle('jj:getRepoInfo', async (_event, repoPath) => {
    return jjService.getRepoInfo(repoPath);
  });

  ipcMain.handle('jj:getLog', async (_event, repoPath, revset) => {
    return jjService.getLog(repoPath, revset);
  });

  ipcMain.handle('jj:getStatus', async (_event, repoPath) => {
    return jjService.getStatus(repoPath);
  });

  ipcMain.handle('jj:describe', async (_event, revision, message, repoPath) => {
    return jjService.describe(revision, message, repoPath);
  });

  ipcMain.handle('jj:newCommit', async (_event, parentRevision, message, repoPath) => {
    return jjService.newCommit(parentRevision, message, repoPath);
  });

  ipcMain.handle('jj:commit', async (_event, message, repoPath) => {
    return jjService.commit(message, repoPath);
  });

  ipcMain.handle('jj:undo', async (_event, repoPath) => {
    return jjService.undo(repoPath);
  });

  ipcMain.handle('jj:split', async (_event, revision, filesToKeep, repoPath, message) => {
    return jjService.split(revision, filesToKeep, repoPath, message);
  });

  ipcMain.handle('jj:rebase', async (_event, sourceRev, destRev, repoPath) => {
    return jjService.rebase(sourceRev, destRev, repoPath);
  });

  ipcMain.handle('jj:abandon', async (_event, revision, repoPath) => {
    return jjService.abandon(revision, repoPath);
  });

  ipcMain.handle('jj:resolve', async (_event, filePath, side, repoPath) => {
    return jjService.resolveConflict(filePath, side, repoPath);
  });

  ipcMain.handle('jj:editCommit', async (_event, revision, repoPath) => {
    return jjService.editCommit(revision, repoPath);
  });

  ipcMain.handle('jj:merge', async (_event, rev1, rev2, message, repoPath) => {
    return jjService.merge(rev1, rev2, message, repoPath);
  });

  ipcMain.handle('jj:createBookmark', async (_event, name, revision, repoPath) => {
    return jjService.createBookmark(name, revision, repoPath);
  });

  ipcMain.handle('jj:getDiff', async (_event, revision, targetRev, repoPath) => {
    return jjService.getDiff(revision, targetRev, repoPath);
  });

  ipcMain.handle('jj:push', async (_event, remote, bookmark, repoPath) => {
    return jjService.push(remote, bookmark, repoPath);
  });

  ipcMain.handle('jj:fetch', async (_event, remote, repoPath) => {
    return jjService.fetch(remote, repoPath);
  });

  ipcMain.handle('jj:clone', async (_event, url, targetPath) => {
    return jjService.clone(url, targetPath);
  });

  ipcMain.handle('jj:openRepoDialog', async () => {
    return handleOpenRepoDialog();
  });

  ipcMain.handle('jj:getExecutionLogs', async () => {
    return jjService.getExecutionLogs();
  });

  ipcMain.handle('jj:getOperations', async (_event, repoPath) => {
    return jjService.getOperations(repoPath);
  });

  ipcMain.handle('jj:setBinaryPath', async (_event, newPath) => {
    return jjService.setBinaryPath(newPath);
  });

  ipcMain.handle('jj:testBinaryPath', async (_event, newPath) => {
    return jjService.testBinaryPath(newPath);
  });
}

app.whenReady().then(() => {
  // One instance only: two windows would run jj concurrently on the same
  // repo with separate service state.
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
