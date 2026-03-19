/**
 * SPREADSHEET COMPONENT - REDESIGNED
 * Modern, simplified financial reporting interface
 * Based on Stitch design mockup
 */

import { Student } from '../models/Student.js';
import { Payment } from '../models/Payment.js';
import { StudentRemarks } from '../models/StudentRemarks.js';
import { formatCurrency, formatDate, formatMonthYear, escapeHtml } from '../utils/formatting.js';
import { Icons } from '../utils/icons.js';
import { db } from '../db/database.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateReceiptPDF, previewPDF, generateFeeReceiptPDF } from '../utils/pdfGenerator.js';
import { initStudentDetailModal, openStudentDetailModal } from './StudentDetailModal.js';
import { SpreadsheetExporter } from '../utils/spreadsheetExporter.js';
import { initPdfPreviewModal, openPdfPreviewModal } from './PdfPreviewModal.js';
import { registerActions } from '../actions.js';

// Available courses (removed 'Other')
const COURSES = ['All Programs', 'Diploma', 'BBA', 'MBA', 'DBA'];

// Current state
let currentCourse = 'All Programs';
let spreadsheetData = [];
let searchQuery = '';
let filterOutstanding = false;
let sortBy = 'name';
let sortOrder = 'asc'; // 'asc' or 'desc'

/**
 * Render instant skeleton placeholder while real data loads.
 */
