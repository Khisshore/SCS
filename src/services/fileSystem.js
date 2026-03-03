/**
 * FILE SYSTEM SERVICE
 * Manages structured folder creation and PDF file operations for SCS
 * Folder Structure: SCS/{Course}/{StudentName}/{Semester}/
 */

import { db } from '../db/database.js';

class FileSystemService {
  constructor() {
    this.baseFolder = null;
    this.isElectron = window.electronAPI?.isElectron || false;
  }

  /**
   * Initialize file system - load base folder from settings
   */
  async init() {
    if (!this.isElectron) {
      console.warn('⚠️ Not running in Electron - file system features disabled');
      return false;
    }

    this.baseFolder = await db.getSetting('baseFolder');
    
    if (!this.baseFolder) {
      console.log('📁 No base folder set - first run setup required');
      return false;
    }

    // Verify folder still exists
    const exists = await window.electronAPI.folderExists(this.baseFolder);
    if (!exists) {
      console.warn('⚠️ Base folder no longer exists:', this.baseFolder);
      this.baseFolder = null;
      await db.setSetting('baseFolder', null);
      return false;
    }

    console.log('✅ File system initialized:', this.baseFolder);
    return true;
  }

  /**
   * Select base folder (first-run or change folder)
   */
  async selectBaseFolder() {
    if (!this.isElectron) {
      throw new Error('Folder selection only available in desktop app');
    }

    const selectedPath = await window.electronAPI.selectFolder();
    
    if (!selectedPath) {
      return null; // User cancelled
    }

    // Check if the user selected the project folder directly (SCS)
    const folderName = selectedPath.split('\\').pop();
    let scsPath = selectedPath;
    
    // Only append \SCS if the selected folder isn't already the project folder
    if (folderName !== 'SCS') {
      scsPath = `${selectedPath}\\SCS`;
    }

    const result = await window.electronAPI.createFolder(scsPath);

    if (result.success) {
      this.baseFolder = scsPath;
      await db.setSetting('baseFolder', scsPath);
      console.log('✅ Base folder set:', scsPath);
      return scsPath;
    }

    throw new Error(result.error);
  }

  /**
   * Get current base folder
   */
  getBaseFolder() {
    return this.baseFolder;
  }

  /**
   * Sanitize folder/file name - remove invalid characters
   */
  sanitizeName(name) {
    // Remove invalid Windows file system characters
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').trim();
  }

  /**
   * Generate student folder path
   * Path: {baseFolder}/SCS/{Course}/{Program}/{StudentName}/{Semester}/
   * If semester is null/empty, returns path to Student folder
   */
  getStudentFolderPath(course, program, studentName, semester = null) {
    if (!this.baseFolder) {
      throw new Error('Base folder not set');
    }

    const sanitizedCourse = this.sanitizeName(course || 'Other');
    const sanitizedProgram = this.sanitizeName(program || 'General');
    const sanitizedStudent = this.sanitizeName(studentName);
    
    let path = `${this.baseFolder}\\${sanitizedCourse}\\${sanitizedProgram}\\${sanitizedStudent}`;
    
    if (semester) {
      const sanitizedSemester = this.sanitizeName(semester);
      path += `\\${sanitizedSemester}`;
    }

    return path;
  }

  /**
   * Create folder structure for a student
   */
  async createFolderStructure(course, program, studentName, semester = null) {
    if (!this.isElectron) {
      return { success: true, path: null }; // No-op for web version
    }

    const folderPath = this.getStudentFolderPath(course, program, studentName, semester);
    const result = await window.electronAPI.createFolder(folderPath);

    if (result.success) {
      console.log('✅ Created folder:', folderPath);
    }

    return result;
  }

  /**
   * Generate PDF file path
   */
  getPDFFilePath(course, program, studentName, semester, fileName) {
    const folderPath = this.getStudentFolderPath(course, program, studentName, semester);
    const sanitizedFileName = this.sanitizeName(fileName);
    return `${folderPath}\\${sanitizedFileName}.pdf`;
  }

  /**
   * Save PDF to file system
   */
  async savePDF(course, program, studentName, semester, fileName, pdfData) {
    if (!this.isElectron) {
      console.log('📄 Web version - PDF not saved to disk');
      return { success: true, path: null };
    }

    // Ensure folder exists
    await this.createFolderStructure(course, program, studentName, semester);

    // Generate file path
    const filePath = this.getPDFFilePath(course, program, studentName, semester, fileName);

    // Save PDF
    const result = await window.electronAPI.savePDF(filePath, pdfData);

    if (result.success) {
      console.log('✅ PDF saved:', filePath);
      
      // Store file metadata in database
      await this.storeFileMetadata({
        filePath: result.path,
        fileName: fileName,
        course: course,
        studentName: studentName,
        semester: semester,
        fileSize: result.size,
        createdDate: result.created || new Date().toISOString()
      });
    } else {
      console.error('❌ Failed to save PDF:', result.error);
    }

    return result;
  }

