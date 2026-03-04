// Orchestrates BrowserWindow lifecycle, IPC handlers, and native OS integrations (file system, Ollama, Google Drive).
// Security: CSP headers are overridden per-request to allow Google OAuth while enforcing strict policy on app pages.

const { app, BrowserWindow, ipcMain, dialog, shell, session, Menu, MenuItem } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const logger = require('./logger');

// 1. Load .env file for Google credentials FIRST
// This must happen before requiring modules that capture process.env at load time
try {
  const envPath = path.join(__dirname, '..', '.env');
  const envContent = fsSync.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  });
  logger.info('✅ .env loaded');
} catch (e) { 
  logger.warn('⚠️ .env not found or failed to load. Using system environment variables.');
}

// 2. Now require modules that depend on process.env
const ollama = require('./ollama-manager');
const googleDrive = require('./google-drive');

// Suppress DevTools console errors related to experimental Autofill protocol
app.commandLine.appendSwitch('disable-features', 'Autofill');

// --- START FIX: Single Instance Lock & GPU Stability ---
// Check for single instance lock to prevent "Access is denied" cache errors
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logger.warn('⚠️ Another instance is already running. Quitting...');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Hardware acceleration is ENABLED by default for smooth performance (Three.js/Fiber).
// If "Gpu Cache Creation failed" persists on certain Windows hardware, 
// we prefer clearing the cache via 'npm run clean:appdata' rather than disabling GPU.
// --- END FIX ---

logger.info('🚀 SCS Main Process Starting...');

let mainWindow;

// Initialize Context Menu (Right Click) logic will be moved to app.whenReady()

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
      sandbox: true, // Enable sandbox for security
      spellcheck: true // Enable native spellcheck
    },
    backgroundColor: '#000000',
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
app.whenReady().then(() => {
  // Set Content Security Policy for the session BEFORE creating the window
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Don't override CSP for Google's own pages (auth, consent, etc.)
    // These need their own CSP to render logos, images, and background checks properly
    const url = details.url || '';
    if (url.includes('accounts.google.com') || 
        url.includes('accounts.youtube.com') || 
        url.includes('oauth2.googleapis.com') ||
        url.includes('gstatic.com') ||
        url.includes('googleusercontent.com') ||
        url.includes('google.com/o/oauth2')) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    const isDev = process.env.NODE_ENV === 'development';
    
    const csp = isDev
      ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173 ws://localhost:5173 https://fonts.googleapis.com https://fonts.gstatic.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data:; " +
        "connect-src 'self' http://localhost:5173 ws://localhost:5173 http://127.0.0.1:11434 https://*.supabase.co wss://*.supabase.co https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com;"
      : "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data:; " +
        "connect-src 'self' http://127.0.0.1:11434 https://*.supabase.co wss://*.supabase.co https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com;"
    
    // Explicitly remove existing CSP headers to prevent conflicts
    const responseHeaders = { ...details.responseHeaders };
    delete responseHeaders['Content-Security-Policy'];
    delete responseHeaders['content-security-policy'];
    
    callback({
      responseHeaders: {
        ...responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });

  createWindow();

  // Initialize Professional Native Context Menu
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();

    // Add Spellcheck Suggestions
    for (const suggestion of params.dictionarySuggestions) {
      menu.append(new MenuItem({
        label: suggestion,
        click: () => mainWindow.webContents.replaceMisspelling(suggestion)
      }));
    }

    // Add separator if there are suggestions
    if (params.dictionarySuggestions.length > 0) {
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Standard Edit Actions
    menu.append(new MenuItem({
      label: 'Cut',
      role: 'cut',
      enabled: params.editFlags.canCut
    }));
    menu.append(new MenuItem({
      label: 'Copy',
      role: 'copy',
      enabled: params.editFlags.canCopy
    }));
    menu.append(new MenuItem({
      label: 'Paste',
      role: 'paste',
      enabled: params.editFlags.canPaste
    }));
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({
      label: 'Select All',
      role: 'selectAll',
      enabled: params.editFlags.canSelectAll
    }));

    // DevTools in development mode
    if (process.env.NODE_ENV === 'development') {
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: 'Inspect Element',
        click: () => {
          mainWindow.webContents.inspectElement(params.x, params.y);
        }
      }));
    }

    menu.popup();
  });

  logger.info('✅ Native context menu system initialized');

  // Relay status changes to renderer (REGISTER BEFORE INIT)
  ollama.onStatusChange((status) => {
    if (mainWindow) {
      mainWindow.webContents.send('ollama:status-change', status);
      // Also send ready/error if it specifically hits those states
      if (status === 'ready') mainWindow.webContents.send('ollama:ready');
      if (status === 'error') mainWindow.webContents.send('ollama:error', 'Ollama encountered an error and is attempting to recover.');
    }
  });

  // ==================== OLLAMA SIDECAR ====================
  logger.info('🧠 Initializing Ollama AI sidecar...');
  ollama.initialize((progress) => {
    // Forward model pull progress to renderer
    if (mainWindow) {
      mainWindow.webContents.send('ollama:pull-progress', progress);
    }
  }).then((ready) => {
    if (ready) {
      logger.info('✅ Ollama AI is fully ready');
      if (mainWindow) mainWindow.webContents.send('ollama:ready');
    } else {
      logger.error('❌ Ollama failed to initialize');
      if (mainWindow) mainWindow.webContents.send('ollama:error', 'Ollama failed to start. Please install Ollama from https://ollama.com');
    }
  }).catch(err => {
    logger.error('❌ Ollama init error:', err);
    // Don't show error to user if app is quitting
  });

  // Set spellcheck language
  session.defaultSession.setSpellCheckerLanguages(['en-US']);
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
 * Open external URL in system browser
 */
