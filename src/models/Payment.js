/**
 * PAYMENT MODEL
 * Handles all payment-related database operations
 */

import { db, STORES } from '../db/database.js';
import { validateAmount, validatePaymentMethod, validateDate } from '../utils/validators.js';

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
      studentId: paymentData.studentId,
      amount: parseFloat(paymentData.amount),
      date: paymentData.date || new Date().toISOString(),
      method: paymentData.method,
      reference: paymentData.reference || '',
      description: paymentData.description || '',
      semester: paymentData.semester || null, // Semester number for grouping
      status: 'completed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return await db.add(STORES.PAYMENTS, payment);
  }

  /**
   * Update an existing payment
   * @param {number} id - Payment database ID
   * @param {object} updates - Fields to update
   * @returns {Promise<number>} - Updated payment ID
   */
  async update(id, updates) {
    const payment = await db.get(STORES.PAYMENTS, id);
    if (!payment) {
      throw new Error('Payment not found');
    }

    const updatedPayment = {
      ...payment,
      ...updates,
      amount: updates.amount ? parseFloat(updates.amount) : payment.amount,
      updatedAt: new Date().toISOString()
    };

    return await db.update(STORES.PAYMENTS, updatedPayment);
  }

  /**
   * Find payment by ID
   * @param {number} id - Payment database ID
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
    const payments = await db.getByIndex(STORES.PAYMENTS, 'studentId', studentId);
    
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

    // Filter by date range
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      payments = payments.filter(p => new Date(p.date) >= start);
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999); // Include the entire end date
      payments = payments.filter(p => new Date(p.date) <= end);
    }

    // Filter by payment method
    if (filters.method) {
      payments = payments.filter(p => p.method === filters.method);
    }

    // Filter by student
    if (filters.studentId) {
      payments = payments.filter(p => p.studentId === filters.studentId);
    }

    // Filter by semester
    if (filters.semester !== undefined) {
      payments = payments.filter(p => p.semester === filters.semester);
    }

    // Sort by date (newest first)
    payments.sort((a, b) => new Date(b.date) - new Date(a.date));

    return payments;
  }

  /**
   * Get payments for a student grouped by semester
   * @param {number} studentId - Student database ID
   * @returns {Promise<object>} - Payments grouped by semester
   */
  async getStudentPaymentsBySemester(studentId) {
    const payments = await db.getByIndex(STORES.PAYMENTS, 'studentId', studentId);
    
    const grouped = {};
    let maxSemester = 0;
    
    payments.forEach(payment => {
      const sem = payment.semester || 'unassigned';
      if (!grouped[sem]) {
        grouped[sem] = {
          payments: [],
          totalAmount: 0,
          receipts: []
        };
      }
      grouped[sem].payments.push(payment);
      grouped[sem].totalAmount += payment.amount;
      if (payment.reference) {
        grouped[sem].receipts.push(payment.reference);
      }
      if (typeof sem === 'number' && sem > maxSemester) {
        maxSemester = sem;
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
   * Delete a payment
   * @param {number} id - Payment database ID
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

    validateAmount(data.amount); // checks > 0
    validatePaymentMethod(data.method);

    if (data.date) {
      validateDate(data.date);
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
    const payments = await db.getAll(STORES.PAYMENTS);
    
    // Sort by date (newest first) and limit
    return payments
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
  }
}

// Export singleton instance
export const Payment = new PaymentModel();
