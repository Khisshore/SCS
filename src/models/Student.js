/**
 * STUDENT MODEL
 * Handles all student-related database operations with validation
 */

import { db, STORES } from '../db/database.js';
import { validateStudentId, validateEmail, validatePhone, validateAmount } from '../utils/validators.js';

class StudentModel {
  /**
   * Create a new student
   * @param {object} studentData - Student information
   * @returns {Promise<number>} - Created student ID
   */
  async create(studentData) {
    // Validate required fields
    this.validate(studentData);

    // Check if student ID is unique
    const existing = await this.findByStudentId(studentData.studentId);
    if (existing) {
      throw new Error('Student ID already exists');
    }

    const student = {
      studentId: studentData.studentId,
      name: studentData.name,
      email: studentData.email || '',
      phone: studentData.phone || '',
      program: studentData.program,
      institution: studentData.institution || '',
      course: studentData.course || this.inferCourse(studentData.program),
      intake: studentData.intake || '',
      completionDate: studentData.completionDate || '',
      completionStatus: studentData.completionStatus || 'In Progress',
      totalFees: parseFloat(studentData.totalFees) || 0,
      institutionalCost: parseFloat(studentData.institutionalCost) || 0,
      registrationFee: parseFloat(studentData.registrationFee) || 0,
      registrationFeeReceipt: studentData.registrationFeeReceipt || '',
      commission: parseFloat(studentData.commission) || 0,
      commissionReceipt: studentData.commissionReceipt || '',
      commissionPaidTo: studentData.commissionPaidTo || '',
      totalSemesters: parseInt(studentData.totalSemesters) || 1,
      status: studentData.status || 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return await db.add(STORES.STUDENTS, student);
  }

  /**
   * Update an existing student
   * @param {number} id - Student database ID
   * @param {object} updates - Fields to update
   * @returns {Promise<number>} - Updated student ID
   */
  async update(id, updates) {
    const student = await db.get(STORES.STUDENTS, id);
    if (!student) {
      throw new Error('Student not found');
    }

    // If studentId is being changed, check uniqueness
    if (updates.studentId && updates.studentId !== student.studentId) {
      const existing = await this.findByStudentId(updates.studentId);
      if (existing && existing.id !== id) {
        throw new Error('Student ID already exists');
      }
    }

    const updatedStudent = {
      ...student,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    return await db.update(STORES.STUDENTS, updatedStudent);
  }

  /**
   * Find student by database ID
   * @param {number} id - Database ID
   * @returns {Promise<object>} - Student record
   */
  async findById(id) {
    return await db.get(STORES.STUDENTS, id);
  }

  /**
   * Find student by student ID
   * @param {string} studentId - Student ID number
   * @returns {Promise<object>} - Student record
   */
  async findByStudentId(studentId) {
    const students = await db.getByIndex(STORES.STUDENTS, 'studentId', studentId);
    return students[0] || null;
  }

  /**
   * Get all students with optional filtering
   * @param {object} filters - Filter criteria
   * @returns {Promise<Array>} - Array of students
   */
  async findAll(filters = {}) {
    let students = await db.getAll(STORES.STUDENTS);

    // Apply filters
    if (filters.status) {
      students = students.filter(s => s.status === filters.status);
    }

    if (filters.course) {
      students = students.filter(s => s.course === filters.course);
    }

    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      students = students.filter(s =>
        s.name.toLowerCase().includes(searchTerm) ||
        s.studentId.toLowerCase().includes(searchTerm) ||
        (s.email && s.email.toLowerCase().includes(searchTerm)) ||
        s.program.toLowerCase().includes(searchTerm)
      );
    }

    // Sort by relevance (starts with > includes) then by name
    if (filters.search) {
      const lowerSearch = filters.search.toLowerCase();
      students.sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        
        const aStartsWith = nameA.startsWith(lowerSearch);
        const bStartsWith = nameB.startsWith(lowerSearch);
        
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        
        return nameA.localeCompare(nameB);
      });
    } else {
      students.sort((a, b) => a.name.localeCompare(b.name));
    }

    return students;
  }

  /**
   * Find students by course
   * @param {string} course - Course type (Diploma, BBA, MBA, DBA)
   * @returns {Promise<Array>} - Array of students
   */
  async findByCourse(course) {
    return this.findAll({ course, status: 'active' });
  }

  /**
   * Get unique programs for a given course
   * @param {string} course - Course type
   * @returns {Promise<Array>} - Array of unique program names
   */
  async getProgramsByCourse(course) {
    const students = await this.findByCourse(course);
    const programs = [...new Set(students.map(s => s.program))];
    return programs.sort();
  }

  /**
   * Infer course type from program name
   * @param {string} program - Program name
   * @returns {string} - Course type (Diploma, BBA, MBA, DBA, or Other)
   */
  inferCourse(program) {
    const programLower = program.toLowerCase();
    if (programLower.includes('diploma')) return 'Diploma';
    if (programLower.includes('dba') || programLower.includes('doctor')) return 'DBA';
    if (programLower.includes('mba') || programLower.includes('master')) return 'MBA';
    if (programLower.includes('bba') || programLower.includes('bachelor') || programLower.includes('degree')) return 'BBA';
    return 'Other';
  }

  /**
   * Delete a student (soft delete - mark as inactive)
   * @param {number} id - Student database ID
   */
  async delete(id) {
    return await this.update(id, { status: 'inactive' });
  }

  /**
   * Permanently delete a student
   * @param {number} id - Student database ID
   */
  async permanentDelete(id) {
    return await db.delete(STORES.STUDENTS, id);
  }

  /**
   * Validate student data
   * @param {object} data - Student data to validate
   */
  validate(data) {
    // Basic fields
    validateStudentId(data.studentId);

    if (!data.name || data.name.trim() === '') {
      throw new Error('Student name is required');
    }

    if (!data.program || data.program.trim() === '') {
      throw new Error('Program/Course is required');
    }

    // Contact info
    validateEmail(data.email);
    validatePhone(data.phone);

    // Financial fields (optional but must be valid if present)
    // We allow zero for fees/costs
    if (data.totalFees !== undefined && data.totalFees !== '') validateAmount(data.totalFees, true);
    if (data.institutionalCost !== undefined && data.institutionalCost !== '') validateAmount(data.institutionalCost, true);
    if (data.registrationFee !== undefined && data.registrationFee !== '') validateAmount(data.registrationFee, true);
    if (data.commission !== undefined && data.commission !== '') validateAmount(data.commission, true);
  }

  /**
   * Get student count statistics
   * @returns {Promise<object>} - Statistics object
   */
  async getStatistics() {
    const students = await db.getAll(STORES.STUDENTS);
    
    return {
      total: students.length,
      active: students.filter(s => s.status === 'active').length,
      inactive: students.filter(s => s.status === 'inactive').length
    };
  }
}

// Export singleton instance
export const Student = new StudentModel();
