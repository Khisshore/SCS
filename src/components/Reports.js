/**
 * REPORTS COMPONENT
 * Professional financial reporting
 */

import { Payment } from '../models/Payment.js';
import { Student } from '../models/Student.js';
import { formatCurrency, formatDate } from '../utils/formatting.js';
import { db } from '../db/database.js';
import { Icons } from '../utils/icons.js';

export async function renderReports() {
  const container = document.getElementById('app-content');
  
  // Set default date range (this month)
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = today.toISOString().split('T')[0];

  container.innerHTML = `
    <div class="reports-container" style="animation: fadeIn 0.5s ease-out;">
      <!-- Header -->
      <div class="flex justify-between items-center mb-2xl">
        <div>
          <h1 style="margin-bottom: 0.5rem;">Financial Reports</h1>
          <p style="margin: 0; color: var(--text-secondary);">Review and export your institution's financial records.</p>
        </div>
        <div class="flex gap-md">
          <button class="btn btn-secondary" id="exportExcelBtn">
            <span class="icon">${Icons.download}</span>
            Export Excel
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
            <div class="form-group mb-0">
              <label class="form-label" style="visibility: hidden;">&nbsp;</label>
              <button class="btn btn-primary" id="generateReportBtn" style="padding: 0.75rem 1.5rem; height: 42px;">
                <span class="icon">${Icons.fileText}</span>
                Generate Report
              </button>
            </div>
          </div>
          
          <div class="flex gap-sm mt-lg">
            <span style="font-size: 0.8rem; color: var(--text-tertiary); font-weight: 600; align-self: center; margin-right: 0.5rem;">PRESETS:</span>
            <button class="badge badge-secondary cursor-pointer preset-btn" data-preset="month">THIS MONTH</button>
            <button class="badge badge-secondary cursor-pointer preset-btn" data-preset="quarter">LAST 3 MONTHS</button>
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
    </style>
  `;

  // Attach event listeners
  document.getElementById('generateReportBtn').addEventListener('click', updateReport);
  document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);
  
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      setPresetDateRange(preset);
      updateReport();
    });
  });

  // Initial report load
  await updateReport();
}

/**
 * Set date inputs based on presets
 */
function setPresetDateRange(preset) {
  const startInput = document.getElementById('reportStartDate');
  const endInput = document.getElementById('reportEndDate');
  const today = new Date();
  let start = new Date();

  if (preset === 'month') {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (preset === 'quarter') {
    // Current month + 2 previous months = 3 months total
    // User requested "Last 3 Months" starting from 1st.
    // Use -2 to include current month (e.g., Aug, July, June = 3 months)
    start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  } else if (preset === 'year') {
    start = new Date(today.getFullYear(), 0, 1);
  }

  startInput.value = start.toISOString().split('T')[0];
  endInput.value = today.toISOString().split('T')[0];
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
  
  document.getElementById('transactionCountBadge').textContent = `${payments.length} record${payments.length !== 1 ? 's' : ''}`;

  // Render Table
  const tbody = document.getElementById('reportTbody');
  if (payments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 3rem; color: var(--text-tertiary);">No transactions found for this period.</td></tr>`;
    return;
  }

  const rows = [];
  for (const payment of payments) {
    const student = await Student.findById(payment.studentId);
    rows.push(`
      <tr>
        <td>${formatDate(payment.date, 'short')}</td>
        <td>
          <div style="font-weight: 600; color: var(--text-primary);">${student ? student.name : 'Unknown'}</div>
        </td>
        <td><span class="badge badge-primary">${payment.method.replace('_', ' ').toUpperCase()}</span></td>
        <td style="font-family: monospace;">${payment.reference || '-'}</td>
        <td style="text-align: right; font-weight: 700; color: var(--text-primary);">${formatCurrency(payment.amount, currency)}</td>
      </tr>
    `);
  }
  tbody.innerHTML = rows.join('');
}

/**
 * Export to Excel (Styled HTML)
 */
async function exportToExcel() {
  const startDate = document.getElementById('reportStartDate').value;
  const endDate = document.getElementById('reportEndDate').value;
  const payments = await Payment.findAll({ startDate, endDate });

  if (payments.length === 0) {
    alert('No data to export.');
    return;
  }

  let tableRows = '';
  
  for (const p of payments) {
    const student = await Student.findById(p.studentId);
    tableRows += `
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px;">${formatDate(p.date, 'short')}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${p.studentId}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${student ? student.name : 'Unknown'}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${p.method.toUpperCase()}</td>
        <td style="border: 1px solid #ddd; padding: 8px; mso-number-format:'\\@'">${p.reference || ''}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${p.amount.toFixed(2)}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${p.description || ''}</td>
      </tr>
    `;
  }

  const htmlContent = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Transaction Report</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <meta charset="utf-8">
      <style>
        .header { background-color: #4f46e5; color: white; font-weight: bold; text-align: center; }
        td { font-family: Arial, sans-serif; font-size: 11pt; }
      </style>
    </head>
    <body>
      <h2 style="font-family: Arial, sans-serif;">Transaction Report (${startDate} to ${endDate})</h2>
      <table style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr>
            <th class="header" style="border: 1px solid #000; padding: 10px;">Date</th>
            <th class="header" style="border: 1px solid #000; padding: 10px;">Student ID</th>
            <th class="header" style="border: 1px solid #000; padding: 10px;">Student Name</th>
            <th class="header" style="border: 1px solid #000; padding: 10px;">Method</th>
            <th class="header" style="border: 1px solid #000; padding: 10px;">Reference</th>
            <th class="header" style="border: 1px solid #000; padding: 10px;">Amount</th>
            <th class="header" style="border: 1px solid #000; padding: 10px;">Description</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Transaction_Report_${startDate}_to_${endDate}.xls`); // .xls for HTML compatibility
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