  /**
   * Read PDF from file system
   */
  async readPDF(filePath) {
    if (!this.isElectron) {
      throw new Error('File reading only available in desktop app');
    }

    return await window.electronAPI.readPDF(filePath);
  }

  /**
   * Delete PDF from file system
   */
  async deletePDF(course, program, studentName, semester, fileName) {
    if (!this.isElectron) {
      return { success: true };
    }

    const filePath = this.getPDFFilePath(course, program, studentName, semester, fileName);
    const syncTwoWayDeletion = (await db.getSetting('syncTwoWayDeletion')) !== false;
    
    // If Two-Way Deletion is OFF, we skip the physical file deletion
    if (!syncTwoWayDeletion) {
      console.log('🛡️ Two-way deletion is OFF. Removing metadata but keeping physical file.');
      try {
        const existing = await db.getByIndex('fileMetadata', 'filePath', filePath);
        if (existing && existing.length > 0) {
          await db.delete('fileMetadata', existing[0].id);
        }
      } catch (err) {
        console.warn('Metadata removal failed:', err);
      }
      return { success: true, message: 'Metadata removed, file preserved.' };
    }

    const result = await window.electronAPI.deleteFile(filePath);

    if (result.success) {
      console.log('🗑️ PDF deleted:', filePath);
      // Remove from metadata cache if we have it
      try {
        const existing = await db.getByIndex('fileMetadata', 'filePath', filePath);
        if (existing && existing.length > 0) {
          await db.delete('fileMetadata', existing[0].id);
        }
      } catch (err) {
        console.warn('Metadata removal failed:', err);
      }
    }

    return result;
  }

   /**
   * List files in a student's semester folder
   */
  async listStudentFiles(course, program, studentName, semester = null) {
    if (!this.isElectron) {
      return { success: true, files: [] };
    }

    const folderPath = this.getStudentFolderPath(course, program, studentName, semester);
    const exists = await window.electronAPI.folderExists(folderPath);

    if (!exists) {
      return { success: true, files: [] };
    }

    return await window.electronAPI.listFiles(folderPath);
  }

  /**
   * Open folder in system file explorer
   */
  async openInExplorer(course, program, studentName, semester = null) {
    if (!this.isElectron) {
      throw new Error('Explorer integration only available in desktop app');
    }

    const folderPath = this.getStudentFolderPath(course, program, studentName, semester);
    
    // Create folder if it doesn't exist
    await this.createFolderStructure(course, program, studentName, semester);
    
    return await window.electronAPI.openFolderInExplorer(folderPath);
  }

  /**
   * Store file metadata in IndexedDB
   */
  async storeFileMetadata(metadata) {
    try {
      // Check if metadata already exists
      const existing = await db.getByIndex('fileMetadata', 'filePath', metadata.filePath);
      
      if (existing && existing.length > 0) {
        // Update existing
        await db.update('fileMetadata', { ...existing[0], ...metadata });
      } else {
        // Add new
        await db.add('fileMetadata', metadata);
      }
    } catch (error) {
      console.error('Error storing file metadata:', error);
    }
  }

  /**
   * Save a full system snapshot to the library folder
   * This is the heart of the "Portable Library" feature
   * Enhanced with conflict detection
   */
  async saveSystemSnapshot(force = false) {
    if (!this.baseFolder || !this.isElectron) return { success: false, reason: 'unsupported' };

    try {
      const snapshotPath = `${this.baseFolder}\\sync_data.json`;
      
      // Conflict Detection: Only check if NOT forced
      if (!force) {
        const existing = await this.checkSnapshot();
        if (existing) {
          const lastSavedLocally = await db.getSetting('lastSyncTimestamp');
          const diskModified = new Date(existing.modified).getTime();
          
          // If disk version is newer than our last known sync, we have a potential conflict
          if (lastSavedLocally && diskModified > lastSavedLocally + 2000) { // 2s buffer
             console.warn('⚠️ Conflict detected: Disk version is newer than last local sync');
             return { success: false, reason: 'conflict', diskTime: existing.modified };
          }
        }
      }

      const data = await db.exportData();
      const timestamp = Date.now();
      data.syncTimestamp = timestamp;

      const result = await window.electronAPI.writeFile(snapshotPath, JSON.stringify(data, null, 2));
      
      if (result.success) {
        // [Safety Guard] Prevent this metadata update from triggering another sync
        db.isImporting = true;
        await db.setSetting('lastSyncTimestamp', timestamp);
        db.isImporting = false;
        
        console.log('🔄 System snapshot updated in library');
        return { success: true };
      }
    } catch (error) {
      console.error('❌ Failed to save system snapshot:', error);
    }
    return { success: false, reason: 'error' };
  }

