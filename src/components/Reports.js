/**
 * REPORTS COMPONENT
 * Professional financial reporting with consistent export features
 */

import { Payment } from '../models/Payment.js';
import { Student } from '../models/Student.js';
import { formatCurrency, formatDate, formatPaymentMethod } from '../utils/formatting.js';
import { db } from '../db/database.js';
import { Icons } from '../utils/icons.js';
import { SpreadsheetExporter } from '../utils/spreadsheetExporter.js';
import { initPdfPreviewModal, openPdfPreviewModal } from './PdfPreviewModal.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Store report data for export
let reportData = [];

/**
 * Render quick skeleton layout for Reports
 */
export function renderReportsSkeleton() {
  const container = document.getElementById('app-content');
  if (!container) return;

  const tableRows = Array(6).fill('').map(() => `
    <div class="skeleton-table-row">
      <div class="skeleton skeleton-text" style="width:20%;height:0.875rem"></div>
      <div class="skeleton skeleton-text short" style="height:0.875rem"></div>
      <div class="skeleton skeleton-text" style="width:15%;height:0.875rem"></div>
      <div class="skeleton skeleton-text short" style="height:0.875rem"></div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="skeleton-page reports-page">
      <div class="flex justify-between items-center mb-2xl">
        <div>
          <div class="skeleton skeleton-heading" style="width:180px"></div>
          <div class="skeleton skeleton-text medium"></div>
        </div>
        <div class="flex gap-md">
          <div class="skeleton" style="width:160px;height:42px;border-radius:var(--radius-md)"></div>
        </div>
      </div>

      <div class="card mb-xl">
        <div style="padding:1.5rem 2rem; border-bottom:1px solid var(--skeleton-border)">
          <div class="skeleton skeleton-heading" style="width:140px; margin:0"></div>
        </div>
        <div style="padding:2rem;" class="grid grid-3 gap-md">
          <div class="skeleton" style="height:50px; border-radius:var(--radius-md)"></div>
          <div class="skeleton" style="height:50px; border-radius:var(--radius-md)"></div>
          <div class="skeleton" style="height:50px; border-radius:var(--radius-md)"></div>
        </div>
      </div>

      <!-- Report Summary Skeletons -->
      <div class="grid grid-3 gap-md mb-xl">
        <div class="skeleton-card" style="height:120px;display:flex;flex-direction:column;justify-content:center;">
          <div class="skeleton skeleton-text short" style="margin-bottom:1rem;"></div>
          <div class="skeleton skeleton-heading" style="width:60%;margin:0;"></div>
        </div>
        <div class="skeleton-card" style="height:120px;display:flex;flex-direction:column;justify-content:center;">
          <div class="skeleton skeleton-text short" style="margin-bottom:1rem;"></div>
          <div class="skeleton skeleton-heading" style="width:50%;margin:0;"></div>
        </div>
        <div class="skeleton-card" style="height:120px;display:flex;flex-direction:column;justify-content:center;">
          <div class="skeleton skeleton-text short" style="margin-bottom:1rem;"></div>
          <div class="skeleton skeleton-heading" style="width:40%;margin:0;"></div>
        </div>
      </div>

      <!-- Table Skeleton -->
      <div class="skeleton-card" style="height:400px; padding:0;">
        <div style="padding:1.5rem 2rem; border-bottom:1px solid var(--skeleton-border)">
          <div class="skeleton skeleton-heading" style="width:200px; margin:0"></div>
        </div>
        <div style="padding:1rem 2rem;">
          ${tableRows}
        </div>
      </div>
    </div>
  `;
}

export async function renderReports() {
  const container = document.getElementById('app-content');
  
  // Set default date range (last 3 months)
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth() - 3, 1).toISOString().split('T')[0];
  const lastDay = today.toISOString().split('T')[0];

  container.innerHTML = `
    <div class="reports-container" style="animation: fadeIn 0.5s ease-out;">
      <!-- Header -->
      <div class="flex justify-between items-center mb-2xl">
        <div>
          <h1 style="margin-bottom: 0.5rem;">Financial Reports</h1>
          <p style="margin: 0; color: var(--text-secondary);">Review and export your institution's financial records.</p>
        </div>
        <div class="header-actions" style="display: flex; gap: 0.75rem;">
          <div class="export-dropdown">
            <button class="btn btn-secondary" id="exportDropdownBtn">
              <span class="icon">${Icons.download}</span>
              Export
              <span class="icon icon-sm">▼</span>
            </button>
            <div class="export-menu" id="exportMenu">
              <a href="#" id="exportXlsxBtn">
                <span class="icon">${Icons.file}</span>
                Excel Spreadsheet
              </a>
              <a href="#" id="exportPdfBtn">
                <span class="icon">${Icons.file}</span>
                PDF Document
              </a>
            </div>
          </div>
          <button class="btn btn-primary" id="printBtn">
            <span class="icon">${Icons.printer}</span>
            Print
          </button>
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="card mb-xl">
        <div class="card-body">
          <div class="flex flex-wrap items-end gap-lg">
            <div class="form-group mb-0" style="flex: 1; min-width: 200px;">
              <label class="form-label">Start Date</label>
              <input type="date" id="reportStartDate" class="form-input" value="${firstDay}" />
            </div>
            <div class="form-group mb-0" style="flex: 1; min-width: 200px;">
              <label class="form-label">End Date</label>
              <input type="date" id="reportEndDate" class="form-input" value="${lastDay}" />
            </div>
          </div>
          
          <div class="flex gap-sm mt-lg">
            <span style="font-size: 0.8rem; color: var(--text-tertiary); font-weight: 600; align-self: center; margin-right: 0.5rem;">PRESETS:</span>
            <button class="badge badge-secondary cursor-pointer preset-btn" data-preset="month">THIS MONTH</button>
            <button class="badge badge-secondary cursor-pointer preset-btn active" data-preset="quarter">LAST 3 MONTHS</button>
            <button class="badge badge-secondary cursor-pointer preset-btn" data-preset="year">THIS YEAR</button>
          </div>
        </div>
      </div>

      <!-- Transaction List -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Transaction Details</h3>
          <span class="badge badge-primary" id="transactionCountBadge">0 records</span>
        </div>
        <div class="card-body">
          <div class="table-container" style="box-shadow: none; border-radius: 8px; overflow: hidden;">
            <table class="table" id="reportTable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Type</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th style="text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody id="reportTbody">
                <!-- Data injected here -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <style>
      .reports-container .stat-card {
        padding: 2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      .preset-btn {
        transition: all 0.2s;
        border: none;
        text-transform: uppercase;
      }
      .preset-btn:hover {
        background: var(--primary-100);
        color: var(--primary-600);
        transform: translateY(-1px);
      }
      /* Ensure table corners clip correctly */
      .table-container {
        border: 1px solid var(--border-color);
      }

      .preset-btn.active {
        background: var(--primary-600) !important;
        color: white !important;
        box-shadow: var(--shadow-md);
      }
      
      /* Table Typography consistency */
      #reportTable th {
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-tertiary);
        padding: 0.75rem 1rem;
        font-weight: 700;
      }
      #reportTable td {
        font-size: 0.9rem;
        padding: 0.75rem 1rem;
        vertical-align: middle;
        text-transform: uppercase;
        font-weight: 600;
      }
      #reportTable .badge {
        font-size: 0.85rem;
        padding: 0.35rem 0.65rem;
      }
      /* Export dropdown styles - consistent with Spreadsheet page */
      .export-dropdown {
        position: relative;
        display: inline-block;
      }
      
      .export-dropdown .btn {
        gap: 0.5rem;
      }

      .export-menu {
        position: absolute;
        right: 0;
        top: calc(100% + 0.5rem);
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-lg);
        min-width: 200px;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-10px);
        transition: all 0.2s ease;
        z-index: 100;
        overflow: hidden;
      }

      .export-dropdown:hover .export-menu,
      .export-dropdown.active .export-menu {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }

      .export-menu a {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        color: var(--text-secondary);
        text-decoration: none;
        font-size: 0.875rem;
        font-weight: 500;
        transition: all 0.15s;
      }

      .export-menu a:hover {
        background: var(--surface-hover);
        color: var(--text-primary);
      }

      .export-menu a:first-child {
        border-radius: var(--radius-xl) var(--radius-xl) 0 0;
      }

      .export-menu a:last-child {
        border-radius: 0 0 var(--radius-xl) var(--radius-xl);
      }

      /* Link style for references matching modern theme */
      .receipt-link {
        color: var(--primary-600);
        text-decoration: none;
        padding: 0.25rem 0.5rem;
        border-radius: var(--radius-md);
        background: transparent;
        transition: all 0.2s ease;
      }
      .receipt-link:hover {
        background: var(--primary-50);
        color: var(--primary-700);
      }
    </style>
  `;

  // Initialize shared modals
  initPdfPreviewModal();

  // Attach global functions to window for PDF preview from reports
  window.previewReceiptFromReport = previewReceiptFromReport;

  // Attach event listeners
  document.getElementById('reportStartDate').addEventListener('change', updateReport);
  document.getElementById('reportEndDate').addEventListener('change', updateReport);
  
  // Export dropdown toggle
  const exportDropdownBtn = document.getElementById('exportDropdownBtn');
  const exportDropdown = document.querySelector('.export-dropdown');
  if (exportDropdownBtn && exportDropdown) {
    exportDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportDropdown.classList.toggle('active');
    });

    document.addEventListener('click', () => {
      exportDropdown.classList.remove('active');
    });
  }
  
  // Export buttons
  document.getElementById('exportXlsxBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    await exportReportXLSX();
  });
  
  document.getElementById('exportPdfBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    await exportReportPDF();
  });
  
  document.getElementById('printBtn').addEventListener('click', async () => {
    await printReport();
  });
  
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const preset = btn.dataset.preset;
      setPresetDateRange(preset);
      updateReport();
    });
  });

  // Initial report load
  await updateReport();
}

