/**
 * FORMATTING UTILITIES
 * Helper functions for consistent data display
 */

/**
 * Format number as currency
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: RM)
 * @returns {string} - Formatted currency string
 */
export function formatCurrency(amount, currency = 'RM') {
  const num = parseFloat(amount) || 0;
  
  const formatted = num.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  return `${currency} ${formatted}`;
}

/**
 * Format date for display
 * @param {string|Date} date - Date to format
 * @param {string} format - Format type (default: 'long')
 * @returns {string} - Formatted date string
 */
export function formatDate(date, format = 'long') {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (!(d instanceof Date) || isNaN(d)) {
    return 'Invalid Date';
  }
  
  switch (format) {
    case 'short':
      // DD/MM/YYYY
      return d.toLocaleDateString('en-GB');
      
    case 'malaysian':
      // DD-MM-YYYY (Malaysian standard for transactional dates)
      return formatDateMalaysian(d);
      
    case 'month-year':
      // Oct 2024 (for intake/completion fields)
      return formatMonthYear(d);
      
    case 'long':
      // 24 January 2026
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      
    case 'time':
      // 24/01/2026 11:30 PM
      return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      
    case 'iso':
      // 2026-01-24
      return d.toISOString().split('T')[0];
      
    default:
      return d.toLocaleDateString('en-GB');
  }
}

/**
 * Format date in Malaysian standard (DD-MM-YYYY)
 * Used for transactional dates like payment dates
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date string (DD-MM-YYYY)
 */
export function formatDateMalaysian(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (!(d instanceof Date) || isNaN(d)) {
    return 'Invalid Date';
  }
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}-${month}-${year}`;
}

/**
 * Format date as Month-Year (e.g., "Oct 2024")
 * Used for intake and completion fields
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date string (MMM YYYY)
 */
export function formatMonthYear(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (!(d instanceof Date) || isNaN(d)) {
    return 'Invalid Date';
  }
  
  return d.toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Format payment method for display
 * @param {string} method - Payment method code
 * @returns {string} - Display-friendly method name
 */
export function formatPaymentMethod(method) {
  const methods = {
    cash: 'Cash',
    card: 'Credit/Debit Card',
    bank_transfer: 'Bank Transfer',
    online: 'Online Payment',
    other: 'Other'
  };
  
  return methods[method] || method;
}

/**
 * Format receipt number for display
 * @param {number} number - Receipt number
 * @returns {string} - Zero-padded receipt number
 */
export function formatReceiptNumber(number) {
  const year = new Date().getFullYear();
  const paddedNumber = String(number).padStart(5, '0');
  return `RCP-${year}-${paddedNumber}`;
}

/**
 * Parse currency string to number
 * @param {string} currencyString - Currency string to parse
 * @returns {number} - Parsed number
 */
export function parseCurrency(currencyString) {
  const cleaned = currencyString.replace(/[^0-9.-]+/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Get month name
 * @param {number} month - Month number (1-12)
 * @returns {string} - Month name
 */
export function getMonthName(month) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1] || '';
}

/**
 * Get relative time (e.g., "2 hours ago")
 * @param {string|Date} date - Date to compare
 * @returns {string} - Relative time string
 */
export function getRelativeTime(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return formatDate(d, 'short');
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
export function truncateText(text, maxLength = 50) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} - Escaped HTML
 */
export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}
