/**
 * SCS - ELECTRON PRELOAD SCRIPT
 * Secure bridge between renderer and main process using contextBridge
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Folder operations
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  createFolder: (path) => ipcRenderer.invoke('create-folder', path),
  folderExists: (path) => ipcRenderer.invoke('folder-exists', path),
  openFolderInExplorer: (path) => ipcRenderer.invoke('open-folder-in-explorer', path),
  
  // PDF operations
  savePDF: (filePath, pdfData) => ipcRenderer.invoke('save-pdf', filePath, pdfData),
  readPDF: (filePath) => ipcRenderer.invoke('read-pdf', filePath),
  
  // File operations
  listFiles: (folderPath) => ipcRenderer.invoke('list-files', folderPath),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  
  // Backup operations
  exportBackup: (defaultFileName) => ipcRenderer.invoke('export-backup', defaultFileName),
  importBackup: () => ipcRenderer.invoke('import-backup'),
  
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Open external URL
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Platform detection
  isElectron: true,
  platform: process.platform,

  // Updater operations
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
    onUpdateMessage: (callback) => {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on('update-message', subscription);
      return () => ipcRenderer.removeListener('update-message', subscription);
    }
  },

  // Ollama AI operations
  ollama: {
    chat: (messages, systemPrompt) => ipcRenderer.invoke('ollama:chat', { messages, systemPrompt }),
    generate: (prompt) => ipcRenderer.invoke('ollama:generate', prompt),
    getStatus: () => ipcRenderer.invoke('ollama:status'),
    onToken: (callback) => {
      const handler = (event, token) => callback(token);
      ipcRenderer.on('ollama:token', handler);
      return () => ipcRenderer.removeListener('ollama:token', handler);
    },
    onPullProgress: (callback) => {
      const handler = (event, progress) => callback(progress);
      ipcRenderer.on('ollama:pull-progress', handler);
      return () => ipcRenderer.removeListener('ollama:pull-progress', handler);
    },
    onReady: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('ollama:ready', handler);
      return () => ipcRenderer.removeListener('ollama:ready', handler);
    },
    onError: (callback) => {
      const handler = (event, msg) => callback(msg);
      ipcRenderer.on('ollama:error', handler);
      return () => ipcRenderer.removeListener('ollama:error', handler);
    },
    onStatusChange: (callback) => {
      const handler = (event, status) => callback(status);
      ipcRenderer.on('ollama:status-change', handler);
      return () => ipcRenderer.removeListener('ollama:status-change', handler);
    },
  },

  // Google Drive Cloud Mirror operations
  googleDrive: {
    startAuth: () => ipcRenderer.invoke('gdrive:start-auth'),
    refreshToken: (token) => ipcRenderer.invoke('gdrive:refresh-token', token),
    findOrCreateFolder: (refreshToken) => ipcRenderer.invoke('gdrive:find-or-create-folder', refreshToken),
    uploadFile: (refreshToken, fileName, content, folderId) => ipcRenderer.invoke('gdrive:upload-file', refreshToken, fileName, content, folderId),
    downloadFile: (refreshToken, fileId) => ipcRenderer.invoke('gdrive:download-file', refreshToken, fileId),
    listFiles: (refreshToken, folderId) => ipcRenderer.invoke('gdrive:list-files', refreshToken, folderId),
    deleteFile: (refreshToken, fileId) => ipcRenderer.invoke('gdrive:delete-file', refreshToken, fileId),
    revokeToken: (token) => ipcRenderer.invoke('gdrive:revoke-token', token),
    onAuthSuccess: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('gdrive:auth-success', handler);
      return () => ipcRenderer.removeListener('gdrive:auth-success', handler);
    }
  },

  // App lifecycle
  onBeforeQuit: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:before-quit', handler);
    return () => ipcRenderer.removeListener('app:before-quit', handler);
  }

});

console.log('✅ SCS preload script initialized');
