// Canonical formatting functions used across all SCS components, PDF generators, and dashboards.
// Any new display formatting should be added here to maintain a single source of truth.

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
  if (!date) return '-';

  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (!(d instanceof Date) || isNaN(d)) {
    // If the date is invalid, gracefully fail by returning the original string or a fallback
    return typeof date === 'string' ? date : '-';
  }
  
  switch (format) {
    case 'short':
      // DD/MM/YYYY (Malaysian standard)
      return d.toLocaleDateString('en-GB'); 
      
    case 'malaysian':
      // DD-MM-YYYY (Transactional standard)
      return formatDateMalaysian(d);
      
    case 'month-year':
      // Oct 2024
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
      return d.toISOString().split('T')[0];
      
    default:
      return d.toLocaleDateString('en-GB');
  }
}

// DD-MM-YYYY — Malaysian transactional standard, used internally by formatDate('malaysian')
function formatDateMalaysian(date) {
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

// Single source of truth for payment method display labels.
// defaultValue param lets PDF receipts default to 'Online Payment' for branding while UI falls back to the raw method string.
export function formatPaymentMethod(method, defaultValue) {
  const methods = {
    cash: 'Cash',
    card: 'Credit Card',
    bank_transfer: 'Bank Transfer',
    online: 'Online Payment',
    online_payment: 'Online Payment',
    online_banking: 'Online Banking',
    bank_in: 'Bank-In',
    registration_fee: 'Registration Fee',
    commission: 'Commission',
    other: 'Other'
  };
  
  return methods[method] || (defaultValue !== undefined ? defaultValue : method);
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