  /**
   * Create a local backup file before risky operations (like Import)
   */
  async createLocalEmergencyBackup() {
    if (!this.isElectron) return null;
    
    try {
      const data = await db.exportData();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${this.baseFolder}\\backups\\auto-backup-${timestamp}.json`;
      
      // Ensure backup folder exists
      await window.electronAPI.createFolder(`${this.baseFolder}\\backups`);
      
      const result = await window.electronAPI.writeFile(backupPath, JSON.stringify(data, null, 2));
      return result.success ? backupPath : null;
    } catch (e) {
      console.error('Failed to create emergency backup:', e);
      return null;
    }
  }

  /**
   * Check if a snapshot exists and is valid
   */
  async checkSnapshot() {
    if (!this.baseFolder || !this.isElectron) return null;
    
    const snapshotPath = `${this.baseFolder}\\sync_data.json`;
    const exists = await window.electronAPI.folderExists(snapshotPath); // Note: stats work for files too in our bridge usually, but let's check
    
    // Actually our bridge might need a fileExists. Looking at preload/main... 
    // main.js has list-files and folder-exists. folder-exists uses fs.stat and checks isDirectory.
    // I should check if there's a better tool or if I can use list-files.
    
    const files = await window.electronAPI.listFiles(this.baseFolder);
    if (files.success) {
      const snapshot = files.files.find(f => f.name === 'sync_data.json');
      return snapshot || null;
    }
    return null;
  }

  /**
   * Load system snapshot from library folder
   */
  async loadSystemSnapshot() {
    if (!this.baseFolder || !this.isElectron) return null;

    const snapshotPath = `${this.baseFolder}\\sync_data.json`;
    const result = await window.electronAPI.readFile(snapshotPath);
    
    if (result.success) {
      try {
        if (!result.data || typeof result.data !== 'string') {
          console.warn('📂 Snapshot data is empty or invalid.');
          return null;
        }
        return JSON.parse(result.data);
      } catch (e) {
        console.error('❌ Failed to parse snapshot JSON:', e.message);
        console.debug('Raw data sample:', result.data?.substring(0, 100));
      }
    }
    return null;
  }

  /**
   * Get file metadata from IndexedDB
   */
  async getFileMetadata(filePath) {
    const results = await db.getByIndex('fileMetadata', 'filePath', filePath);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get all files for a student
   */
  async getStudentFiles(studentName) {
    try {
      const results = await db.getByIndex('fileMetadata', 'studentName', studentName);
      return results;
    } catch (error) {
      console.error('Error getting student files:', error);
      return [];
    }
  }

  /**
   * Scan the entire library to find orphaned PDF files and import them
   * This handles files added manually to the Google Drive folder
   */
  async scanLibrary() {
    if (!this.baseFolder || !this.isElectron) return { found: 0, imported: 0 };

    try {
      console.log('🔍 Starting full library scan...');
      const result = await window.electronAPI.scanDirectory(this.baseFolder);
      
      if (!result.success) return { found: 0, imported: 0 };

      const pdfFiles = result.files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
      let importedCount = 0;

      for (const file of pdfFiles) {
        const pathParts = file.path.split('\\');
        // Structure: ...\SCS\{Course}\{Program}\{StudentName}\{Semester}\{FileName}.pdf
        // Part of the path might contain the base folder. We need to parse from the end.
        
        const fileName = pathParts.pop().replace('.pdf', '');
        const semester = pathParts.pop();
        const studentName = pathParts.pop();
        const program = pathParts.pop();
        const course = pathParts.pop();

        // Check if metadata exists
        const existing = await db.getByIndex('fileMetadata', 'filePath', file.path);
        
        if (!existing || existing.length === 0) {
          await this.storeFileMetadata({
            filePath: file.path,
            fileName: fileName,
            course: course,
            studentName: studentName,
            semester: semester,
            fileSize: file.size,
            createdDate: file.created || new Date().toISOString()
          });
          importedCount++;
        }
      }

      console.log(`✅ Scan finished. Found ${pdfFiles.length}, Imported ${importedCount}`);
      return { found: pdfFiles.length, imported: importedCount };
    } catch (err) {
      console.error('❌ Library scan failed:', err);
      throw err;
    }
  }

  /**
   * Verify if a folder exists and is accessible
   */
  async isFolderHealthy(path) {
    if (!this.isElectron || !path) return false;
    try {
      return await window.electronAPI.folderExists(path);
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if running in Electron
   */
  isDesktopApp() {
    return this.isElectron;
  }
}

// Create and export singleton instance
const fileSystem = new FileSystemService();

export { fileSystem };
