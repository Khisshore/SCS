/**
 * NEOTRACKR - ELECTRON PRELOAD SCRIPT
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
  
  // Platform detection
  isElectron: true,
  platform: process.platform
});

console.log('✅ NeoTrackr preload script initialized');