ipcMain.handle('open-external', async (event, url) => {
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`Unsupported URL protocol: ${parsedUrl.protocol}`);
    }
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    logger.error('Error opening external URL:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Create folder structure
 */
ipcMain.handle('create-folder', async (event, folderPath) => {
  try {
    await fs.mkdir(folderPath, { recursive: true });
    return { success: true, path: folderPath };
  } catch (error) {
    logger.error('Error creating folder:', error);
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
    logger.error('Error saving PDF:', error);
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
    logger.error('Error reading PDF:', error);
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
    logger.error('Error listing files:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Open folder in system file explorer
 */
ipcMain.handle('open-folder-in-explorer', async (event, folderPath) => {
  try {
    await shell.openPath(folderPath);
    return { success: true };
  } catch (error) {
    logger.error('Error opening folder:', error);
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
    logger.error('Error writing file:', error);
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
    logger.error('Error reading file:', error);
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
      logger.info(`AutoUpdater: ${type}`, data || '');
      mainWindow.webContents.send('update-message', { type, data });
    }
  }

  autoUpdater.on('checking-for-update', () => sendUpdateMessage('checking'));
  autoUpdater.on('update-available', (info) => {
    logger.info('AutoUpdater: New version available', info.version);
    sendUpdateMessage('available', info);
  });
  autoUpdater.on('update-not-available', (info) => sendUpdateMessage('not-available', info));
  autoUpdater.on('error', (err) => {
    logger.error('AutoUpdater Error:', err);
    sendUpdateMessage('error', err.message);
  });
  autoUpdater.on('download-progress', (progress) => {
    // Only log every 20% to avoid log bloat
    if (Math.floor(progress.percent) % 20 === 0) {
      logger.info(`AutoUpdater: Download Progress ${Math.round(progress.percent)}%`);
    }
    sendUpdateMessage('progress', progress);
  });
  autoUpdater.on('update-downloaded', (info) => {
    logger.info('AutoUpdater: Update downloaded and ready for install');
    sendUpdateMessage('downloaded', info);
  });
} catch (error) {
  logger.warn('⚠️ electron-updater not found or failed to load. Auto-updates disabled.', error);
  // Mock autoUpdater to prevent crashes
  autoUpdater = {
    checkForUpdates: async () => logger.info('Updates disabled: electron-updater not available'),
    downloadUpdate: async () => logger.info('Updates disabled: electron-updater not available'),
    quitAndInstall: () => logger.info('Updates disabled: electron-updater not available'),
    checkForUpdatesAndNotify: () => {}
  };
}

// IPC Handlers for Updater
ipcMain.handle('check-for-updates', () => autoUpdater.checkForUpdates());
ipcMain.handle('download-update', () => autoUpdater.downloadUpdate());
ipcMain.handle('quit-and-install', () => autoUpdater.quitAndInstall());

// ==================== OLLAMA IPC HANDLERS ====================

ipcMain.handle('ollama:status', () => ollama.getStatus());

ipcMain.handle('ollama:chat', async (event, { messages, systemPrompt }) => {
  try {
    // Stream tokens back to renderer via events
    const response = await ollama.chat(messages, systemPrompt, (token) => {
      if (mainWindow) {
        mainWindow.webContents.send('ollama:token', token);
      }
    });
    return { success: true, response };
  } catch (err) {
    logger.error('Ollama chat error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('ollama:generate', async (event, prompt) => {
  try {
    const response = await ollama.generate(prompt);
    return { success: true, response };
  } catch (err) {
    logger.error('Ollama generate error:', err);
    return { success: false, error: err.message };
  }
});

// Graceful shutdown
app.on('will-quit', () => {
  logger.info('🛑 App quitting, stopping Ollama...');
  ollama.stopOllama();
});

// Shutdown guard: notify renderer to flush sync queue before closing
app.on('before-quit', (event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:before-quit');
  }
});


/**
 * Delete file
 */
ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    await fs.unlink(filePath);
    return { success: true };
  } catch (error) {
    logger.error('Error deleting file:', error);
    return { success: false, error: error.message };
  }
});

// ==================== GOOGLE DRIVE IPC HANDLERS ====================

ipcMain.handle('gdrive:start-auth', async () => {
  try {
    const result = await googleDrive.startAuthFlow();
    if (mainWindow) {
      mainWindow.webContents.send('gdrive:auth-success', result);
    }
    return { success: true, ...result };
  } catch (error) {
    logger.error('Google Drive auth error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('gdrive:refresh-token', async (event, refreshToken) => {
  try {
    const result = await googleDrive.refreshAccessToken(refreshToken);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('gdrive:find-or-create-folder', async (event, refreshToken) => {
  try {
    const folderId = await googleDrive.findOrCreateMasterFolder(refreshToken);
    return { success: true, folderId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('gdrive:upload-file', async (event, refreshToken, fileName, content, folderId) => {
  try {
    const result = await googleDrive.uploadFile(refreshToken, fileName, content, folderId);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('gdrive:download-file', async (event, refreshToken, fileId) => {
  try {
    const content = await googleDrive.downloadFile(refreshToken, fileId);
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('gdrive:list-files', async (event, refreshToken, folderId) => {
  try {
    const files = await googleDrive.listFiles(refreshToken, folderId);
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('gdrive:delete-file', async (event, refreshToken, fileId) => {
  try {
    await googleDrive.deleteFile(refreshToken, fileId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('gdrive:revoke-token', async (event, token) => {
  try {
    await googleDrive.revokeToken(token);
    return { success: true };
  } catch (error) {
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

logger.info('✅ SCS main process initialized');