/**
 * Set date inputs based on presets - uses 1st of month boundaries
 */
function setPresetDateRange(preset) {
  const startInput = document.getElementById('reportStartDate');
  const endInput = document.getElementById('reportEndDate');
  const today = new Date();
  let start, end;

  if (preset === 'month') {
    // This month: 1st of current month → today
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = today;
  } else if (preset === 'quarter') {
    // Last 3 months: 3 full previous months (e.g., if Feb 1, show Nov 1 to Jan 31)
    start = new Date(today.getFullYear(), today.getMonth() - 3, 1);
    end = new Date(today.getFullYear(), today.getMonth(), 0); // Last day of previous month
  } else if (preset === 'year') {
    // This year: Jan 1 → today
    start = new Date(today.getFullYear(), 0, 1);
    end = today;
  }

  const formatDateForInput = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  startInput.value = formatDateForInput(start);
  endInput.value = formatDateForInput(end);
}

/**
 * Update report data
 */
async function updateReport() {
  const startDate = document.getElementById('reportStartDate').value;
  const endDate = document.getElementById('reportEndDate').value;
  const currency = await db.getSetting('currency') || 'RM';

  if (!startDate || !endDate) {
    alert('Please select both start and end dates.');
    return;
  }

  // Get data
  const payments = await Payment.findAll({ startDate, endDate });
  
  // Store for export
  reportData = [];
  for (const payment of payments) {
    const student = await Student.findById(payment.studentId);
    
    // Explicitly filter out payments for deleted students
    if (student && student.status === 'deleted') {
      continue;
    }

    reportData.push({
      payment,
      student,
      currency
    });
  }
  
  document.getElementById('transactionCountBadge').textContent = `${reportData.length} record${reportData.length !== 1 ? 's' : ''}`;

  // Render Table
  const tbody = document.getElementById('reportTbody');
  if (reportData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-tertiary);">No transactions found for this period.</td></tr>`;
    return;
  }

  // Group payments by student+semester for "Payment N" labeling
  const semPaymentCounters = {};
  // Sort by date ascending first to number payments chronologically
  const sortedForLabeling = [...reportData].sort((a, b) => new Date(a.payment.date) - new Date(b.payment.date));
  sortedForLabeling.forEach(({ payment }) => {
    if (payment.semester) {
      const key = `${payment.studentId}_${payment.semester}`;
      if (!semPaymentCounters[key]) semPaymentCounters[key] = 0;
      semPaymentCounters[key]++;
      payment._paymentIndex = semPaymentCounters[key];
    }
  });

  // Helper to get raw type string for export or display badge
  const getPaymentTypeLabel = (payment) => {
    const tt = payment.transactionType || '';
    
    // We use theme-adaptive CSS classes instead of hardcoded colors
    let badgeClass = '';
    let label = '';
    
    if (tt === 'REGISTRATION_FEE') {
      badgeClass = 'badge badge-primary-subtle'; // primary color adapts to theme
      label = 'Registration Fee';
    } else if (tt === 'COMMISSION_PAYOUT') {
      badgeClass = 'badge badge-primary-subtle'; 
      label = 'Commission Payout';
    } else if (payment.semester) {
      badgeClass = 'badge badge-primary-subtle';
      label = `Sem ${payment.semester}: Payment ${payment._paymentIndex || ''}`;
    } else if (payment.description) {
      badgeClass = 'badge badge-secondary';
      label = payment.description;
    } else {
      badgeClass = 'badge badge-secondary';
      label = 'Other';
    }
    
    return `<span class="${badgeClass}" style="font-weight: 600;">${label}</span>`;
  };

  const rows = reportData.map(({ payment, student, currency }) => {
    // 1. Method format: only show real payment methods, not internal identifiers
    const internalMethods = ['registration_fee', 'commission', 'SYSTEM_TRANSFER', 'SYSTEM TRANSFER'];
    const rawMethod = payment.method || '';
    let methodText = '-';
    if (rawMethod && !internalMethods.includes(rawMethod)) {
      methodText = formatPaymentMethod(rawMethod, rawMethod.replace(/_/g, ' ').toUpperCase());
    }

    // 2. Reference Clickable Fix
    let refHtml = `<span style="font-family: monospace;">-</span>`;
    if (payment.reference) {
      refHtml = `<a href="#" class="receipt-link" onclick="window.previewReceiptFromReport('${student.id}', '${payment.id}'); return false;" style="display:inline-flex; align-items:center; gap:0.25rem; font-family:var(--font-mono); font-size:0.875rem;">
                   <span class="icon" style="font-size:0.875rem;">${Icons.file}</span>
                   ${payment.reference}
                 </a>`;
    }

    return `
    <tr>
      <td style="white-space: nowrap;">${formatDate(payment.date, 'short')}</td>
      <td>
        <div style="font-weight: 600; color: var(--text-primary);">${student ? student.name : 'Unknown'}</div>
      </td>
      <td>${getPaymentTypeLabel(payment)}</td>
      <td><span style="font-weight: 500; color: var(--text-secondary);">${methodText}</span></td>
      <td style="white-space: nowrap;">${refHtml}</td>
      <td style="text-align: right; font-weight: 700; white-space: nowrap; color: ${payment.category === 'EXPENSE' ? 'var(--danger-600, #dc2626)' : 'var(--text-primary)'};">${
        payment.category === 'EXPENSE' ? '- ' : ''
      }${formatCurrency(payment.amount, currency)}</td>
    </tr>
  `});
  tbody.innerHTML = rows.join('');
}

