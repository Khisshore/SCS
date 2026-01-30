/**
 * FILE SYSTEM SERVICE
 * Manages structured folder creation and PDF file operations for NeoTrackr
 * Folder Structure: NeoTrackr/{Course}/{StudentName}/{Semester}/
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

    // Create NeoTrackr folder inside selected path
    const neoTrackrPath = `${selectedPath}\\NeoTrackr`;
    const result = await window.electronAPI.createFolder(neoTrackrPath);

    if (result.success) {
      this.baseFolder = neoTrackrPath;
      await db.setSetting('baseFolder', neoTrackrPath);
      console.log('✅ Base folder set:', neoTrackrPath);
      return neoTrackrPath;
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
   * Path: {baseFolder}/NeoTrackr/{Course}/{Program}/{StudentName}/{Semester}/
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
    const filePath = this.getPDFFilePath(course, studentName, semester, fileName);

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
   * Check if running in Electron
   */
  isDesktopApp() {
    return this.isElectron;
  }
}

// Create and export singleton instance
const fileSystem = new FileSystemService();

export { fileSystem };
