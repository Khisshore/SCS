/**
 * VALIDATION UTILITIES
 * Centralized validation logic for the application
 */

/**
 * Validate Student ID
 * Must be alphanumeric, not empty
 * @param {string} id - Student ID
 * @throws {Error} - If invalid
 */
export function validateStudentId(id) {
  if (!id || typeof id !== 'string' || id.trim() === '') {
    throw new Error('Student ID is required');
  }
  const regex = /^[a-zA-Z0-9]+$/;
  if (!regex.test(id.trim())) {
    throw new Error('Student ID must contain only alphanumeric characters');
  }
}

/**
 * Validate Email
 * @param {string} email - Email address
 * @throws {Error} - If invalid
 */
export function validateEmail(email) {
  if (!email || email.trim() === '') return; // Optional field

  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regex.test(email.trim())) {
    throw new Error('Invalid email format');
  }
}

/**
 * Validate Phone Number
 * Allowed characters: digits, spaces, +, -, (, )
 * @param {string} phone - Phone number
 * @throws {Error} - If invalid
 */
export function validatePhone(phone) {
  if (!phone || phone.trim() === '') return; // Optional field

  const regex = /^[\d\s+\-()]+$/;
  if (!regex.test(phone.trim())) {
    throw new Error('Phone number contains invalid characters');
  }
}

/**
 * Validate Monetary Amount
 * @param {number|string} amount - Amount
 * @param {boolean} allowZero - Whether 0 is allowed (default false)
 * @throws {Error} - If invalid
 */
export function validateAmount(amount, allowZero = false) {
  if (amount === null || amount === undefined || amount === '') {
    // If it's a required field, the caller should handle existence check.
    // But here we validate the value if present.
    // If it's required and missing, typically we throw.
    // Let's assume this validates a value that is expected to be a number.
    throw new Error('Amount is required');
  }

  const num = parseFloat(amount);

  if (isNaN(num)) {
    throw new Error('Amount must be a valid number');
  }

  if (!allowZero && num <= 0) {
    throw new Error('Amount must be greater than zero');
  }

  if (allowZero && num < 0) {
    throw new Error('Amount cannot be negative');
  }
}

/**
 * Validate Date
 * @param {string|Date} date - Date string or object
 * @throws {Error} - If invalid
 */
export function validateDate(date) {
  if (!date) {
    throw new Error('Date is required');
  }

  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date format');
  }
}

/**
 * Validate Payment Method
 * @param {string} method - Payment method
 * @throws {Error} - If invalid
 */
export function validatePaymentMethod(method) {
  const validMethods = ['cash', 'card', 'bank_transfer', 'online', 'other'];
  if (!method || !validMethods.includes(method)) {
    throw new Error('Invalid payment method');
  }
}
