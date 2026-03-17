/**
 * PAYMENT MODEL
 * Handles all payment-related database operations
 */

import { db, STORES } from '../db/database.js';

class PaymentModel {
  /**
   * Create a new payment record
   * @param {object} paymentData - Payment information
   * @returns {Promise<number>} - Created payment ID
   */
  async create(paymentData) {
    // Validate payment data
    this.validate(paymentData);

    const payment = {
      studentId: String(paymentData.studentId),
      amount: paymentData.amount === 'NIL' || paymentData.amount === 'NULL' || !paymentData.amount ? null : parseFloat(paymentData.amount),
      date: paymentData.date || new Date().toISOString(),
      method: paymentData.method,
      reference: paymentData.reference || '',
      description: paymentData.description || '',
      semester: paymentData.semester || null,
      transactionType: paymentData.transactionType || paymentData.type || 'OTHER',
      category: paymentData.category || (paymentData.transactionType === 'COMMISSION_PAYOUT' || paymentData.type === 'COMMISSION_PAYOUT' ? 'EXPENSE' : 'REVENUE'),
      recipient: paymentData.recipient || '',
      status: 'completed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return await db.add(STORES.PAYMENTS, payment);
  }

  /**
   * Update an existing payment
   * @param {number|string} id - Payment database ID
   * @param {object} updates - Fields to update
   * @returns {Promise<number|string>} - Updated payment ID
   */
  async update(id, updates) {
    const payment = await db.get(STORES.PAYMENTS, id);
    if (!payment) {
      throw new Error('Payment not found');
    }

    const updatedPayment = {
      ...payment,
      ...updates,
      amount: updates.amount !== undefined 
        ? (updates.amount === 'NIL' || updates.amount === 'NULL' || !updates.amount ? null : parseFloat(updates.amount))
        : payment.amount,
      updatedAt: new Date().toISOString()
    };

    return await db.update(STORES.PAYMENTS, updatedPayment);
  }

  /**
   * Find payment by ID
   * @param {number|string} id - Payment database ID
   * @returns {Promise<object>} - Payment record
   */
  async findById(id) {
    return await db.get(STORES.PAYMENTS, id);
  }

  /**
   * Get all payments for a specific student
   * @param {string} studentId - Student ID
   * @returns {Promise<Array>} - Array of payments
   */
  async findByStudent(studentId) {
    const student = await db.get(STORES.STUDENTS, String(studentId));
    if (student && student.status === 'deleted') return [];
    
    const sid = String(studentId);
    const payments = await db.getByIndex(STORES.PAYMENTS, 'studentId', sid);
    
    // Sort by date (newest first)
    payments.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return payments;
  }

  /**
   * Get all payments with optional filtering
   * @param {object} filters - Filter criteria
   * @returns {Promise<Array>} - Array of payments
   */
  async findAll(filters = {}) {
    let payments = await db.getAll(STORES.PAYMENTS);
    const students = await db.getAll(STORES.STUDENTS);
    const deletedStudentIds = new Set(
      students.filter(s => s.status === 'deleted').map(s => String(s.id))
    );

    // Cleanup: Physically delete payments belonging to students already marked as 'deleted'
    const orphans = payments.filter(p => deletedStudentIds.has(String(p.studentId)));
    if (orphans.length > 0) {
      console.log(`🧹 Cleaning up ${orphans.length} orphaned payments in findAll...`);
      for (const p of orphans) {
        await db.delete(STORES.PAYMENTS, p.id);
      }
      // Re-fetch after cleanup
      payments = await db.getAll(STORES.PAYMENTS);
    }

    // Filter out payments belonging to deleted students (redundant but safe)
    payments = payments.filter(p => !deletedStudentIds.has(String(p.studentId)));

    // Filter by date range
    if (filters.startDate) {
      // Handle both ISO strings and YYYY-MM-DD
      const dateStr = filters.startDate.includes('T') ? filters.startDate : filters.startDate + 'T00:00:00';
      const start = new Date(dateStr);
      payments = payments.filter(p => new Date(p.date) >= start);
    }

    if (filters.endDate) {
      const dateStr = filters.endDate.includes('T') ? filters.endDate : filters.endDate + 'T23:59:59';
      const end = new Date(dateStr);
      payments = payments.filter(p => new Date(p.date) <= end);
    }

    // Filter by payment method
    if (filters.method) {
      payments = payments.filter(p => p.method === filters.method);
    }

    // Filter by student
    if (filters.studentId) {
      const sid = String(filters.studentId);
      payments = payments.filter(p => String(p.studentId) === sid);
    }

    // Filter by semester
    if (filters.semester !== undefined) {
      payments = payments.filter(p => p.semester === filters.semester);
    }

    // Filter by Category (REVENUE/EXPENSE)
    if (filters.category) {
      payments = payments.filter(p => p.category === filters.category);
    }

    // Sort by date (newest first)
    payments.sort((a, b) => new Date(b.date) - new Date(a.date));

    return payments;
  }

  /**
   * Get payments for a student grouped by semester
   * @param {number|string} studentId - Student database ID
   * @returns {Promise<object>} - Payments grouped by semester
   */
  async getStudentPaymentsBySemester(studentId) {
    const student = await db.get(STORES.STUDENTS, String(studentId));
    if (student && student.status === 'deleted') return { grouped: {}, maxSemester: 0 };
    
    const sid = String(studentId);
    const payments = await db.getByIndex(STORES.PAYMENTS, 'studentId', sid);
    
    const grouped = {};
    let maxSemester = 0;
    
    payments.forEach(payment => {
      // Exclude expenses from payment breakdown if needed, or group separately
      // For now, keep them but label them
      const sem = payment.semester || 'unassigned';
      if (!grouped[sem]) {
        grouped[sem] = {
          payments: [],
          totalAmount: 0,
          receipts: []
        };
      }
      grouped[sem].payments.push(payment);
      
      // Only add to total if it's REVENUE
      if (payment.category !== 'EXPENSE') {
        grouped[sem].totalAmount += (payment.amount || 0);
      }
      
      if (payment.reference) {
        grouped[sem].receipts.push(payment.reference);
      }
      
      const semNum = parseInt(sem);
      if (!isNaN(semNum) && semNum > maxSemester) {
        maxSemester = semNum;
      }
    });
    
    return { grouped, maxSemester };
  }

  /**
   * Get payments by date range
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Promise<Array>} - Payments in the range
   */
  async findByDateRange(startDate, endDate) {
    return this.findAll({ startDate, endDate });
  }

  /**
   * Find a payment by its reference (receipt number)
   * @param {string} reference - Receipt/reference number
   * @returns {Promise<object|null>} - Payment record or null
   */
  async findByReference(reference) {
    if (!reference) return null;
    const allPayments = await db.getAll(STORES.PAYMENTS);
    return allPayments.find(p => p.reference === reference) || null;
  }

  /**
   * Delete a payment
   * @param {number|string} id - Payment database ID
   */
  async delete(id) {
    return await db.delete(STORES.PAYMENTS, id);
  }

  /**
   * Validate payment data
   * @param {object} data - Payment data to validate
   */
  validate(data) {
    if (!data.studentId) {
      throw new Error('Student ID is required');
    }

    // Handle NIL/Empty
    const amtStr = String(data.amount).trim().toUpperCase();
    if (amtStr === 'NIL' || amtStr === 'NULL' || amtStr === '') {
      return; // Valid null amount
    }

    if (!data.amount || isNaN(parseFloat(data.amount)) || parseFloat(data.amount) < 0) {
      throw new Error('Valid payment amount is required');
    }

    if (!data.method) {
      throw new Error('Payment method is required');
    }

    const validMethods = ['cash', 'card', 'bank_transfer', 'online', 'online_banking', 'bank_in', 'other', 'registration_fee', 'commission'];
    if (!validMethods.includes(data.method)) {
      throw new Error('Invalid payment method');
    }
  }

  /**
   * Get payment statistics
   * @param {object} filters - Optional filters (date range, etc.)
   * @returns {Promise<object>} - Statistics object
   */
  async getStatistics(filters = {}) {
    const payments = await this.findAll(filters);
    
    const stats = {
      totalPayments: payments.length,
      totalAmount: 0,
      byMethod: {
        cash: { count: 0, amount: 0 },
        card: { count: 0, amount: 0 },
        bank_transfer: { count: 0, amount: 0 },
        online: { count: 0, amount: 0 },
        other: { count: 0, amount: 0 }
      }
    };

    payments.forEach(payment => {
      stats.totalAmount += payment.amount;
      
      if (stats.byMethod[payment.method]) {
        stats.byMethod[payment.method].count++;
        stats.byMethod[payment.method].amount += payment.amount;
      }
    });

    return stats;
  }

  /**
   * Get monthly payment summary
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<object>} - Monthly summary
   */
  async getMonthlySummary(year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const payments = await this.findByDateRange(
      startDate.toISOString(),
      endDate.toISOString()
    );

    return {
      year,
      month,
      payments,
      statistics: await this.getStatistics({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      })
    };
  }

  /**
   * Get recent payments
   * @param {number} limit - Number of payments to retrieve
   * @returns {Promise<Array>} - Recent payments
   */
  async getRecent(limit = 10) {
    let payments = await db.getAll(STORES.PAYMENTS);
    const students = await db.getAll(STORES.STUDENTS);
    const deletedStudentIds = new Set(
      students.filter(s => s.status === 'deleted').map(s => String(s.id))
    );
    
    // Cleanup: Physically delete payments belonging to students already marked as 'deleted'
    // This handles orphaned data from before the cascaded deletion fix
    const orphans = payments.filter(p => deletedStudentIds.has(String(p.studentId)));
    if (orphans.length > 0) {
      console.log(`🧹 Cleaning up ${orphans.length} orphaned payments...`);
      for (const p of orphans) {
        await db.delete(STORES.PAYMENTS, p.id);
      }
      // Re-fetch after cleanup
      payments = await db.getAll(STORES.PAYMENTS);
    }
    
    // Ensure we only return payments for students that still exist and are NOT deleted
    const activeStudentIds = new Set(
      students.filter(s => s.status !== 'deleted').map(s => String(s.id))
    );
    payments = payments.filter(p => activeStudentIds.has(String(p.studentId)));
    
    // Sort by date (newest first) and limit
    return payments
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
  }
}

// Export singleton instance
export const Payment = new PaymentModel();
