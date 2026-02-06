/**
 * SCS - ELECTRON MAIN PROCESS
 * Handles application lifecycle, window creation, and native file system operations
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

let mainWindow;

// Create the main application window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    backgroundColor: '#0f0f23',
    show: false,
    autoHideMenuBar: true,
    title: 'SCS'
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle events
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ==================== IPC HANDLERS ====================

/**
 * Open folder selection dialog
 */
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Base Folder for SCS',
    buttonLabel: 'Select Folder'
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

/**
 * Create folder structure
 */
ipcMain.handle('create-folder', async (event, folderPath) => {
  try {
    await fs.mkdir(folderPath, { recursive: true });
    return { success: true, path: folderPath };
  } catch (error) {
    console.error('Error creating folder:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Check if folder exists
 */
ipcMain.handle('folder-exists', async (event, folderPath) => {
  try {
    const stats = await fs.stat(folderPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
});

/**
 * Save PDF to file system
 */
ipcMain.handle('save-pdf', async (event, filePath, pdfData) => {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Convert base64 to buffer if needed
    let buffer;
    if (typeof pdfData === 'string') {
      // Remove data URL prefix if present
      const base64Data = pdfData.replace(/^data:application\/pdf;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    } else {
      buffer = Buffer.from(pdfData);
    }

    // Write file
    await fs.writeFile(filePath, buffer);

    // Get file stats
    const stats = await fs.stat(filePath);

    return {
      success: true,
      path: filePath,
      size: stats.size,
      created: stats.birthtime
    };
  } catch (error) {
    console.error('Error saving PDF:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Read PDF from file system
 */
ipcMain.handle('read-pdf', async (event, filePath) => {
  try {
    const data = await fs.readFile(filePath);
    const base64 = data.toString('base64');
    return {
      success: true,
      data: `data:application/pdf;base64,${base64}`
    };
  } catch (error) {
    console.error('Error reading PDF:', error);
    return { success: false, error: error.message };
  }
});

/**
 * List files in a directory
 */
ipcMain.handle('list-files', async (event, folderPath) => {
  try {
    const files = await fs.readdir(folderPath, { withFileTypes: true });
    
    const fileList = await Promise.all(
      files.map(async (file) => {
        const fullPath = path.join(folderPath, file.name);
        const stats = await fs.stat(fullPath);
        
        return {
          name: file.name,
          path: fullPath,
          isDirectory: file.isDirectory(),
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime
        };
      })
    );

    return { success: true, files: fileList };
  } catch (error) {
    console.error('Error listing files:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Open folder in system file explorer
 */
ipcMain.handle('open-folder-in-explorer', async (event, folderPath) => {
  try {
    const { shell } = require('electron');
    await shell.openPath(folderPath);
    return { success: true };
  } catch (error) {
    console.error('Error opening folder:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get app version
 */
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

/**
 * Export backup (save dialog)
 */
ipcMain.handle('export-backup', async (event, defaultFileName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export SCS Backup',
    defaultPath: defaultFileName,
    filters: [
      { name: 'SCS Backup', extensions: ['json'] }
    ],
    buttonLabel: 'Export'
  });

  if (result.canceled) {
    return null;
  }

  return result.filePath;
});

/**
 * Import backup (open dialog)
 */
ipcMain.handle('import-backup', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import SCS Backup',
    filters: [
      { name: 'SCS Backup', extensions: ['json'] }
    ],
    properties: ['openFile'],
    buttonLabel: 'Import'
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

/**
 * Write file (generic)
 */
ipcMain.handle('write-file', async (event, filePath, data) => {
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, data, 'utf8');
    return { success: true, path: filePath };
  } catch (error) {
    console.error('Error writing file:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Read file (generic)
 */
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return { success: true, data };
  } catch (error) {
    console.error('Error reading file:', error);
    return { success: false, error: error.message };
  }
});

// ==================== AUTO UPDATER ====================
let autoUpdater;
let updaterEnabled = false;

try {
  const updaterModule = require('electron-updater');
  autoUpdater = updaterModule.autoUpdater;
  updaterEnabled = true;

  // Configure autoUpdater
  autoUpdater.autoDownload = false; // We'll trigger download manually from UI
  autoUpdater.allowPrerelease = false;

  // Forward update events to renderer
  function sendUpdateMessage(type, data) {
    if (mainWindow) {
      mainWindow.webContents.send('update-message', { type, data });
    }
  }

  autoUpdater.on('checking-for-update', () => sendUpdateMessage('checking'));
  autoUpdater.on('update-available', (info) => sendUpdateMessage('available', info));
  autoUpdater.on('update-not-available', (info) => sendUpdateMessage('not-available', info));
  autoUpdater.on('error', (err) => sendUpdateMessage('error', err.message));
  autoUpdater.on('download-progress', (progress) => sendUpdateMessage('progress', progress));
  autoUpdater.on('update-downloaded', (info) => sendUpdateMessage('downloaded', info));
} catch (error) {
  console.warn('⚠️ electron-updater not found or failed to load. Auto-updates disabled.');
  // Mock autoUpdater to prevent crashes
  autoUpdater = {
    checkForUpdates: async () => console.log('Updates disabled: electron-updater not available'),
    downloadUpdate: async () => console.log('Updates disabled: electron-updater not available'),
    quitAndInstall: () => console.log('Updates disabled: electron-updater not available'),
    checkForUpdatesAndNotify: () => {}
  };
}

// IPC Handlers for Updater
ipcMain.handle('check-for-updates', () => autoUpdater.checkForUpdates());
ipcMain.handle('download-update', () => autoUpdater.downloadUpdate());
ipcMain.handle('quit-and-install', () => autoUpdater.quitAndInstall());


/**
 * Delete file
 */
ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    await fs.unlink(filePath);
    return { success: true };
  } catch (error) {
    console.error('Error deleting file:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Initialize auto-updater after window is ready
 */
app.whenReady().then(() => {
  // Check for updates after a short delay
  setTimeout(() => {
    if (process.env.NODE_ENV !== 'development' && updaterEnabled) {
      autoUpdater.checkForUpdatesAndNotify();
    }
  }, 5000);
});

console.log('✅ SCS main process initialized');
