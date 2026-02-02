/**
 * EXPORT/IMPORT UTILITIES
 * Handle data backup and restore operations
 */

import { db } from '../db/database.js';
import { fileSystem } from '../services/fileSystem.js';

/**
 * Export all database data to JSON file
 */
export async function exportDatabase() {
  try {
    const data = await db.exportData();
    
    // Create filename with timestamp
    const filename = generateBackupFilename();
    
    // Convert to JSON
    const jsonString = JSON.stringify(data, null, 2);
    
    // Create blob and download
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    
    URL.revokeObjectURL(url);
    
    return { success: true, filename };
  } catch (error) {
    console.error('Export error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Import database from JSON file
 * @param {File} file - JSON file to import
 */
export async function importDatabase(file) {
  try {
    // Read file
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Validate data structure using DB service
    if (!db.validateData(data)) {
      throw new Error('Invalid backup file format');
    }
    
    // [New Safety Step] Create emergency backup before clearing current DB
    const backupPath = await fileSystem.createLocalEmergencyBackup();
    console.log('🛡️ Emergency backup created before manual import:', backupPath);

    // Import data
    db.isImporting = true;
    await db.importData(data);
    db.isImporting = false;
    
    return { success: true, backupPath };
  } catch (error) {
    console.error('Import error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Export data to CSV format
 * @param {Array} data - Array of objects to export
 * @param {string} filename - Filename for the CSV
 */
export function exportToCSV(data, filename) {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }
  
  // Get headers from first object
  const headers = Object.keys(data[0]);
  
  // Create CSV content
  let csv = headers.join(',') + '\n';
  
  data.forEach(row => {
    const values = headers.map(header => {
      const value = row[header];
      
      // Escape quotes and wrap in quotes if contains comma
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      
      return value;
    });
    
    csv += values.join(',') + '\n';
  });
  
  // Download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  
  URL.revokeObjectURL(url);
}

/**
 * Generate backup filename with timestamp
 * @returns {string} - Filename
 */
export function generateBackupFilename() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  return `payment-system-backup-${year}${month}${day}-${hours}${minutes}.json`;
}

/**
 * Trigger file input for import
 * @param {function} callback - Callback function when file is selected
 */
export function triggerImportDialog(callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const result = await importDatabase(file);
      callback(result);
    }
  };
  
  input.click();
}