/**
 * Export to XLSX using SpreadsheetExporter (consistent styling)
 */
async function exportReportXLSX() {
  if (reportData.length === 0) {
    alert('No data to export. Please generate a report first.');
    return;
  }
  
  const startDate = document.getElementById('reportStartDate').value;
  const endDate = document.getElementById('reportEndDate').value;
  const currency = reportData[0]?.currency || 'RM';
  
  // Date formatting helpers
  const formatMY = (d) => d.split('-').reverse().join('/');
  const formatFilenameDate = (d) => d.split('-').reverse().join('-');
  
  const displayPeriod = `${formatMY(startDate)} to ${formatMY(endDate)}`;
  const now = new Date();
  const timestamp = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = `Report_${formatFilenameDate(startDate)}_to_${formatFilenameDate(endDate)}_${timestamp}.xlsx`;

  // Use ExcelJS from CDN
  const ExcelJS = await import('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/+esm').then(m => m.default);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Transaction Report');
  
  // Define styles
  const styles = {
    header: {
      font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e293b' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: {
        top: { style: 'thin', color: { argb: 'FF94a3b8' } },
        left: { style: 'thin', color: { argb: 'FF94a3b8' } },
        bottom: { style: 'thin', color: { argb: 'FF94a3b8' } },
        right: { style: 'thin', color: { argb: 'FF94a3b8' } }
      }
    },
    dataCell: {
      font: { size: 10, name: 'Inter' },
      border: {
        top: { style: 'thin', color: { argb: 'FF94a3b8' } },
        left: { style: 'thin', color: { argb: 'FF94a3b8' } },
        bottom: { style: 'thin', color: { argb: 'FF94a3b8' } },
        right: { style: 'thin', color: { argb: 'FF94a3b8' } }
      },
      alignment: { vertical: 'middle' }
    },
    money: { numFmt: `"${currency}" #,##0.00` }
  };
  
  // Define column keys and widths (Initial placeholder)
  // Define column keys and widths
  const columns = [
    { key: 'no', width: 6 },
    { key: 'date', width: 12 },
    { key: 'student', width: 25 },
    { key: 'type', width: 20 },
    { key: 'method', width: 10 },
    { key: 'reference', width: 15 },
    { key: 'amount', width: 15 },
    { key: 'description', width: 30 }
  ];
  worksheet.columns = columns;

  // Title
  const titleText = `Transaction Report (${displayPeriod})`;
  const titleRow = worksheet.addRow([titleText]);
  titleRow.font = { bold: true, size: 16, name: 'Inter', color: { argb: 'FF1E293B' } };
  worksheet.mergeCells(`A${titleRow.number}:H${titleRow.number}`);
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  titleRow.height = 30; // Professional height for title
  
  worksheet.addRow([]); // Gap row
  
  // Headers Row (Manual)
  const headers = ['No', 'Date', 'Student Name', 'Type', 'Method', 'Reference', 'Amount', 'Description'];
  const headerRow = worksheet.addRow(headers);
  headerRow.height = 25;
  headerRow.eachCell((cell) => {
    Object.assign(cell.style, styles.header);
  });
  
  // Helper to get raw type string for export
  const getRawTypeName = (payment) => {
    const tt = payment.transactionType || '';
    if (tt === 'REGISTRATION_FEE') return 'Registration Fee';
    if (tt === 'COMMISSION_PAYOUT') return 'Commission Payout';
    if (payment.semester) return `Sem ${payment.semester}: Payment ${payment._paymentIndex || ''}`;
    if (payment.description) return payment.description;
    return 'Other';
  };

  // Data rows
  let rowNum = 1;
  for (const { payment, student } of reportData) {
    const dataRow = worksheet.addRow({
      no: rowNum++,
      date: formatDate(payment.date, 'short'),
      student: student ? student.name : 'Unknown',
      type: getRawTypeName(payment),
      method: (payment.method || '').toUpperCase(),
      reference: payment.reference || '-',
      amount: payment.category === 'EXPENSE' ? -payment.amount : payment.amount,
      description: payment.description || ''
    });
    
    dataRow.eachCell((cell, colIdx) => {
      cell.style = { ...styles.dataCell };
      cell.font = { name: 'Inter', size: 10, color: { argb: 'FF1A1D1F' } };
      
      if (colIdx === 1) { // No. column
        cell.numFmt = '0';
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (colIdx === 7) { // Amount column
        cell.numFmt = styles.money.numFmt;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.font = { bold: true, name: 'Inter', size: 10, color: { argb: 'FF1A1D1F' } };
      } else if (colIdx === 5) { // Method column
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (cell.value === 'CASH') {
          cell.font = { name: 'Inter', size: 10, color: { argb: 'FF1A1D1F' } };
        }
      } else if (colIdx === 3 || colIdx === 4 || colIdx === 8) { // Name, Type, Description
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
    dataRow.height = 25; 
  }
  
  // --- 4. Surgical Balanced Column Sizing (Data-Driven) ---
  const columnConfigs = [
    { header: 'No', key: 'no', min: 8, buffer: 2 },
    { header: 'Date', key: 'date', min: 14, buffer: 3 },
    { header: 'Student Name', key: 'student', min: 25, buffer: 5 },
    { header: 'Type', key: 'type', min: 15, buffer: 3 },
    { header: 'Method', key: 'method', min: 12, buffer: 3 },
    { header: 'Reference', key: 'reference', min: 15, buffer: 3 },
    { header: 'Amount', key: 'amount', min: 18, buffer: 5 },
    { header: 'Description', key: 'description', min: 15, buffer: 3 }
  ];

  columnConfigs.forEach((config, colIndex) => {
    let maxContentLen = config.header.length;
    
    // Measure data rows
    reportData.forEach((row, rowIndex) => {
      let val = '';
      if (config.key === 'no') val = (rowIndex + 1).toString();
      else if (config.key === 'date') val = formatDate(row.payment.date, 'short');
      else if (config.key === 'student') val = row.student.name;
      else if (config.key === 'type') val = getRawTypeName(row.payment);
      else if (config.key === 'method') val = row.payment.method || '';
      else if (config.key === 'reference') val = row.payment.reference || '';
      else if (config.key === 'amount') val = `RM ${row.payment.amount.toFixed(2)}`;
      else if (config.key === 'description') val = row.payment.description || '';
      
      if (val.length > maxContentLen) maxContentLen = val.length;
    });

    // Balanced surgical width
    worksheet.getColumn(colIndex + 1).width = Math.max(config.min, Math.min(maxContentLen + config.buffer, 65));
  });

  // Summary Row
  worksheet.addRow([]);
  const totalAmount = reportData.reduce((sum, { payment }) => {
    return sum + (payment.category === 'EXPENSE' ? -payment.amount : payment.amount);
  }, 0);
  // Place TOTAL: in col 6 (Reference) and amount in col 7 (Amount)
  const summaryRow = worksheet.addRow(['', '', '', '', '', 'TOTAL:', totalAmount]);
  
  // Apply a solid border to the ENTIRE total row to close the table cleanly
  summaryRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF1E293B' } }
    };
    
    if (colIdx === 6 || colIdx === 7) { // TOTAL: and Amount
      cell.font = { bold: true, name: 'Inter', size: 10, color: { argb: 'FF059669' } }; // Green for total emphasis
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (colIdx === 7) {
        cell.numFmt = styles.money.numFmt;
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF1E293B' } },
          bottom: { style: 'double', color: { argb: 'FF1E293B' } }
        };
      }
    }
  });
  summaryRow.height = 25;

  // Download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Shared PDF Generation Logic
 */
