/**
 * IMPORT SERVICE
 * Intelligent data import with spreadsheet parsing and proof matching
 */

import * as XLSX from 'xlsx';
import { db } from '../db/database.js';
import { fileSystem } from './fileSystem.js';

/**
 * Parse Excel/CSV file and extract structured data
 * @param {File} file - The spreadsheet file to parse
 * @returns {Promise<Object>} Parsed data with headers and rows
 */
export async function parseSpreadsheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get first sheet
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        
        if (jsonData.length === 0) {
          reject(new Error('Spreadsheet is empty'));
          return;
        }
        
        // Extract headers (first row) and data rows
        const headers = jsonData[0].map(h => String(h || '').trim());
        const rows = jsonData.slice(1).filter(row => row.some(cell => cell !== null && cell !== undefined && cell !== ''));
        
        resolve({
          headers,
          rows,
          totalRows: rows.length,
          sheetName: workbook.SheetNames[0]
        });
      } catch (error) {
        reject(new Error(`Failed to parse spreadsheet: ${error.message}`));
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Intelligently map spreadsheet columns to NeoTrackr fields
 * Uses fuzzy matching to detect common column names
 * @param {Array<string>} headers - Column headers from spreadsheet
 * @returns {Object} Suggested mapping object
 */
export function suggestColumnMapping(headers) {
  const mapping = {
    studentName: null,
    studentId: null,
    course: null,
    semester: null,
    amount: null,
    paymentDate: null,
    method: null,
    reference: null
  };
  
  const patterns = {
    studentName: /^(student|name|full[\s_-]?name|nama)$/i,
    studentId: /^(student[\s_-]?id|matric|id|no\.?|number)$/i,
    course: /^(course|program|programme|major|kursus)$/i,
    semester: /^(semester|sem|year|tahun)$/i,
    amount: /^(amount|total|payment|paid|sum|jumlah|rm|ringgit)$/i,
    paymentDate: /^(date|payment[\s_-]?date|tarikh|when)$/i,
    method: /^(method|payment[\s_-]?method|type|cara)$/i,
    reference: /^(ref|reference|receipt[\s_-]?no|transaction)$/i
  };
  
  headers.forEach((header, index) => {
    const cleanHeader = header.trim();
    
    for (const [field, pattern] of Object.entries(patterns)) {
      if (!mapping[field] && pattern.test(cleanHeader)) {
        mapping[field] = index;
      }
    }
  });
  
  return mapping;
}

/**
 * Transform spreadsheet rows into payment records using column mapping
 * @param {Array} rows - Data rows from spreadsheet
 * @param {Object} mapping - Column index mapping
 * @param {Array<string>} headers - Original headers for reference
 * @returns {Array<Object>} Transformed payment records
 */
export function transformToPayments(rows, mapping, headers) {
  const payments = [];
  
  rows.forEach((row, rowIndex) => {
    try {
      const payment = {
        studentName: mapping.studentName !== null ? String(row[mapping.studentName] || '').trim() : '',
        studentId: mapping.studentId !== null ? String(row[mapping.studentId] || '').trim() : '',
        course: mapping.course !== null ? String(row[mapping.course] || '').trim() : '',
        semester: mapping.semester !== null ? String(row[mapping.semester] || '').trim() : 'Semester 1',
        amount: mapping.amount !== null ? parseFloat(row[mapping.amount]) || 0 : 0,
        paymentDate: mapping.paymentDate !== null ? parseDate(row[mapping.paymentDate]) : new Date(),
        method: mapping.method !== null ? String(row[mapping.method] || 'Cash').trim() : 'Cash',
        reference: mapping.reference !== null ? String(row[mapping.reference] || '').trim() : '',
        rowIndex: rowIndex + 2, // +2 because of header row and 0-indexing
        proofPath: null // Will be populated by proof matching
      };
      
      // Only add if we have at least a name or ID
      if (payment.studentName || payment.studentId) {
        payments.push(payment);
      }
    } catch (error) {
      console.warn(`Failed to parse row ${rowIndex + 2}:`, error);
    }
  });
  
  return payments;
}

/**
 * Parse various date formats from spreadsheet cells
 * @param {*} value - Cell value that might be a date
 * @returns {Date} Parsed date or current date
 */
function parseDate(value) {
  if (!value) return new Date();
  
  // Excel serial date number
  if (typeof value === 'number') {
    return XLSX.SSF.parse_date_code(value);
  }
  
  // String date
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  // Already a Date object
  if (value instanceof Date) {
    return value;
  }
  
  return new Date();
}

/**
 * Scan a folder for proof files (PDFs and images) and try to match them to payment records
 * @param {Array<Object>} payments - Payment records to match against
 * @param {string} folderPath - Path to folder containing proof files
 * @returns {Promise<Array<Object>>} Payments with matched proof paths
 */
export async function matchProofFiles(payments, folderPath) {
  if (!fileSystem.isDesktopApp() || !folderPath) {
    return payments;
  }
  
  try {
    // Get list of files from folder
    const files = await window.electronAPI.listFiles(folderPath);
    const proofFiles = files.filter(f => 
      /\.(pdf|png|jpg|jpeg|gif)$/i.test(f.toLowerCase())
    );
    
    // Match each payment to a proof file
    const matchedPayments = payments.map(payment => {
      // Try to find proof file by matching student ID or name in filename
      const matchedFile = proofFiles.find(filename => {
        const nameMatch = payment.studentId && filename.toLowerCase().includes(payment.studentId.toLowerCase());
        const fallbackMatch = payment.studentName && filename.toLowerCase().includes(payment.studentName.toLowerCase().replace(/\s+/g, ''));
        return nameMatch || fallbackMatch;
      });
      
      return {
        ...payment,
        proofPath: matchedFile ? `${folderPath}/${matchedFile}` : null,
        proofMatched: !!matchedFile
      };
    });
    
    return matchedPayments;
  } catch (error) {
    console.error('Failed to match proof files:', error);
    return payments;
  }
}

/**
 * Import parsed and validated payments into the database
 * @param {Array<Object>} payments - Validated payment records
 * @returns {Promise<Object>} Import results summary
 */
export async function importPayments(payments) {
  const results = {
    studentsCreated: 0,
    paymentsCreated: 0,
    errors: []
  };
  
  try {
    for (const payment of payments) {
      try {
        // Check if student exists, create if not
        let student = await db.getStudentByMatricNo(payment.studentId);
        
        if (!student && payment.studentName) {
          student = await db.addStudent({
            matricNo: payment.studentId || `TEMP-${Date.now()}`,
            name: payment.studentName,
            course: payment.course || 'N/A',
            semester: payment.semester || 'Semester 1',
            contactInfo: ''
          });
          results.studentsCreated++;
        }
        
        if (student) {
          // Create payment record
          await db.addPayment({
            studentId: student.id,
            amount: payment.amount,
            method: payment.method,
            date: payment.paymentDate,
            reference: payment.reference,
            proofPath: payment.proofPath || ''
          });
          results.paymentsCreated++;
        }
      } catch (error) {
        results.errors.push({
          row: payment.rowIndex,
          error: error.message,
          data: payment
        });
      }
    }
  } catch (error) {
    throw new Error(`Import failed: ${error.message}`);
  }
  
  return results;
}
