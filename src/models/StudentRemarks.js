/**
 * STUDENT REMARKS MODEL
 * Handles student-level remarks for spreadsheet view (non-financial notes)
 */

import { db, STORES } from '../db/database.js';

class StudentRemarksModel {
  /**
   * Create or update remarks for a student
   * @param {number} studentId - Student database ID
   * @param {string} remarks - Remarks text
   * @returns {Promise<number>} - Record ID
   */
  async setRemarks(studentId, remarks) {
    // Check if remarks already exist for this student
    const existing = await this.getByStudentId(studentId);
    
    if (existing) {
      // Update existing remarks
      const updated = {
        ...existing,
        remarks,
        updatedAt: new Date().toISOString()
      };
      return await db.update(STORES.STUDENT_REMARKS, updated);
    } else {
      // Create new remarks record
      const record = {
        studentId,
        remarks,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      return await db.add(STORES.STUDENT_REMARKS, record);
    }
  }

  /**
   * Get remarks by student ID
   * @param {number} studentId - Student database ID
   * @returns {Promise<object|null>} - Remarks record or null
   */
  async getByStudentId(studentId) {
    const records = await db.getByIndex(STORES.STUDENT_REMARKS, 'studentId', studentId);
    return records[0] || null;
  }

  /**
   * Get remarks text for a student
   * @param {number} studentId - Student database ID
   * @returns {Promise<string>} - Remarks text or empty string
   */
  async getRemarks(studentId) {
    const record = await this.getByStudentId(studentId);
    return record ? record.remarks : '';
  }

  /**
   * Delete remarks for a student
   * @param {number} studentId - Student database ID
   */
  async delete(studentId) {
    const record = await this.getByStudentId(studentId);
    if (record) {
      return await db.delete(STORES.STUDENT_REMARKS, record.id);
    }
  }

  /**
   * Get all remarks as a map (studentId -> remarks)
   * @returns {Promise<Map>} - Map of studentId to remarks
   */
  async getAllAsMap() {
    const records = await db.getAll(STORES.STUDENT_REMARKS);
    const map = new Map();
    records.forEach(r => map.set(r.studentId, r.remarks));
    return map;
  }
}

// Export singleton instance
export const StudentRemarks = new StudentRemarksModel();