async function generateReportPDF(startDate, endDate) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const currency = reportData[0]?.currency || 'RM';

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`Transaction Report`, 14, 15);
  const formatMY = (d) => d.split('-').reverse().join('/');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${formatMY(startDate)} to ${formatMY(endDate)}`, 14, 22);
  
  // Helper for raw type string
  const getRawTypeName = (payment) => {
    const tt = payment.transactionType || '';
    if (tt === 'REGISTRATION_FEE') return 'Registration Fee';
    if (tt === 'COMMISSION_PAYOUT') return 'Commission Payout';
    if (payment.semester) return `Sem ${payment.semester}: Payment ${payment._paymentIndex || ''}`;
    if (payment.description) return payment.description;
    return 'Other';
  };

  // Table
  const tableData = reportData.map(({ payment, student }, idx) => [
    idx + 1,
    formatDate(payment.date, 'short'),
    student ? student.name : 'Unknown',
    getRawTypeName(payment),
    (payment.method || '').toUpperCase(),
    payment.reference || '-',
    `${payment.category === 'EXPENSE' ? '-' : ''}${currency} ${payment.amount.toFixed(2)}`,
    payment.description || ''
  ]);
  
  const totalAmount = reportData.reduce((sum, { payment }) => sum + payment.amount, 0);

  autoTable(doc, {
    startY: 28,
    head: [['No', 'Date', 'Student Name', 'Type', 'Method', 'Reference', 'Amount', 'Description']],
    body: tableData,
    foot: [['', '', '', '', '', 'TOTAL:', `${currency} ${totalAmount.toFixed(2)}`, '']],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      lineWidth: 0.1,
      lineColor: [200, 200, 200] // Matching the rest of the table grid
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [30, 41, 59],
      fontStyle: 'bold',
      halign: 'right',
      lineWidth: 0.1,
      lineColor: [200, 200, 200]
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'center', cellWidth: 22 },
      2: { halign: 'left' },
      3: { halign: 'left', cellWidth: 35 },
      4: { halign: 'center', cellWidth: 18 },
      5: { halign: 'center', cellWidth: 30 },
      6: { halign: 'right', cellWidth: 28 },
      7: { halign: 'left' }
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineWidth: 0.1,
      lineColor: [200, 200, 200]
    }
  });

  return doc;
}

/**
 * Export to PDF
 */
async function exportReportPDF() {
  if (reportData.length === 0) {
    alert('No data to export. Please generate a report first.');
    return;
  }
  
  const startDate = document.getElementById('reportStartDate').value;
  const endDate = document.getElementById('reportEndDate').value;
  
  const doc = await generateReportPDF(startDate, endDate);
  
  const now = new Date();
  const timestamp = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const formatFilename = (d) => d.split('-').reverse().join('-');
  const filename = `Report_${formatFilename(startDate)}_to_${formatFilename(endDate)}_${timestamp}.pdf`;
  doc.save(filename);
}

/**
 * Print report
 */
async function printReport() {
  if (reportData.length === 0) {
    alert('No data to print. Please generate a report first.');
    return;
  }
  
  const startDate = document.getElementById('reportStartDate').value;
  const endDate = document.getElementById('reportEndDate').value;
  
  const doc = await generateReportPDF(startDate, endDate);
  
  const now = new Date();
  const timestamp = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const formatFilename = (d) => d.split('-').reverse().join('-');
  const filename = `Report_${formatFilename(startDate)}_to_${formatFilename(endDate)}_${timestamp}`;
  openPdfPreviewModal(doc, filename, null);
}

/**
 * Handle clicking on a reference number in the report
 */
async function previewReceiptFromReport(studentId, paymentId) {
  try {
    const student = await Student.findById(studentId);
    const payment = await Payment.findById(paymentId);
    const allPayments = await Payment.findByStudent(studentId);
    
    if (!student || !payment) {
      alert('Error: Could not find student or payment data.');
      return;
    }

    // Need to dynamically import generation to avoid circular deps with StudentDetailModal
    const { generateReceiptPDF, generateFeeReceiptPDF } = await import('../utils/pdfGenerator.js');

    let result;
    if (payment.transactionType === 'REGISTRATION_FEE') {
      result = await generateFeeReceiptPDF(student, 'Registration Fee', payment.amount, payment.reference, null);
    } else if (payment.transactionType === 'COMMISSION_PAYOUT') {
      result = await generateFeeReceiptPDF(student, 'Commission Fee', payment.amount, payment.reference, student.commissionPaidTo || '');
    } else {
      result = await generateReceiptPDF(student, payment, allPayments);
    }

    const { doc, saveResult } = result;
    
    if (saveResult?.success && window.electronAPI) {
      await window.electronAPI.openFile(saveResult.path);
    } else {
      const filename = `Receipt_${payment.reference || 'PAY'}_${student.name.replace(/\s+/g, '_')}`;
      openPdfPreviewModal(doc, filename, saveResult);
    }
  } catch (error) {
    console.error('Error opening receipt preview from reports:', error);
    alert('Failed to open receipt. Please try again.');
  }
}
