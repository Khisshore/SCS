/**
 * RECEIPT MODEL
 * Handles receipt generation and management
 */

import { db, STORES } from '../db/database.js';

class ReceiptModel {
  /**
   * Generate a new receipt for a payment
   * @param {number} paymentId - Payment database ID
   * @param {object} paymentData - Payment information
   * @returns {Promise<object>} - Created receipt
   */
  async generate(paymentId, paymentData) {
    // Get next receipt number
    const receiptNumber = await this.getNextReceiptNumber();

    const receipt = {
      paymentId,
      receiptNumber,
      generatedAt: new Date().toISOString(),
      data: paymentData // Store complete payment info for receipt
    };

    const id = await db.add(STORES.RECEIPTS, receipt);
    return await db.get(STORES.RECEIPTS, id);
  }

  /**
   * Get receipt by payment ID
   * @param {number} paymentId - Payment database ID
   * @returns {Promise<object>} - Receipt record
   */
  async getByPaymentId(paymentId) {
    const receipts = await db.getByIndex(STORES.RECEIPTS, 'paymentId', paymentId);
    return receipts[0] || null;
  }

  /**
   * Get receipt by receipt number
   * @param {string} receiptNumber - Receipt number
   * @returns {Promise<object>} - Receipt record
   */
  async getByReceiptNumber(receiptNumber) {
    const receipts = await db.getByIndex(STORES.RECEIPTS, 'receiptNumber', receiptNumber);
    return receipts[0] || null;
  }

  /**
   * Get next receipt number (sequential)
   * @returns {Promise<string>} - Next receipt number
   */
  async getNextReceiptNumber() {
    const lastNumber = await db.getSetting('lastReceiptNumber') || 0;
    const nextNumber = lastNumber + 1;
    
    // Update the setting
    await db.setSetting('lastReceiptNumber', nextNumber);
    
    // Format: RCP-2026-00001
    const year = new Date().getFullYear();
    const paddedNumber = String(nextNumber).padStart(5, '0');
    return `RCP-${year}-${paddedNumber}`;
  }

  /**
   * Regenerate a receipt (if needed)
   * @param {number} paymentId - Payment database ID
   * @param {object} paymentData - Updated payment data
   * @returns {Promise<object>} - Updated receipt
   */
  async regenerate(paymentId, paymentData) {
    const existing = await this.getByPaymentId(paymentId);
    
    if (existing) {
      const updated = {
        ...existing,
        data: paymentData,
        generatedAt: new Date().toISOString()
      };
      await db.update(STORES.RECEIPTS, updated);
      return updated;
    } else {
      return await this.generate(paymentId, paymentData);
    }
  }
}

// Export singleton instance
export const Receipt = new ReceiptModel();