export function renderSpreadsheetSkeleton() {
  const container = document.getElementById('app-content');
  const pills = COURSES.map(() =>
    `<div class="skeleton" style="width:90px;height:36px;border-radius:var(--radius-full)"></div>`
  ).join('');

  const rows = Array(10).fill('').map(() => `
    <div class="skeleton-table-row">
      <div class="skeleton skeleton-text" style="width:4%;height:0.75rem"></div>
      <div class="skeleton skeleton-text" style="width:22%;height:0.75rem"></div>
      <div class="skeleton skeleton-text" style="width:18%;height:0.75rem"></div>
      <div class="skeleton skeleton-text" style="width:12%;height:0.75rem"></div>
      <div class="skeleton skeleton-text" style="width:12%;height:0.75rem"></div>
      <div class="skeleton skeleton-text" style="width:10%;height:0.75rem"></div>
      <div class="skeleton skeleton-text" style="width:10%;height:0.75rem"></div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="skeleton-page spreadsheet-page">
      <header class="spreadsheet-header">
        <div>
          <div class="skeleton skeleton-heading" style="width:160px"></div>
          <div class="skeleton skeleton-text medium"></div>
        </div>
        <div class="flex gap-md">
          <div class="skeleton" style="width:100px;height:40px;border-radius:var(--radius-md)"></div>
          <div class="skeleton" style="width:80px;height:40px;border-radius:var(--radius-md)"></div>
        </div>
      </header>
      <div class="controls-section">
        <div class="flex gap-sm items-center" style="margin-bottom:1rem">${pills}</div>
        <div class="skeleton" style="width:100%;height:44px;border-radius:var(--radius-md)"></div>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="skeleton-table">${rows}</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render the Spreadsheet page
 */
export async function renderSpreadsheet() {
  const container = document.getElementById('app-content');

  container.innerHTML = `
    <div class="spreadsheet-page">
      <!-- Page Header -->
      <header class="spreadsheet-header">
        <div>
          <h1>Spreadsheet</h1>
          <p class="subtitle">Student payment management for educational institutions.</p>
        </div>
        <div class="header-actions">
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
      </header>

      <!-- Filters & Search -->
      <div class="controls-section">
        <div class="filters-search-row">
          <div class="course-pills">
            ${COURSES.map(course => `
              <button class="course-pill ${course === currentCourse ? 'active' : ''}" data-course="${course}">
                ${course}
              </button>
            `).join('')}
            
            <div class="filter-divider"></div>
            
            <button class="course-pill status-filter ${filterOutstanding ? 'active' : ''}" id="balanceFilter">
              With Balance
            </button>
          </div>
          
          <div class="search-box pill">
            <span class="search-icon">${Icons.search}</span>
            <input 
              type="text" 
              id="searchInput" 
              class="form-input"
              placeholder="Search by student name, ID or intake..." 
              value="${searchQuery}"
            />
          </div>
        </div>
      </div>

      <!-- Table Container -->
      <div id="tableContainer"></div>

      <!-- Summary Cards -->
      <div id="summaryCards"></div>
    </div>

    <style>
      /* Let the spreadsheet use the full available width */
      .spreadsheet-page {
        animation: fadeIn 0.4s ease-out;
        width: 100%;
        max-width: none;
        box-sizing: border-box;
      }

      /* Override content-wrapper constraint while spreadsheet is active */
      .content-wrapper {
        max-width: none;
      }

      .spreadsheet-page.is-empty {
        overflow: hidden !important;
        height: auto !important;
        min-height: calc(100vh - 12rem) !important;
      }

      .spreadsheet-page.is-empty .spreadsheet-data-scaled {
        overflow: hidden !important;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .spreadsheet-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 2rem;
        gap: 2rem;
      }

      .spreadsheet-header h1 {
        font-size: var(--font-size-4xl);
        font-weight: 800;
        margin: 0 0 0.5rem 0;
        color: var(--text-primary);
        letter-spacing: -0.025em;
      }

      .subtitle {
        font-size: var(--font-size-base);
        color: var(--text-secondary);
        margin: 0;
        opacity: 0.9;
      }

      .header-actions {
        display: flex;
        gap: 0.75rem;
        align-items: center;
      }

      .export-dropdown {
        position: relative;
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

      .controls-section {
        margin-bottom: 1.5rem;
      }

      .filters-search-row {
        display: flex;
        gap: 2rem;
        align-items: center;
        justify-content: flex-start;
      }

      .course-pills {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }

      .course-pill {
        padding: 0.625rem 1.25rem;
        border-radius: 9999px;
        border: 1px solid var(--border-color);
        background: var(--surface);
        color: var(--text-secondary);
        font-size: var(--font-size-sm);
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .course-pill:hover {
        background: var(--surface-hover);
        color: var(--text-primary);
      }

      .course-pill.active {
        background: var(--primary-600);
        color: white;
        border-color: var(--primary-600);
        box-shadow: 0 2px 8px rgba(37, 99, 235, 0.2);
      }

      .filter-divider {
        width: 1.5px;
        align-self: stretch;
        background: #475569;
        margin: 0.25rem 0.75rem;
        opacity: 0.8;
      }

      [data-theme="dark"] .filter-divider {
        background: #94A3B8;
        opacity: 0.5;
      }

      .status-filter.active {
        background: var(--danger-600);
        color: white;
        border-color: var(--danger-600);
        box-shadow: 0 2px 8px rgba(220, 38, 38, 0.2);
      }

      .sort-control {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .sort-label {
        font-size: 0.875rem;
        color: var(--text-secondary);
      }

      .sort-control select {
        border: none;
        background: transparent;
        color: var(--text-primary);
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        padding: 0.25rem;
      }

      .sort-control select:focus {
        outline: none;
      }

      .program-section {
        margin-bottom: 2rem;
      }

      .program-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: var(--font-size-xl);
        font-weight: 700;
        color: var(--text-primary);
        margin-top: 1.5rem;
        margin-bottom: 1.5rem;
        letter-spacing: -0.01em;
      }

      .program-indicator {
        width: 0.5rem;
        height: 1.5rem;
        background: var(--primary-600);
        border-radius: 9999px;
      }

      .table-card {
        background: var(--glass-bg);
        backdrop-filter: var(--glass-blur);
        -webkit-backdrop-filter: var(--glass-blur);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-2xl);
        overflow: hidden;
        box-shadow: var(--glass-shadow), var(--shadow-sm);
        position: relative;
      }

      .table-card::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        padding: 1px;
        background: linear-gradient(
          135deg,
          var(--glass-highlight) 0%,
          transparent 40%,
          transparent 60%,
          var(--glass-stroke) 100%
        );
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
        z-index: 21;
      }

      .table-scroll {
        overflow-x: auto;
      }

      .table-scroll::-webkit-scrollbar {
        height: 6px;
      }

      .table-scroll::-webkit-scrollbar-track {
        background: transparent;
      }

      .table-scroll::-webkit-scrollbar-thumb {
        background: #CBD5E1;
        border-radius: 10px;
      }

      .spreadsheet-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: auto;
        border-style: hidden;
      }

      .spreadsheet-table thead {
        background: var(--background-secondary);
        position: sticky;
        top: 0;
        z-index: 20;
      }

      .spreadsheet-table th {
        padding: 1rem;
        text-align: left;
        font-size: var(--font-size-sm);
        font-weight: 800;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 2px solid var(--border-color);
        cursor: pointer;
        user-select: none;
        transition: background 0.15s;
        white-space: nowrap;
      }

      .spreadsheet-table th:hover {
        background: var(--surface-hover);
      }

      .sort-icon {
        display: inline-flex;
        align-items: center;
        margin-left: 0.25rem;
        opacity: 0.3;
        transition: opacity 0.15s;
      }

      .spreadsheet-table th.active-sort .sort-icon {
        opacity: 1;
        color: var(--primary-600);
      }

      .spreadsheet-table th:first-child,
      .spreadsheet-table td:first-child {
        width: 50px;
        min-width: 50px;
        text-align: center;
      }

      .spreadsheet-table th.name-col {
        min-width: 280px;
      }

      .spreadsheet-table td.name-col {
        min-width: 280px;
        white-space: normal;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      .spreadsheet-table tbody tr {
        border-bottom: 1px solid var(--border-color);
        transition: background 0.15s;
        cursor: pointer;
      }

      .spreadsheet-table tbody tr.institution-header {
        cursor: default;
      }

      .spreadsheet-table tbody tr:hover {
        background: var(--surface-hover);
      }

      .spreadsheet-table tbody tr.institution-header {
        background: var(--primary-50);
        opacity: 0.8;
      }

      .spreadsheet-table tbody tr.institution-header:hover {
        background: var(--primary-100);
      }

      .spreadsheet-table tbody tr.institution-header td {
        padding: 1.25rem 1rem;
      }

      .institution-name {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: var(--font-size-base);
        font-weight: 700;
        color: var(--primary-600);
      }

      .program-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
        height: 1.5rem;
        color: var(--primary-600);
      }

      .program-logo svg,
      .program-logo img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .institution-icon {
        color: var(--primary-600);
        font-size: 1.25rem;
      }

      .spreadsheet-table td {
        padding: 1rem;
        font-size: var(--font-size-base);
        color: var(--text-secondary);
        font-weight: 500;
        white-space: nowrap;
      }




      .student-cell {
        display: flex;
        align-items: center;
      }

      .student-avatar {
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 9999px;
        object-fit: cover;
        flex-shrink: 0;
        margin-right: 0.75rem;
      }

      .student-avatar-fallback {
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 9999px;
        background: var(--surface-hover);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
        font-weight: 700;
        color: var(--text-secondary);
        flex-shrink: 0;
        margin-right: 1rem;
      }

      .student-info {
        min-width: 0;
      }

      .student-name {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.75rem;
        font-size: 1rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
        line-height: 1.4;
      }



      .amount-bold {
        font-weight: 700;
        color: var(--text-primary);
        font-size: var(--font-size-base);
      }

      .amount-paid {
        font-weight: 700;
        color: var(--success-600) !important;
        font-size: var(--font-size-base);
      }

      .amount-outstanding {
        font-weight: 700;
        color: var(--danger-600) !important;
        font-size: var(--font-size-base);
      }

      .table-footer {
        padding: 1rem 1.5rem;
        border-top: 1px solid var(--border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .pagination-info {
        font-size: 0.875rem;
        color: var(--text-secondary);
      }

      .pagination-info strong {
        color: var(--text-primary);
        font-weight: 600;
      }

      .pagination-controls {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }

      .pagination-btn {
        padding: 0.5rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.15s;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .pagination-btn:hover:not(:disabled) {
        background: var(--surface-hover);
      }

      .pagination-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .page-number {
        padding: 0.375rem 0.875rem;
        border-radius: var(--radius-lg);
        background: transparent;
        color: var(--text-secondary);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
        border: none;
      }

      .page-number:hover {
        background: var(--surface-hover);
      }

      .page-number.active {
        background: var(--primary-600);
        color: white;
        font-weight: 600;
      }

      .summary-cards {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1.5rem;
        margin-top: 2rem;
      }

      @media (max-width: 1200px) {
        .summary-cards {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (max-width: 640px) {
        .summary-cards {
          grid-template-columns: 1fr;
        }
      }

      .summary-card {
        background: var(--glass-bg);
        backdrop-filter: var(--glass-blur);
        -webkit-backdrop-filter: var(--glass-blur);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-2xl);
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        box-shadow: var(--glass-shadow);
        position: relative;
        overflow: hidden;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }

      .summary-card:hover {
        transform: translateY(-4px);
        box-shadow: var(--glass-shadow), var(--shadow-md);
      }

      .summary-card::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        padding: 1px;
        background: linear-gradient(
          135deg,
          var(--glass-highlight) 0%,
          transparent 40%,
          transparent 60%,
          var(--glass-stroke) 100%
        );
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
        z-index: 1;
      }

      .summary-card-label {
        font-size: 0.875rem;
        color: var(--text-secondary);
        font-weight: 500;
        margin-bottom: 0.5rem;
        order: 1;
      }

      .summary-card-value {
        font-size: 1.875rem;
        font-weight: 800;
        margin-bottom: 0.5rem;
        order: 2;
        letter-spacing: -0.02em;
      }

      .summary-card-value.success {
        color: var(--success-600);
      }

      .summary-card-value.danger {
        color: var(--danger-600);
      }

      .summary-card-value.primary {
        color: var(--text-primary);
      }

      .summary-card-meta {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.6875rem;
        order: 3;
      }

      .summary-card-meta.success {
        color: var(--success-600);
      }

      .summary-card-meta.danger {
        color: var(--danger-600);
      }

      .summary-card-meta.primary {
        color: var(--primary-600);
      }

      .progress-bar {
        width: 100%;
        height: 0.375rem;
        background: var(--surface-hover);
        border-radius: 9999px;
        overflow: hidden;
        order: 4;
      }

      .progress-fill {
        height: 100%;
        background: var(--primary-600);
        border-radius: 9999px;
        transition: width 0.3s ease;
      }

      @media print {
        .header-actions, .controls-section, .table-footer, .summary-cards {
          display: none !important;
        }
      }



      .empty-state p {
        font-size: 0.875rem;
        color: var(--text-tertiary);
        margin: 0 0 1.5rem 0;
        max-width: 500px;
        line-height: 1.5;
      }

      .empty-state-btn {
        padding: 0.625rem 1.25rem;
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-xl);
        color: var(--text-primary);
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .empty-state-btn:hover {
        background: var(--surface-hover);
        border-color: var(--primary-300);
        color: var(--primary-600);
        transform: translateY(-1px);
        box-shadow: var(--shadow-sm);
      }
      .spinner {
        width: 2.5rem;
        height: 2.5rem;
        border: 3px solid rgba(37, 99, 235, 0.1);
        border-top-color: var(--primary-600);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin: 0 auto;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* Universal status-badge is handled in index.css */
    </style>
  `;

  // Initialize shared modals
  initStudentDetailModal();
  initPdfPreviewModal();

  // Setup event listeners
  setupEventListeners();

  console.log('Spreadsheet rendered');

  // Load initial data
  await loadSpreadsheetData();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Course pill clicks
  document.querySelectorAll('.course-pill:not(.status-filter)').forEach(pill => {
    pill.addEventListener('click', async () => {
      currentCourse = pill.dataset.course;
      
      // Update UI
      document.querySelectorAll('.course-pill:not(.status-filter)').forEach(p => {
        p.classList.toggle('active', p.dataset.course === currentCourse);
      });
      
      await loadSpreadsheetData();
    });
  });

  // Balance filter
  document.getElementById('balanceFilter')?.addEventListener('click', async () => {
    filterOutstanding = !filterOutstanding;
    document.getElementById('balanceFilter').classList.toggle('active', filterOutstanding);
    await loadSpreadsheetData();
  });

  // Search input
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(async (e) => {
      searchQuery = e.target.value.toLowerCase();
      await loadSpreadsheetData();
    }, 300));
  }

  // Header Sorting (Event Delegation)
  document.getElementById('tableContainer')?.addEventListener('click', async (e) => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;

    const field = th.dataset.sort;
    if (sortBy === field) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = field;
      sortOrder = 'asc';
    }
    await loadSpreadsheetData();
  });

  // Export dropdown
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

  // Export XLSX
  document.getElementById('exportXlsxBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    const exporter = new SpreadsheetExporter({
      title: `Student Payment Spreadsheet - ${currentCourse}`,
      subtitle: `Generated: ${formatDate(new Date(), 'time')}`,
      rows: spreadsheetData,
      currency: 'RM',
      course: currentCourse
    });
    exporter.exportToXLSX();
  });

  // Export PDF
  document.getElementById('exportPdfBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    exportToPDF();
  });

  // Print
  document.getElementById('printBtn')?.addEventListener('click', () => {
    printSpreadsheet();
  });

  // Register actions
  registerActions({
    'spreadsheet-clear-filters': async () => {
      searchQuery = '';
      currentCourse = 'All Programs'; // Reset to default
      filterOutstanding = false;
      
      // Update UI elements if they exist
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
      
      const balanceFilter = document.getElementById('balanceFilter');
      if (balanceFilter) balanceFilter.classList.remove('active');
      
      document.querySelectorAll('.course-pill:not(.status-filter)').forEach(p => {
        p.classList.toggle('active', p.dataset.course === currentCourse);
      });
      
      await loadSpreadsheetData();
    }
  });

  // Student Detail Modal Close Event
  window.onStudentModalClose = async () => {
    await loadSpreadsheetData();
  };

  // Student row click handler (Event Delegation)
  document.getElementById('tableContainer')?.addEventListener('click', async (e) => {
    const studentRow = e.target.closest('tr:not(.institution-header)');
    if (!studentRow || studentRow.classList.contains('institution-header')) return;

    // Use student ID from data attribute for reliable lookup
    const studentId = studentRow.dataset.studentId;
    if (!studentId) return;
    
    // Find the student in our data (supporting both string and numeric IDs)
    const student = await Student.findById(studentId);
    
    if (student) {
      await openStudentDetailModal(student);
    }
  });

  // Background refresh from AI Chat
  window.addEventListener('studentsUpdated', async () => {
    console.log('🔄 Spreadsheet refreshing due to background update...');
    await loadSpreadsheetData();
  });
}


/**
 * Load and render spreadsheet data
 */
async function loadSpreadsheetData() {
  const tableContainer = document.getElementById('tableContainer');
  const summaryCardsContainer = document.getElementById('summaryCards');
  
  const page = document.querySelector('.spreadsheet-page');
  
  // Show loading
  tableContainer.innerHTML = `
    <div style="text-align: center; padding: 3rem;">
      <div class="spinner"></div>
      <p style="margin-top: 1rem; color: var(--text-tertiary);">Loading data...</p>
    </div>
  `;

  try {
    // Get students
    let students = currentCourse === 'All Programs'
      ? await Student.findAll()
      : await Student.findAll({ course: currentCourse });
    
    if (students.length === 0) {
      if (page) page.classList.add('is-empty');
      tableContainer.innerHTML = `
        <div class="table-card" style="border: 1px solid var(--border-color); border-radius: var(--radius-xl); overflow: hidden;">
          <div style="text-align: center; padding: 4rem 2rem; color: var(--text-tertiary);">
            <div style="font-size: 3.5rem; margin-bottom: 1.5rem;">
              <span class="icon icon-xl" style="opacity: 0.5;">${Icons.users}</span>
            </div>
            <p style="font-size: var(--font-size-xl); margin-bottom: 0.75rem; color: var(--text-primary); font-weight: 700;">No students found</p>
            <p style="font-size: var(--font-size-base); opacity: 0.8;">There are currently no students enrolled in the <strong>${currentCourse}</strong> program.</p>
          </div>
        </div>
      `;
      summaryCardsContainer.innerHTML = '';
      return;
    }

    // Apply search filter
    if (searchQuery) {
      const filteredStudents = students.filter(s => 
        s.name.toLowerCase().includes(searchQuery) ||
        s.studentId.toLowerCase().includes(searchQuery) ||
        (s.intake && s.intake.toLowerCase().includes(searchQuery))
      );

      if (filteredStudents.length === 0) {
        if (page) page.classList.add('is-empty');
        tableContainer.innerHTML = `
          <div class="table-card" style="border: 1px solid var(--border-color); border-radius: var(--radius-xl); overflow: hidden;">
            <div style="text-align: center; padding: 4rem 2rem; color: var(--text-tertiary);">
              <div style="font-size: 3.5rem; margin-bottom: 1.5rem;">
                <span class="icon icon-xl" style="opacity: 0.5;">${Icons.search}</span>
              </div>
              <p style="font-size: var(--font-size-xl); margin-bottom: 0.75rem; color: var(--text-primary); font-weight: 700;">No results found</p>
              <p style="font-size: var(--font-size-base); margin-bottom: 2rem; opacity: 0.8;">We couldn't find any students matching "<strong>${searchQuery}</strong>" in the selected program.</p>
              <button class="btn btn-secondary" data-action="spreadsheet-clear-filters" style="margin: 0 auto; padding: 0.75rem 1.5rem;">
                <span class="icon" style="font-size: 1rem;">✕</span>
                Clear search
              </button>
            </div>
          </div>
        `;
        summaryCardsContainer.innerHTML = '';
        return;
      }
      students = filteredStudents;
    }

    if (page) page.classList.remove('is-empty');

    const currency = await db.getSetting('currency') || 'RM';
    const courseName = currentCourse || 'All Programs';

    // [Performance Optimization] Batch fetch ALL payments in one go and group them
    const allPayments = await Payment.findAll();
    const paymentsByStudent = allPayments.reduce((acc, p) => {
      if (!acc[p.studentId]) acc[p.studentId] = [];
      acc[p.studentId].push(p);
      return acc;
    }, {});

    // Calculate payment data for each student
    const studentData = [];
    for (const student of students) {
      const studentPayments = paymentsByStudent[student.id] || [];
      const tuitionPayments = studentPayments.filter(p => p.transactionType !== 'REGISTRATION_FEE' && p.transactionType !== 'COMMISSION_PAYOUT');
      const totalPaid = tuitionPayments.reduce((sum, p) => sum + p.amount, 0);
      const balance = (student.totalFees || 0) - totalPaid;
      
      studentData.push({
        student,
        totalPaid,
        balance,
        misc: student.commission || 0,
        cost: student.institutionalCost || 0
      });
    }

    // Apply "With Balance" filter
    if (filterOutstanding) {
      const filteredResults = studentData.filter(d => d.balance >= 0.01);
      
      // Re-calculate the studentData array with filtered results
      studentData.length = 0;
      studentData.push(...filteredResults);
      
      // Update students list to match
      students = studentData.map(d => d.student);
    }

    // Apply sorting
    studentData.sort((a, b) => {
      let valA, valB;
      
      switch (sortBy) {
        case 'name':
          valA = a.student.name.toLowerCase();
          valB = b.student.name.toLowerCase();
          break;
        case 'intake':
          valA = a.student.intake || '';
          valB = b.student.intake || '';
          break;
        case 'completion':
          valA = a.student.completionDate || '';
          valB = b.student.completionDate || '';
          break;
        case 'cost':
          valA = a.cost;
          valB = b.cost;
          break;
        case 'fees':
          valA = a.student.totalFees || 0;
          valB = b.student.totalFees || 0;
          break;
        case 'paid':
          valA = a.totalPaid;
          valB = b.totalPaid;
          break;
        case 'balance':
          valA = a.balance;
          valB = b.balance;
          break;
        case 'no':
          valA = a.student.id;
          valB = b.student.id;
          break;
        default:
          valA = a.student.name.toLowerCase();
          valB = b.student.name.toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // Group by course then program
    const courseGroups = {};
    studentData.forEach(data => {
      const course = data.student.course || 'Unassigned Course';
      const program = data.student.program || 'General Program';
      
      if (!courseGroups[course]) {
        courseGroups[course] = {};
      }
      if (!courseGroups[course][program]) {
        courseGroups[course][program] = [];
      }
      courseGroups[course][program].push(data);
    });

    // Sort course names according to COURSES array (except 'All Programs')
    const sortedCourses = Object.keys(courseGroups).sort((a, b) => {
      const idxA = COURSES.indexOf(a);
      const idxB = COURSES.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    const finalGrouping = {};
    sortedCourses.forEach(c => {
      finalGrouping[c] = courseGroups[c];
    });

    // Calculate summary statistics
    const totalCollected = studentData.reduce((sum, d) => sum + d.totalPaid, 0);
    const totalOutstanding = studentData.reduce((sum, d) => sum + d.balance, 0);
    const totalFees = studentData.reduce((sum, d) => sum + (d.student.totalFees || 0), 0);
    const collectionProgress = totalFees > 0 ? Math.round((totalCollected / totalFees) * 100) : 0;

    // Update global state for exports
    spreadsheetData = studentData;

    // Render table
    renderTable(finalGrouping, currency);
    
    // Render summary cards
    const activeEnrollments = students.filter(s => s.status === 'active').length;
    renderSummaryCards(totalCollected, totalOutstanding, activeEnrollments, currency);
    
  } catch (error) {
    console.error('Error loading spreadsheet data:', error);
    tableContainer.innerHTML = `
      <div class="empty-state">
        <div class="icon-lg">❌</div>
        <h3>Error loading data</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
}

/**
 * Render the table
 */
function renderTable(courseGroups, currency) {
  const tableContainer = document.getElementById('tableContainer');
  
  const courses = Object.keys(courseGroups);
  
  if (courses.length === 0) {
    tableContainer.innerHTML = `
      <div class="table-card" style="border: 1px solid var(--border-color); border-radius: var(--radius-xl); overflow: hidden;">
        <div style="text-align: center; padding: 4rem 2rem; color: var(--text-tertiary);">
          <div style="font-size: 3.5rem; margin-bottom: 1.5rem;">
            <span class="icon icon-xl" style="opacity: 0.5;">${Icons.search}</span>
          </div>
          <p style="font-size: var(--font-size-xl); margin-bottom: 0.75rem; color: var(--text-primary); font-weight: 700;">No results found</p>
          <p style="font-size: var(--font-size-base); opacity: 0.8;">Try adjusting your search or filters.</p>
        </div>
      </div>
    `;
    return;
  }

  let fullHtml = '';
  
  courses.forEach(courseName => {
    const programGroups = courseGroups[courseName];
    const programs = Object.keys(programGroups);

    // Course Header
    fullHtml += `
      <div class="course-header" style="margin-top: 1.5rem; margin-bottom: 2rem; padding: 1.25rem 0; border-bottom: 2px solid var(--primary-600);">
        <h1 style="font-size: var(--font-size-3xl); font-weight: 800; color: var(--primary-600); margin: 0; text-transform: uppercase; letter-spacing: 0.05em;">
          ${escapeHtml(courseName)}
        </h1>
      </div>
    `;

    programs.forEach(program => {
      const students = programGroups[program];
      
      // Calculate program sub-totals
      const subTotalCost = students.reduce((sum, d) => sum + Number(d.cost || 0), 0);
      const subTotalFees = students.reduce((sum, d) => sum + Number(d.student.totalFees || 0), 0);
      const subTotalPaid = students.reduce((sum, d) => sum + Number(d.totalPaid || 0), 0);
      const subTotalBalance = students.reduce((sum, d) => sum + Number(d.balance || 0), 0);

      let rowsHtml = '';
      let rowNumber = 1;

      students.forEach(data => {
        const { student, totalPaid, balance, cost } = data;
        
        // Determine badge class and text
        const compStatus = student.completionStatus || 'In Progress';
        const badgeClass = compStatus === 'In Progress' ? 'in-progress' : compStatus.toLowerCase();
        let tagHtml = `<span class="status-badge ${badgeClass}">${escapeHtml(compStatus)}</span>`;
        
        rowsHtml += `
          <tr data-student-id="${student.id}" style="cursor: pointer;">
            <td>${rowNumber++}</td>
            <td class="name-col">
              <div class="student-name" style="display: flex; align-items: center;">
                ${escapeHtml(student.name)}
                ${tagHtml}
              </div>
            </td>
            <td>${student.intake ? escapeHtml(formatMonthYear(student.intake)) : '-'}</td>
            <td>${student.completionDate ? escapeHtml(formatMonthYear(student.completionDate)) : '-'}</td>
            <td class="amount-bold">${formatCurrency(cost, currency)}</td>
            <td class="amount-bold">${formatCurrency(student.totalFees || 0, currency)}</td>
            <td class="amount-positive">${formatCurrency(totalPaid, currency)}</td>
            <td class="${balance >= 0.01 ? 'amount-negative' : 'amount-positive'}">
              ${formatCurrency(balance, currency)}
            </td>
          </tr>
        `;
      });

      fullHtml += `
        <div class="program-section">
          <h2 class="program-title">
            <span class="program-indicator" style="width: 0.5rem; height: 1.5rem;"></span>
            ${escapeHtml(program)}
            <span style="font-size: var(--font-size-sm); font-weight: 600; color: var(--text-tertiary); margin-left: auto;">
              ${students.length} Students
            </span>
          </h2>
          <div class="table-card" style="margin-bottom: 2.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-xl); overflow: hidden;">
            <div class="table-scroll">
              <table class="spreadsheet-table">
                <thead>
                  <tr>
                    <th style="width: 50px;">NO.</th>
                    <th class="name-col">STUDENT NAME</th>
                    <th>INTAKE</th>
                    <th>COMPLETION</th>
                    <th>INST. COST</th>
                    <th>TOTAL FEES</th>
                    <th>TOTAL PAID</th>
                    <th>BALANCE</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
                <tfoot style="background: var(--background-secondary); border-top: 2px solid var(--border-color);">
                  <tr>
                    <td colspan="4" style="text-align: right; font-weight: 700; color: var(--text-primary); font-size: 1.125rem; padding: 1.25rem 1rem;">Program Sub-Totals:</td>
                    <td class="amount-bold" style="font-size: var(--font-size-base); padding: 1.25rem 1rem;">${formatCurrency(subTotalCost, currency)}</td>
                    <td class="amount-bold" style="font-size: var(--font-size-base); padding: 1.25rem 1rem;">${formatCurrency(subTotalFees, currency)}</td>
                    <td class="amount-paid" style="font-size: var(--font-size-base); padding: 1.25rem 1rem;">${formatCurrency(subTotalPaid, currency)}</td>
                    <td class="amount-bold ${subTotalBalance > 0 ? 'amount-outstanding' : ''}" style="font-size: var(--font-size-base); padding: 1.25rem 1rem;">${formatCurrency(subTotalBalance, currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      `;
    });
  });

  tableContainer.innerHTML = fullHtml;
}

/**
 * Render summary cards
 */
function renderSummaryCards(totalCollected, totalOutstanding, activeEnrollments, currency) {
  const summaryCardsContainer = document.getElementById('summaryCards');
  
  summaryCardsContainer.innerHTML = `
    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-card-label">Total Fees Collected</div>
        <div class="summary-card-value amount-positive">${formatCurrency(totalCollected, currency)}</div>
      </div>
      
      <div class="summary-card">
        <div class="summary-card-label">Pending Balance</div>
        <div class="summary-card-value amount-negative">${formatCurrency(totalOutstanding, currency)}</div>
      </div>
      
      <div class="summary-card">
        <div class="summary-card-label">Active Enrollments</div>
        <div class="summary-card-value primary">${activeEnrollments}</div>
      </div>
    </div>
  `;
}


/**
 * Get initials from name
 */
function getInitials(name) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

/**
 * Debounce function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Prepare export data from current spreadsheet state
 */
async function prepareExportData() {
  // Get current students based on filters
  let students = currentCourse === 'All Programs' 
    ? await Student.findAll()
    : await Student.findByCourse(currentCourse);
  
  // Apply search filter
  if (searchQuery) {
    students = students.filter(s => 
      s.name.toLowerCase().includes(searchQuery) ||
      s.studentId.toLowerCase().includes(searchQuery) ||
      (s.intake && s.intake.toLowerCase().includes(searchQuery))
    );
  }
  
  // Get currency and context info
  const currency = await db.getSetting('currency') || 'RM';
  const courseName = currentCourse || 'All Programs';
  const totalStudentsCount = students.length;
  
  // Calculate payment data for each student
  const studentData = [];
  for (const student of students) {
    const payments = await Payment.findByStudent(student.id);
    const tuitionPayments = payments.filter(p => p.transactionType !== 'REGISTRATION_FEE' && p.transactionType !== 'COMMISSION_PAYOUT');
    const totalPaid = tuitionPayments.reduce((sum, p) => sum + p.amount, 0);
    const balance = (student.totalFees || 0) - totalPaid;
    
    studentData.push({
      student,
      totalPaid,
      balance,
      cost: student.institutionalCost || 0
    });
  }
  
  // Group by course then program
  const courseGroups = {};
  studentData.forEach(data => {
    const course = data.student.course || 'Unassigned Course';
    const program = data.student.program || 'General Program';
    if (!courseGroups[course]) courseGroups[course] = {};
    if (!courseGroups[course][program]) courseGroups[course][program] = [];
    courseGroups[course][program].push(data);
  });
  
  // Build rows for export
  const rows = [];
  
  Object.keys(courseGroups).forEach(groupCourseName => {
    // Add Course Header
    rows.push({
      type: 'course_header',
      course: groupCourseName
    });

    const programGroups = courseGroups[groupCourseName];
    Object.keys(programGroups).forEach(program => {
      const students = programGroups[program];
      let rowNumber = 1; // Reset for each program block
      
      // Add program header
      rows.push({
        type: 'header',
        program: program
      });
      
      // Add student rows
      students.forEach(data => {
        rows.push({
          type: 'data',
          no: rowNumber++,
          studentName: data.student.name,
          intake: data.student.intake || '',
          completion: data.student.completionDate || '',
          cost: data.cost,
          totalFees: data.student.totalFees || 0,
          totalPaid: data.totalPaid,
          balance: data.balance
        });
      });

      // Add program summary row - ensuring numeric addition
      const subTotalCost = students.reduce((sum, d) => sum + Number(d.cost || 0), 0);
      const subTotalFees = students.reduce((sum, d) => sum + Number(d.student.totalFees || 0), 0);
      const subTotalPaid = students.reduce((sum, d) => sum + Number(d.totalPaid || 0), 0);
      const subTotalBalance = students.reduce((sum, d) => sum + Number(d.balance || 0), 0);

      rows.push({
        type: 'summary',
        program: program,
        subTotalCost,
        subTotalFees,
        subTotalPaid,
        subTotalBalance
      });
    });
  });
  
  // Calculate summary
  const totalCollected = studentData.reduce((sum, d) => sum + d.totalPaid, 0);
  const totalOutstanding = studentData.reduce((sum, d) => sum + d.balance, 0);
  
  return {
    title: `Student Payment Spreadsheet - ${courseName}`,
    course: courseName,
    subtitle: `Generated on ${formatDate(new Date(), 'short')}`,
    currency: currency,
    columns: [
      { key: 'no', label: 'NO', width: 50, align: 'center' },
      { key: 'studentName', label: 'STUDENT NAME', width: 200 },
      { key: 'intake', label: 'INTAKE', width: 100 },
      { key: 'completion', label: 'COMPLETION', width: 100 },
      { key: 'cost', label: 'COST', width: 100, align: 'right' },
      { key: 'totalFees', label: 'TOTAL FEES', width: 120, align: 'right' },
      { key: 'totalPaid', label: 'TOTAL PAID', width: 120, align: 'right' },
      { key: 'balance', label: 'BALANCE', width: 120, align: 'right' }
    ],
    rows: rows,
    summary: {
      totalStudents: totalStudentsCount,
      totalCollected: totalCollected,
      totalOutstanding: totalOutstanding
    }
  };
}

/**
 * Export to CSV
 */
async function exportToCSV() {
  try {
    const data = await prepareExportData();
    const exporter = new SpreadsheetExporter(data);
    await exporter.exportToCSV();
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    alert('Failed to export CSV. Please try again.');
  }
}

/**
 * Export to PDF
 */
async function exportToPDF() {
  try {
    const data = await prepareExportData();
    const exporter = new SpreadsheetExporter(data);
    await exporter.exportToPDF();
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    alert('Failed to export PDF. Please try again.');
  }
}

/**
 * Print spreadsheet
 */
async function printSpreadsheet() {
  try {
    const data = await prepareExportData();
    const exporter = new SpreadsheetExporter(data);
    await exporter.printSpreadsheet();
  } catch (error) {
    console.error('Error printing spreadsheet:', error);
    alert('Failed to print spreadsheet. Please try again.');
  }
}

// Note: escapeHtml removed as it's now imported from formatting.js
