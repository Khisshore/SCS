/**
 * IMPORT SERVICE
 * Intelligent data import with spreadsheet parsing and proof matching
 */

import * as XLSX from 'xlsx';
import { db } from '../db/database.js';
import { fileSystem } from './fileSystem.js';
import { Student } from '../models/Student.js';
import { Payment } from '../models/Payment.js';
import { Programme } from '../models/Programme.js';

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
 * Intelligently map spreadsheet columns to SCS fields
 * Uses fuzzy matching to detect common column names
 * @param {Array<string>} headers - Column headers from spreadsheet
 * @returns {Object} Suggested mapping object
 */
export function suggestColumnMapping(headers) {
  const mapping = {
    // Student fields
    studentName: null,
    studentId: null,
    email: null,
    phone: null,
    course: null,
    intake: null,
    completionDate: null,
    completionStatus: null,
    totalFees: null,
    institutionalCost: null,
    registrationFee: null,
    commission: null,
    // Payment fields
    semester: null,
    amount: null,
    paymentDate: null,
    method: null,
    reference: null,
    description: null
  };
  
  const patterns = {
    // Student field patterns
    studentName: /^(student[\s_-]?name|name|full[\s_-]?name|nama|student)$/i,
    studentId: /^(student[\s_-]?id|matric|matric[\s_-]?no|id[\s_-]?no|no\.?|number|ic)$/i,
    email: /^(email|e-mail|emel|mail)$/i,
    phone: /^(phone|contact|hp|telefon|tel|mobile|handphone)$/i,
    course: /^(course|program|programme|major|kursus|pengajian)$/i,
    intake: /^(intake|batch|session|sesi|kemasukan)$/i,
    completionDate: /^(completion[\s_-]?date|end[\s_-]?date|graduate[\s_-]?date|tarikh[\s_-]?tamat)$/i,
    completionStatus: /^(completion[\s_-]?status|status|progress|kemajuan)$/i,
    totalFees: /^(total[\s_-]?fees?|total|fees?|jumlah[\s_-]?yuran|yuran)$/i,
    institutionalCost: /^(institutional[\s_-]?cost|institution[\s_-]?cost|kos[\s_-]?institusi|institutional)$/i,
    registrationFee: /^(registration[\s_-]?fee|reg[\s_-]?fee|yuran[\s_-]?pendaftaran|registration)$/i,
    commission: /^(commission|komisen|comm)$/i,
    // Payment field patterns
    semester: /^(semester|sem|year|tahun)$/i,
    amount: /^(amount|payment[\s_-]?amount|paid|bayaran|rm|ringgit)$/i,
    paymentDate: /^(date|payment[\s_-]?date|tarikh|when|tarikh[\s_-]?bayaran)$/i,
    method: /^(method|payment[\s_-]?method|type|cara|jenis)$/i,
    reference: /^(ref|reference|receipt[\s_-]?no|transaction|resit)$/i,
    description: /^(description|notes?|remark|catatan|keterangan)$/i
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
 * @returns {Array<Object>} Transformed payment records with student data
 */
export function transformToPayments(rows, mapping, headers) {
  const payments = [];
  
  rows.forEach((row, rowIndex) => {
    try {
      const record = {
        // Student fields
        studentName: mapping.studentName !== null ? String(row[mapping.studentName] || '').trim() : '',
        studentId: mapping.studentId !== null ? String(row[mapping.studentId] || '').trim() : '',
        email: mapping.email !== null ? String(row[mapping.email] || '').trim() : '',
        phone: mapping.phone !== null ? String(row[mapping.phone] || '').trim() : '',
        course: mapping.course !== null ? String(row[mapping.course] || '').trim() : '',
        intake: mapping.intake !== null ? String(row[mapping.intake] || '').trim() : '',
        completionDate: mapping.completionDate !== null ? String(row[mapping.completionDate] || '').trim() : '',
        completionStatus: mapping.completionStatus !== null ? String(row[mapping.completionStatus] || 'In Progress').trim() : 'In Progress',
        totalFees: mapping.totalFees !== null ? parseFloat(row[mapping.totalFees]) || 0 : 0,
        institutionalCost: mapping.institutionalCost !== null ? parseFloat(row[mapping.institutionalCost]) || 0 : 0,
        registrationFee: mapping.registrationFee !== null ? parseFloat(row[mapping.registrationFee]) || 0 : 0,
        commission: mapping.commission !== null ? parseFloat(row[mapping.commission]) || 0 : 0,
        // Payment fields
        semester: mapping.semester !== null ? parseSemester(row[mapping.semester]) : null,
        amount: mapping.amount !== null ? parseFloat(row[mapping.amount]) || 0 : 0,
        paymentDate: mapping.paymentDate !== null ? parseDate(row[mapping.paymentDate]) : new Date(),
        method: mapping.method !== null ? parsePaymentMethod(String(row[mapping.method] || '').trim()) : 'cash',
        reference: mapping.reference !== null ? String(row[mapping.reference] || '').trim() : '',
        description: mapping.description !== null ? String(row[mapping.description] || '').trim() : '',
        rowIndex: rowIndex + 2, // +2 because of header row and 0-indexing
        proofPath: null // Will be populated by proof matching
      };
      
      // Only add if we have at least a name or ID
      if (record.studentName || record.studentId) {
        payments.push(record);
      }
    } catch (error) {
      console.warn(`Failed to parse row ${rowIndex + 2}:`, error);
    }
  });
  
  return payments;
}

/**
 * Parse semester value from spreadsheet - extracts number from various formats
 * @param {*} value - Cell value
 * @returns {number|null} Semester number or null
 */
function parseSemester(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Math.floor(value);
  const str = String(value);
  const match = str.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Parse payment method - normalize to valid method values
 * @param {string} value - Raw method value
 * @returns {string} Normalized payment method
 */
function parsePaymentMethod(value) {
  const lower = value.toLowerCase();
  if (lower.includes('cash') || lower.includes('tunai')) return 'cash';
  if (lower.includes('card') || lower.includes('kad')) return 'card';
  if (lower.includes('bank') || lower.includes('transfer')) return 'bank_transfer';
  if (lower.includes('online') || lower.includes('fpx')) return 'online';
  return 'other';
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
 * @param {Array<Object>} records - Validated payment records with student data
 * @param {Object} options - Import options (defaultCourse, defaultProgram)
 * @returns {Promise<Object>} Import results summary
 */
export async function importPayments(records, options = {}) {
  const results = {
    studentsCreated: 0,
    studentsUpdated: 0,
    paymentsCreated: 0,
    errors: []
  };
  
  try {
    // Ensure default programme exists if provided
    if (options.defaultProgram && options.defaultCourse) {
      await Programme.getOrCreate(options.defaultProgram, options.defaultCourse);
    }

    for (const record of records) {
      try {
        // Check if student exists by student ID
        let student = null;
        if (record.studentId) {
          student = await Student.findByStudentId(record.studentId);
        }
        
        if (!student && record.studentName) {
          // Determine program and course
          // Priority: Global Option -> Mapped Value -> Default
          let courseIdx = options.defaultCourse || (record.course ? inferCourse(record.course) : 'Other');
          let programIdx = options.defaultProgram || record.course || 'N/A';

          // Create new student with all available fields
          const studentData = {
            studentId: record.studentId || `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: record.studentName,
            email: record.email || '',
            phone: record.phone || '',
            program: programIdx,
            course: courseIdx,
            intake: record.intake || '',
            completionDate: record.completionDate || '',
            completionStatus: record.completionStatus || 'In Progress',
            totalFees: record.totalFees || 0,
            institutionalCost: record.institutionalCost || 0,
            registrationFee: record.registrationFee || 0,
            commission: record.commission || 0,
            status: 'active'
          };
          
          const studentId = await Student.create(studentData);
          student = await Student.findById(studentId);
          results.studentsCreated++;
        } else if (student) {
            // Update existing logic ...
            // If we want to enforce the global course/program on existing students, we could do it here. 
            // But usually checking matches is safer. For now let's just update financial info.
            
          // Optionally update existing student with new financial data if provided
          const updates = {};
          
          // ... existing update logic ...
          if (record.totalFees && record.totalFees > 0 && (!student.totalFees || student.totalFees === 0)) {
            updates.totalFees = record.totalFees;
          }
          if (record.institutionalCost && record.institutionalCost > 0 && (!student.institutionalCost || student.institutionalCost === 0)) {
            updates.institutionalCost = record.institutionalCost;
          }
          if (record.registrationFee && record.registrationFee > 0 && (!student.registrationFee || student.registrationFee === 0)) {
            updates.registrationFee = record.registrationFee;
          }
          if (record.commission && record.commission > 0 && (!student.commission || student.commission === 0)) {
            updates.commission = record.commission;
          }
          if (record.intake && !student.intake) {
            updates.intake = record.intake;
          }
          if (record.completionDate && !student.completionDate) {
            updates.completionDate = record.completionDate;
          }
          
          // Also update program/course if missing and global options provided
          if (options.defaultProgram && !student.program) {
             updates.program = options.defaultProgram;
          }
          if (options.defaultCourse && (!student.course || student.course === 'Other')) {
             updates.course = options.defaultCourse;
          }

          if (Object.keys(updates).length > 0) {
            await Student.update(student.id, updates);
            results.studentsUpdated++;
          }
        }
        
        // ... payment creation logic ...
        // Create payment record if amount is specified and student exists
        if (student && record.amount && record.amount > 0) {
          const paymentData = {
            studentId: student.studentId,
            amount: record.amount,
            date: record.paymentDate instanceof Date ? record.paymentDate.toISOString() : record.paymentDate,
            method: record.method || 'cash',
            reference: record.reference || '',
            description: record.description || '',
            semester: record.semester || null
          };
          
          await Payment.create(paymentData);
          results.paymentsCreated++;
        }
      } catch (error) {
         // ... existing error handler ...
        results.errors.push({
          row: record.rowIndex,
          error: error.message,
          data: record
        });
      }
    }
  } catch (error) {
    throw new Error(`Import failed: ${error.message}`);
  }
  
  return results;
}

/**
 * Infer course type from program name (helper for import)
 * @param {string} program - Program name
 * @returns {string} Course type
 */
function inferCourse(program) {
  const programLower = program.toLowerCase();
  if (programLower.includes('diploma')) return 'Diploma';
  if (programLower.includes('dba') || programLower.includes('doctor')) return 'DBA';
  if (programLower.includes('mba') || programLower.includes('master')) return 'MBA';
  if (programLower.includes('bba') || programLower.includes('bachelor') || programLower.includes('degree')) return 'BBA';
  return 'Other';
}
