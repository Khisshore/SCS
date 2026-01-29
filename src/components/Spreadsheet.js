/**
 * SPREADSHEET COMPONENT - REDESIGNED
 * Modern, simplified financial reporting interface
 * Based on Stitch design mockup
 */

import { Student } from '../models/Student.js';
import { Payment } from '../models/Payment.js';
import { StudentRemarks } from '../models/StudentRemarks.js';
import { formatCurrency, formatMonthYear } from '../utils/formatting.js';
import { Icons } from '../utils/icons.js';
import { db } from '../db/database.js';
import { showPaymentForm } from './Payments.js';
import { generateReceiptPDF, previewPDF } from '../utils/pdfGenerator.js';

// Available courses (removed 'Other')
const COURSES = ['All Programs', 'Diploma', 'BBA', 'MBA', 'DBA'];

// Current state
let currentCourse = 'Diploma';
let spreadsheetData = [];
let searchQuery = '';
let sortBy = 'name';
let sortOrder = 'asc'; // 'asc' or 'desc'
let currentPage = 1;
const itemsPerPage = 10;

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
              <a href="#" id="exportCsvBtn">
                <span class="icon">${Icons.file}</span>
                CSV Spreadsheet
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
          </div>
          
          <div class="search-box">
            <span class="icon search-icon">${Icons.search}</span>
            <input 
              type="text" 
              id="searchInput" 
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

      <!-- Student Detail Modal -->
      <div id="studentDetailModal" class="student-modal" style="display: none;">
        <div class="modal-backdrop"></div>
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-header-info">
              <div class="modal-student-title">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <h2 id="modalStudentName"></h2>
                  <span class="status-badge" id="modalStudentStatus">ACTIVE</span>
                </div>
                <p class="modal-student-meta" id="modalStudentMeta"></p>
              </div>
            </div>
            <button class="modal-close-btn" id="modalCloseBtn">
              <span class="icon">${Icons.close}</span>
            </button>
          </div>

          <div class="modal-body">
            <div class="modal-info-grid" id="modalInfoGrid"></div>
            
            <div id="modalPaymentBreakdown"></div>
          </div>

          <div class="modal-footer">
            <div class="modal-totals">
              <div>
                <div class="modal-total-label">Total Amount Paid</div>
                <div class="modal-total-value paid" id="modalTotalPaid">RM 0.00</div>
              </div>
              <div class="modal-divider"></div>
              <div>
                <div class="modal-total-label">Remaining Balance</div>
                <div class="modal-total-value balance" id="modalRemainingBalance">RM 0.00</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <style>
      .spreadsheet-page {
        animation: fadeIn 0.4s ease-out;
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
        font-size: 1.875rem;
        font-weight: 700;
        margin: 0 0 0.25rem 0;
        color: var(--text-primary);
      }

      .subtitle {
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin: 0;
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
        gap: 1.5rem;
        align-items: center;
        justify-content: flex-start;
      }

      .course-pills {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }

      .course-pill {
        padding: 0.5rem 1rem;
        border-radius: 9999px;
        border: 1px solid var(--border-color);
        background: var(--surface);
        color: var(--text-secondary);
        font-size: 0.875rem;
        font-weight: 500;
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



      .search-box {
        position: relative;
        flex: 1;
        max-width: 320px;
      }

      .search-icon {
        position: absolute;
        left: 0.75rem;
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-tertiary);
        pointer-events: none;
      }

      .search-box input {
        width: 100%;
        padding: 0.625rem 1rem 0.625rem 2.5rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-xl);
        background: var(--surface);
        color: var(--text-primary);
        font-size: 0.875rem;
        transition: all 0.2s;
      }

      .search-box input:focus {
        outline: none;
        border-color: var(--primary-500);
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
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
        gap: 0.5rem;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--text-primary);
        margin-top: 1rem;
        margin-bottom: 1.5rem;
      }

      .program-indicator {
        width: 0.5rem;
        height: 1.5rem;
        background: var(--primary-600);
        border-radius: 9999px;
      }

      .table-card {
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-2xl);
        overflow: hidden;
        box-shadow: var(--shadow-sm);
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
        min-width: 1200px;
        border-collapse: collapse;
      }

      .spreadsheet-table thead {
        background: var(--background-secondary);
        position: sticky;
        top: 0;
        z-index: 20;
      }

      .spreadsheet-table th {
        padding: 1rem 1.5rem;
        text-align: left;
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 1px solid var(--border-color);
        cursor: pointer;
        user-select: none;
        transition: background 0.15s;
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

      .spreadsheet-table th.sticky-col {
        position: sticky;
        left: 50px;
        background: var(--background-secondary);
        z-index: 25;
        min-width: 280px;
      }

      .spreadsheet-table td.sticky-col {
        position: sticky;
        left: 50px;
        background: var(--surface);
        z-index: 10;
        min-width: 280px;
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
        padding: 1.25rem 1.5rem;
      }

      .institution-name {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 0.875rem;
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
        padding: 1rem 1.5rem;
        font-size: 0.875rem;
        color: var(--text-secondary);
      }


      .spreadsheet-table tr:hover td.sticky-col {
        background: var(--surface-hover);
      }

      .spreadsheet-table tr.institution-header td.sticky-col {
        background: var(--primary-50);
      }

      .spreadsheet-table tr.institution-header:hover td.sticky-col {
        background: var(--primary-100);
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
      }

      .student-avatar-fallback {
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 9999px;
        background: var(--surface-hover);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--text-secondary);
        flex-shrink: 0;
      }

      .student-info {
        min-width: 0;
      }

      .student-name {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0;
        line-height: 1.4;
      }



      .amount-bold {
        font-weight: 700;
        color: var(--text-primary);
      }

      .amount-paid {
        font-weight: 700;
        color: var(--success-600) !important;
      }

      .amount-outstanding {
        font-weight: 700;
        color: var(--danger-600) !important;
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
        grid-template-columns: repeat(4, 1fr);
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
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-2xl);
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
      }

      .summary-card-label {
        font-size: 0.875rem;
        color: var(--text-secondary);
        font-weight: 500;
        margin-bottom: 0.5rem;
        order: 1;
      }

      .summary-card-value {
        font-size: 1.5rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
        order: 2;
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
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 5rem 2rem;
        text-align: center;
        background: var(--surface);
        border: 1px dashed var(--border-color);
        border-radius: var(--radius-2xl);
        margin: 2rem 0;
        animation: fadeIn 0.4s ease-out;
      }

      .empty-state-icon {
        width: 4rem;
        height: 4rem;
        background: rgba(37, 99, 235, 0.1);
        color: var(--primary-600);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 1.5rem;
      }

      .empty-state-icon svg {
        width: 2rem;
        height: 2rem;
      }

      .empty-state h3 {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0 0 0.5rem 0;
      }

      .empty-state p {
        font-size: 0.875rem;
        color: var(--text-tertiary);
        margin: 0 0 1.5rem 0;
        max-width: 320px;
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

      /* Student Detail Modal */
      .student-modal {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        animation: fadeIn 0.2s ease-out;
      }

      .modal-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(15, 23, 42, 0.4);
        backdrop-filter: blur(4px);
        z-index: 1;
      }

      .modal-content {
        position: relative;
        z-index: 10;
        width: 100%;
        max-width: 72rem;
        max-height: 90vh;
        background: var(--surface);
        border-radius: var(--radius-2xl);
        box-shadow: var(--shadow-2xl);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: slideUp 0.3s ease-out;
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 2rem;
        border-bottom: 1px solid var(--border-color);
      }

      .modal-header-info {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .modal-student-title {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.25rem;
      }

      .modal-student-title h2 {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
      }

      .status-badge {
        padding: 0.25rem 0.625rem;
        border-radius: var(--radius-full);
        background: var(--success-100);
        color: var(--success-600);
        font-size: 0.6875rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .modal-student-meta {
        font-size: 0.875rem;
        color: var(--text-secondary);
        font-weight: 500;
        margin: 0;
      }

      .modal-close-btn {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: var(--radius-full);
        background: transparent;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
        cursor: pointer;
        transition: all 0.2s;
      }

      .modal-close-btn:hover {
        background: var(--surface-hover);
        color: var(--text-primary);
      }

      .modal-body {
        flex: 1;
        overflow-y: auto;
        padding: 2rem;
      }

      .modal-info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 2rem;
        margin-bottom: 2.5rem;
      }

      .modal-info-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .modal-info-label {
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }

      .modal-info-value {
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      .modal-info-value.highlight {
        color: var(--primary-600);
        font-weight: 700;
      }

      .modal-section {
        margin-bottom: 2rem;
      }

      .modal-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 2rem;
      }

      .modal-section-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 1.125rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
      }

      .modal-section-title .icon {
        color: var(--text-primary);
        font-size: 1.25rem;
      }

      .btn-add-semester {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        background: var(--primary-50);
        color: var(--primary-600);
        border: 1px solid var(--primary-100);
        border-radius: var(--radius-lg);
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-add-semester:hover {
        background: var(--primary-100);
        transform: translateY(-1px);
      }

      .semester-group {
        margin-bottom: 3rem;
      }

      .semester-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
        padding: 0 0.5rem;
      }

      .semester-title-box {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .semester-title {
        font-size: 1.125rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
      }

      .btn-edit-semester {
        width: 2rem;
        height: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-md);
        color: var(--text-tertiary);
        background: transparent;
        border: none;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-edit-semester:hover {
        background: var(--surface-hover);
        color: var(--primary-600);
      }

      .btn-delete-semester:hover {
        background: var(--danger-50) !important;
        color: var(--danger-600) !important;
        transform: scale(1.1);
      }

      .semester-card {
        background: var(--background-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-2xl);
        padding: 1.5rem;
      }

      .semester-card.pending {
        background: transparent;
        border: 2px dashed var(--border-color);
      }

      .semester-status {
        padding: 0.25rem 0.625rem;
        border-radius: var(--radius-full);
        font-size: 0.6875rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .semester-status.paid {
        background: var(--success-100);
        color: var(--success-600);
      }

      .semester-status.pending {
        background: var(--danger-50);
        color: var(--danger-600);
      }

      .payment-table {
        width: 100%;
        font-size: 0.875rem;
      }

      .payment-table thead {
        border-bottom: 1px solid var(--border-color);
      }

      .payment-table th {
        padding: 0.75rem 0.5rem;
        text-align: left;
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .payment-table td {
        padding: 0.75rem 0.5rem;
        border-bottom: 1px solid var(--border-color);
        color: var(--text-secondary);
      }

      .payment-table tbody tr:last-child td {
        border-bottom: none;
      }

      .payment-table .amount {
        font-weight: 700;
        color: var(--text-primary);
      }

      .payment-table .receipt-link {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.25rem 0.625rem;
        background: var(--primary-50);
        color: var(--primary-600);
        border-radius: var(--radius-lg);
        font-size: 0.75rem;
        font-weight: 600;
        text-decoration: none;
        transition: all 0.2s;
      }

      .payment-table .receipt-link:hover {
        background: var(--primary-600);
        color: white;
      }

      .payment-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.5rem;
      }

      .payment-action-btn {
        padding: 0.375rem;
        background: transparent;
        border: none;
        border-radius: var(--radius-lg);
        color: var(--text-tertiary);
        cursor: pointer;
        transition: all 0.2s;
      }

      .payment-action-btn:hover {
        background: var(--surface);
        color: var(--primary-600);
      }

      .empty-semester {
        text-align: center;
        padding: 2rem;
      }

      .empty-semester p {
        color: var(--text-tertiary);
        font-size: 0.875rem;
        margin-bottom: 0.75rem;
      }

      .empty-semester button {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        background: transparent;
        border: none;
        color: var(--primary-600);
        font-size: 0.875rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
      }

      .empty-semester button:hover {
        text-decoration: underline;
      }

      .inline-payment-form {
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-xl);
        padding: 1.5rem;
        margin-top: 1rem;
        animation: slideDown 0.3s ease-out;
      }

      @keyframes slideDown {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .inline-form-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
        margin-bottom: 1.5rem;
      }

      .inline-form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        text-align: left;
      }

      .inline-form-label {
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .inline-form-input, .inline-form-select {
        padding: 0.625rem 0.875rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        background: var(--background-secondary);
        color: var(--text-primary);
        font-size: 0.875rem;
        transition: all 0.2s;
        width: 100%;
      }

      .inline-form-input:focus, .inline-form-select:focus {
        border-color: var(--primary-500);
        box-shadow: 0 0 0 3px var(--primary-50);
        outline: none;
      }

      .inline-form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid var(--border-color);
      }

      .btn-inline-save {
        padding: 0.625rem 1.25rem;
        background: var(--success-600);
        color: white;
        border: none;
        border-radius: var(--radius-lg);
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .btn-inline-save:hover {
        background: var(--success-500);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
      }

      .btn-inline-cancel {
        padding: 0.625rem 1.25rem;
        background: transparent;
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-inline-cancel:hover {
        background: var(--surface-hover);
        border-color: var(--text-tertiary);
        color: var(--text-primary);
      }

      .modal-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 1.5rem 2rem;
        background: var(--background-secondary);
        border-top: 1px solid var(--border-color);
      }

      .modal-totals {
        display: flex;
        align-items: center;
        gap: 3rem;
      }

      .modal-total-label {
        font-size: 0.625rem;
        font-weight: 700;
        color: var(--text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin-bottom: 0.25rem;
      }

      .modal-total-value {
        font-size: 1.5rem;
        font-weight: 900;
      }

      .modal-total-value.paid {
        color: var(--success-600);
      }

      .modal-total-value.balance {
        color: var(--danger-600);
      }

      .modal-divider {
        width: 1px;
        height: 2.5rem;
        background: var(--border-color);
      }

      .modal-actions {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      @media (max-width: 768px) {
        .modal-content {
          max-width: 100%;
          max-height: 100vh;
          border-radius: 0;
        }

        .modal-info-grid {
          grid-template-columns: 1fr;
          gap: 1.5rem;
        }

        .modal-footer {
          flex-direction: column;
          align-items: stretch;
          gap: 1.5rem;
        }

        .modal-totals {
          flex-direction: column;
          align-items: stretch;
          gap: 1rem;
        }

        .modal-divider {
          width: 100%;
          height: 1px;
        }

        .modal-actions {
          width: 100%;
        }

        .modal-actions button {
          flex: 1;
        }
      }

    </style>
  `;

  // Setup event listeners
  setupEventListeners();

  // Load initial data
  await loadSpreadsheetData();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Course pill clicks
  document.querySelectorAll('.course-pill').forEach(pill => {
    pill.addEventListener('click', async () => {
      currentCourse = pill.dataset.course;
      currentPage = 1;
      
      document.querySelectorAll('.course-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      
      await loadSpreadsheetData();
    });
  });

  // Search input
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(async (e) => {
      searchQuery = e.target.value.toLowerCase();
      currentPage = 1;
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

  // Export CSV
  document.getElementById('exportCsvBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    exportToCSV();
  });

  // Export PDF
  document.getElementById('exportPdfBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    exportToPDF();
  });

  // Print
  document.getElementById('printBtn')?.addEventListener('click', () => {
    window.print();
  });

  // Expose clear filters to window for the empty state button
  window.clearFilters = async () => {
    searchQuery = '';
    currentCourse = 'Diploma'; // Reset to default
    currentPage = 1;
    
    // Update UI elements if they exist
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    document.querySelectorAll('.course-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.course === currentCourse);
    });
    
    await loadSpreadsheetData();
  };

  // Student Detail Modal Event Listeners
  const modal = document.getElementById('studentDetailModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalCloseFooterBtn = document.getElementById('modalCloseFooterBtn');
  const modalBackdrop = modal?.querySelector('.modal-backdrop');

  // Close modal function
  const closeModal = () => {
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  };

  // Close button clicks
  modalCloseBtn?.addEventListener('click', closeModal);
  modalCloseFooterBtn?.addEventListener('click', closeModal);
  modalBackdrop?.addEventListener('click', closeModal);

  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.style.display !== 'none') {
      closeModal();
    }
  });

  // Student row click handler (Event Delegation)
  document.getElementById('tableContainer')?.addEventListener('click', async (e) => {
    const studentRow = e.target.closest('tr:not(.institution-header)');
    if (!studentRow || studentRow.classList.contains('institution-header')) return;

    // Find student data from the row
    const studentNameEl = studentRow.querySelector('.student-name');
    if (!studentNameEl) return;

    const studentName = studentNameEl.textContent.trim();
    
    // Find the student in our data
    const students = await Student.findAll();
    const student = students.find(s => s.name === studentName);
    
    if (student) {
      await openStudentDetailModal(student);
    }
  });

  // Global receipt download trigger
  window.downloadReceipt = async (studentId, paymentId) => {
    try {
      const student = await Student.findById(studentId);
      const payment = await Payment.findById(paymentId);
      const allPayments = await Payment.findByStudent(studentId);
      
      if (!student || !payment) {
        alert('Error: Could not find student or payment data.');
        return;
      }
      
      const doc = await generateReceiptPDF(student, payment, allPayments);
      const filename = `Receipt_${payment.reference || 'PAY'}_${student.name.replace(/\s+/g, '_')}.pdf`;
      doc.save(filename);
    } catch (error) {
      console.error('Error generating receipt:', error);
      alert('Failed to generate receipt. Please try again.');
    }
  };

  // Global receipt preview trigger
  window.previewReceipt = async (studentId, paymentId) => {
    try {
      const student = await Student.findById(studentId);
      const payment = await Payment.findById(paymentId);
      const allPayments = await Payment.findByStudent(studentId);
      
      if (!student || !payment) {
        alert('Error: Could not find student or payment data.');
        return;
      }
      
      const doc = await generateReceiptPDF(student, payment, allPayments);
      const title = `Receipt_${payment.reference || 'PAY'}_${student.name.replace(/\s+/g, '_')}`;
      previewPDF(doc, title);
    } catch (error) {
      console.error('Error previewing receipt:', error);
      alert('Failed to preview receipt. Please try again.');
    }
  };
}

/**
 * Open student detail modal with payment breakdown
 */
async function openStudentDetailModal(student) {
  const modal = document.getElementById('studentDetailModal');
  if (!modal) return;

  // Get currency
  const currency = await db.getSetting('currency') || 'RM';

  // Get student payments
  const payments = await Payment.findByStudent(student.id);
  const { grouped: paymentsBySemester, maxSemester } = await Payment.getStudentPaymentsBySemester(student.id);

  // Calculate totals
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = (student.totalFees || 0) - totalPaid;

  // Populate header
  document.getElementById('modalStudentName').textContent = student.name;
  document.getElementById('modalStudentMeta').textContent = 
    `${student.course || 'Course'} • ${student.program || 'Program'}`;

  // Populate info grid
  const infoGrid = document.getElementById('modalInfoGrid');
  infoGrid.innerHTML = `
    <div class="modal-info-item">
      <div class="modal-info-label">Intake Period</div>
      <div class="modal-info-value">${student.intake ? formatMonthYear(student.intake) : 'Not set'}</div>
    </div>
    <div class="modal-info-item">
      <div class="modal-info-label">Expected Completion</div>
      <div class="modal-info-value">${student.completionDate ? formatMonthYear(student.completionDate) : 'Not set'}</div>
    </div>
    <div class="modal-info-item">
      <div class="modal-info-label">Registration Fees</div>
      <div class="modal-info-value">${formatCurrency(student.registrationFees || 0, currency)}</div>
    </div>
    <div class="modal-info-item">
      <div class="modal-info-label">Commission Fees</div>
      <div class="modal-info-value">${formatCurrency(student.commission || 0, currency)}</div>
    </div>
    <div class="modal-info-item">
      <div class="modal-info-label">Program Cost</div>
      <div class="modal-info-value">${formatCurrency(student.institutionalCost || 0, currency)}</div>
    </div>
    <div class="modal-info-item">
      <div class="modal-info-label">Total Fees</div>
      <div class="modal-info-value highlight">${formatCurrency(student.totalFees || 0, currency)}</div>
    </div>
  `;

  // Render breakdown container with Add Semester button
  const breakdownContainer = document.getElementById('modalPaymentBreakdown');
  breakdownContainer.innerHTML = `
    <div class="modal-section-header">
      <div class="modal-section-title">
        <span class="icon">${Icons.dollarSign}</span>
        Payment Breakdown
      </div>
      <button class="btn-add-semester" id="btnAddSemester">
        <span class="icon" style="font-size: 1rem;">${Icons.plus}</span>
        Add Semester
      </button>
    </div>
    <div id="semesterList"></div>
  `;

  const semesterList = document.getElementById('semesterList');
  let breakdownHTML = '';

  // Determine how many semesters to show
  const semestersToShow = Math.max(student.totalSemesters || 1, maxSemester);

  for (let sem = 1; sem <= semestersToShow; sem++) {
    const semesterData = paymentsBySemester[sem];
    const hasPayments = semesterData && semesterData.payments.length > 0;

    breakdownHTML += `
      <div class="semester-group">
        <div class="semester-header">
          <div class="semester-title-box">
            <h4 class="semester-title">Semester ${sem}</h4>
            <span class="semester-status ${hasPayments ? 'paid' : 'pending'}">
              ${hasPayments ? 'PAID' : 'PENDING'}
            </span>
          </div>
          <button class="btn-edit-semester btn-delete-semester" title="Delete Semester" onclick="window.editSemester(${student.id}, ${sem})">
            <span class="icon" style="font-size: 1rem;">${Icons.trash}</span>
          </button>
        </div>
        <div class="semester-card ${!hasPayments ? 'pending' : ''}">
          ${hasPayments ? `
            <table class="payment-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount Paid</th>
                  <th>Method</th>
                  <th>Receipt</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${semesterData.payments.map(payment => `
                  <tr>
                    <td>${new Date(payment.date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td class="amount">${formatCurrency(payment.amount, currency)}</td>
                    <td>${formatPaymentMethod(payment.method)}</td>
                    <td>
                      ${payment.reference ? `
                        <a href="#" class="receipt-link" onclick="window.previewReceipt(${student.id}, ${payment.id}); return false;">
                          <span class="icon">${Icons.file}</span>
                          ${payment.reference}
                        </a>
                      ` : '-'}
                    </td>
                    <td>
                      <div class="payment-actions">
                        <button class="payment-action-btn" title="Download" onclick="window.downloadReceipt(${student.id}, ${payment.id})">
                          <span class="icon">${Icons.download}</span>
                        </button>
                        <button class="payment-action-btn" title="Edit" onclick="window.editPaymentEntry(${student.id}, ${sem}, ${payment.id})">
                          <span class="icon">${Icons.edit}</span>
                        </button>
                        <button class="payment-action-btn" title="Delete" onclick="window.deletePaymentEntry(${student.id}, ${payment.id})" style="color: var(--danger-color);">
                          <span class="icon">${Icons.trash}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `
            <div class="empty-semester">
              <p>No payments recorded for this semester yet.</p>
              <button onclick="window.addPaymentEntry(${student.id}, ${sem})">
                <span class="icon" style="font-size: 1rem;">${Icons.plus}</span>
                Add Entry
              </button>
            </div>
          `}
        </div>
      </div>
    `;
  }

  semesterList.innerHTML = breakdownHTML;

  // Add Semester button click
  document.getElementById('btnAddSemester').addEventListener('click', () => {
    addSemester(student.id);
  });

  // Populate footer totals
  document.getElementById('modalTotalPaid').textContent = formatCurrency(totalPaid, currency);
  document.getElementById('modalRemainingBalance').textContent = formatCurrency(balance, currency);

  // Show modal
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

/**
 * Add a new semester to a student
 */
async function addSemester(studentId) {
  try {
    const student = await Student.findById(studentId);
    if (!student) return;

    const newTotal = (student.totalSemesters || 1) + 1;
    await Student.update(studentId, { totalSemesters: newTotal });
    
    // Refresh modal
    const updatedStudent = await Student.findById(studentId);
    await openStudentDetailModal(updatedStudent);
  } catch (error) {
    console.error('Error adding semester:', error);
  }
}

/**
 * Global edit semester function
 */
window.editSemester = async function(studentId, semester) {
  try {
    const student = await Student.findById(studentId);
    if (!student) return;

    // Basic implementation: if it's the last semester, allow removal
    if (semester === student.totalSemesters && semester > 1) {
      if (confirm(`Are you sure you want to remove Semester ${semester}? This will not delete recorded payments.`)) {
        await Student.update(studentId, { totalSemesters: student.totalSemesters - 1 });
        const updatedStudent = await Student.findById(studentId);
        await openStudentDetailModal(updatedStudent);
      }
    } else {
      alert(`Editing details for Semester ${semester} - This feature is coming soon in the next update!`);
    }
  } catch (error) {
    console.error('Error editing semester:', error);
  }
};

/**
 * Global add payment entry function - Renders inline form
 */
window.addPaymentEntry = function(studentId, semester) {
  const container = document.querySelector(`.semester-group:nth-child(${semester}) .semester-card`);
  
  // If already open, ignore
  if (container.querySelector('.inline-payment-form')) return;

  const today = new Date().toISOString().split('T')[0];

  const formHTML = `
    <div class="inline-payment-form" id="inlineForm-${semester}">
      <h5 style="margin: 0 0 1rem 0; font-size: 0.875rem; font-weight: 700;">Record Payment - Semester ${semester}</h5>
      
      <div class="inline-form-grid">
        <div class="inline-form-group">
          <label class="inline-form-label">Amount (RM)</label>
          <input type="number" id="inlineAmount-${semester}" class="inline-form-input" placeholder="0.00" step="0.01" required />
        </div>
        <div class="inline-form-group">
          <label class="inline-form-label">Date</label>
          <input type="date" id="inlineDate-${semester}" class="inline-form-input" value="${today}" required />
        </div>
      </div>

      <div class="inline-form-grid">
        <div class="inline-form-group">
          <label class="inline-form-label">Method</label>
          <select id="inlineMethod-${semester}" class="inline-form-select">
            <option value="cash">Cash</option>
            <option value="card">Credit Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="online">Online Payment</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="inline-form-group">
          <label class="inline-form-label">Reference (Optional)</label>
          <input type="text" id="inlineRef-${semester}" class="inline-form-input" placeholder="Ref #" />
        </div>
      </div>

      <div class="inline-form-group">
        <label class="inline-form-label">Description</label>
        <input type="text" id="inlineDesc-${semester}" class="inline-form-input" placeholder="Payment description" />
      </div>

      <div class="inline-form-actions">
        <button class="btn-inline-cancel" onclick="window.cancelInlinePayment(${semester})">Cancel</button>
        <button class="btn-inline-save" onclick="window.saveInlinePayment(${studentId}, ${semester})">
          <span class="icon" style="margin-right: 0.5rem; font-size: 0.875rem;">${Icons.check}</span>
          Save Payment
        </button>
      </div>
    </div>
  `;

  // Update empty state or table
  const emptyState = container.querySelector('.empty-semester');
  if (emptyState) {
    emptyState.style.display = 'none';
  }
  
  container.insertAdjacentHTML('beforeend', formHTML);
};

/**
 * Save inline payment
 */
window.saveInlinePayment = async function(studentId, semester) {
  const amount = document.getElementById(`inlineAmount-${semester}`).value;
  const date = document.getElementById(`inlineDate-${semester}`).value;
  const method = document.getElementById(`inlineMethod-${semester}`).value;
  const reference = document.getElementById(`inlineRef-${semester}`).value;
  const description = document.getElementById(`inlineDesc-${semester}`).value;

  if (!amount || parseFloat(amount) <= 0) {
    alert('Please enter a valid amount.');
    return;
  }

  try {
    const paymentData = {
      studentId: parseInt(studentId),
      amount: parseFloat(amount),
      date: new Date(date).toISOString(),
      method: method,
      semester: parseInt(semester),
      reference: reference.trim(),
      description: description.trim()
    };

    // Use existing Payment model (we need to import it or use a global)
    // In this context, Payment is already imported at the top of the file
    await Payment.create(paymentData);
    
    // Refresh modal
    const student = await Student.findById(studentId);
    await openStudentDetailModal(student);
    
    // Also refresh the main spreadsheet behind it
    await loadSpreadsheetData();
    
    alert('Payment recorded successfully!');
  } catch (error) {
    console.error('Error saving inline payment:', error);
    alert('Failed to save payment. Please try again.');
  }
};

/**
 * Cancel inline payment
 */
window.cancelInlinePayment = function(semester) {
  const form = document.getElementById(`inlineForm-${semester}`);
  if (!form) return;
  
  const container = form.parentElement;
  form.remove();
  
  const emptyState = container.querySelector('.empty-semester');
  if (emptyState) {
    emptyState.style.display = 'block';
  }
};

/**
 * Edit payment entry - Renders inline form with existing data
 */
window.editPaymentEntry = async function(studentId, semester, paymentId) {
  const container = document.querySelector(`.semester-group:nth-child(${semester}) .semester-card`);
  
  // If already open, ignore
  if (container.querySelector('.inline-payment-form')) return;

  const payment = await Payment.findById(paymentId);
  if (!payment) {
    alert('Payment not found.');
    return;
  }

  const paymentDate = new Date(payment.date).toISOString().split('T')[0];

  const formHTML = `
    <div class="inline-payment-form" id="inlineForm-${semester}">
      <h5 style="margin: 0 0 1rem 0; font-size: 0.875rem; font-weight: 700;">Edit Payment - Semester ${semester}</h5>
      
      <div class="inline-form-grid">
        <div class="inline-form-group">
          <label class="inline-form-label">Amount (RM)</label>
          <input type="number" id="inlineAmount-${semester}" class="inline-form-input" value="${payment.amount}" step="0.01" required />
        </div>
        <div class="inline-form-group">
          <label class="inline-form-label">Date</label>
          <input type="date" id="inlineDate-${semester}" class="inline-form-input" value="${paymentDate}" required />
        </div>
      </div>

      <div class="inline-form-grid">
        <div class="inline-form-group">
          <label class="inline-form-label">Method</label>
          <select id="inlineMethod-${semester}" class="inline-form-select">
            <option value="cash" ${payment.method === 'cash' ? 'selected' : ''}>Cash</option>
            <option value="card" ${payment.method === 'card' ? 'selected' : ''}>Credit Card</option>
            <option value="bank_transfer" ${payment.method === 'bank_transfer' ? 'selected' : ''}>Bank Transfer</option>
            <option value="online" ${payment.method === 'online' ? 'selected' : ''}>Online Payment</option>
            <option value="other" ${payment.method === 'other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="inline-form-group">
          <label class="inline-form-label">Reference (Optional)</label>
          <input type="text" id="inlineRef-${semester}" class="inline-form-input" value="${payment.reference || ''}" placeholder="Ref #" />
        </div>
      </div>

      <div class="inline-form-group">
        <label class="inline-form-label">Description</label>
        <input type="text" id="inlineDesc-${semester}" class="inline-form-input" value="${payment.description || ''}" placeholder="Payment description" />
      </div>

      <div class="inline-form-actions">
        <button class="btn-inline-cancel" onclick="window.cancelInlinePayment(${semester})">Cancel</button>
        <button class="btn-inline-save" onclick="window.updateInlinePayment(${studentId}, ${paymentId}, ${semester})">
          <span class="icon" style="margin-right: 0.5rem; font-size: 0.875rem;">${Icons.check}</span>
          Update Payment
        </button>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', formHTML);
};

/**
 * Update inline payment
 */
window.updateInlinePayment = async function(studentId, paymentId, semester) {
  const amountInput = document.getElementById(`inlineAmount-${semester}`);
  const dateInput = document.getElementById(`inlineDate-${semester}`);
  const methodInput = document.getElementById(`inlineMethod-${semester}`);
  const referenceInput = document.getElementById(`inlineRef-${semester}`);
  const descriptionInput = document.getElementById(`inlineDesc-${semester}`);

  if (!amountInput) return;

  const amount = amountInput.value;
  const date = dateInput.value;
  const method = methodInput.value;
  const reference = referenceInput.value;
  const description = descriptionInput.value;

  if (!amount || parseFloat(amount) <= 0) {
    alert('Please enter a valid amount.');
    return;
  }

  try {
    const updates = {
      amount: parseFloat(amount),
      date: new Date(date).toISOString(),
      method: method,
      reference: reference.trim(),
      description: description.trim()
    };

    await Payment.update(paymentId, updates);
    
    // Refresh modal
    const student = await Student.findById(studentId);
    await openStudentDetailModal(student);
    
    // Also refresh the main spreadsheet behind it
    await loadSpreadsheetData();
    
    alert('Payment updated successfully!');
  } catch (error) {
    console.error('Error updating inline payment:', error);
    alert('Failed to update payment. Please try again.');
  }
};

/**
 * Delete payment entry
 */
window.deletePaymentEntry = async function(studentId, paymentId) {
  if (confirm('Are you sure you want to delete this payment record? This action cannot be undone.')) {
    try {
      await Payment.delete(paymentId);
      
      // Refresh modal
      const student = await Student.findById(studentId);
      await openStudentDetailModal(student);
      
      // Also refresh the main spreadsheet behind it
      await loadSpreadsheetData();
      
      alert('Payment record deleted.');
    } catch (error) {
      console.error('Error deleting payment:', error);
      alert('Failed to delete payment. Please try again.');
    }
  }
};

/**
 * Format payment method for display
 */
function formatPaymentMethod(method) {
  const methods = {
    'cash': 'Cash',
    'card': 'Credit Card',
    'bank_transfer': 'Bank Transfer',
    'online': 'Online Payment',
    'other': 'Other'
  };
  return methods[method] || method;
}

/**
 * Load and render spreadsheet data
 */
async function loadSpreadsheetData() {
  const tableContainer = document.getElementById('tableContainer');
  const summaryCardsContainer = document.getElementById('summaryCards');
  
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
      : await Student.findByCourse(currentCourse);
    
    if (students.length === 0) {
      tableContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${Icons.users}</div>
          <h3>No students found</h3>
          <p>There are currently no students enrolled in the <strong>${currentCourse}</strong> program.</p>
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
        tableContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">${Icons.search}</div>
            <h3>No results found</h3>
            <p>We couldn't find any students matching "<strong>${searchQuery}</strong>" in the selected program.</p>
            <button class="empty-state-btn" onclick="window.clearFilters()">
              <span class="icon" style="font-size: 1rem;">✕</span>
              Clear search
            </button>
          </div>
        `;
        summaryCardsContainer.innerHTML = '';
        return;
      }
      students = filteredStudents;
    }

    // Get currency
    const currency = await db.getSetting('currency') || 'RM';

    // Calculate payment data for each student
    const studentData = [];
    for (const student of students) {
      const payments = await Payment.findAll({ studentId: student.id });
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      const balance = (student.totalFees || 0) - totalPaid;
      
      studentData.push({
        student,
        totalPaid,
        balance,
        misc: student.commission || 0,
        cost: student.institutionalCost || 0
      });
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

    // Group by program
    const programGroups = {};
    studentData.forEach(data => {
      const program = data.student.program || 'General Program';
      if (!programGroups[program]) {
        programGroups[program] = [];
      }
      programGroups[program].push(data);
    });

    // Calculate summary statistics
    const totalCollected = studentData.reduce((sum, d) => sum + d.totalPaid, 0);
    const totalOutstanding = studentData.reduce((sum, d) => sum + d.balance, 0);
    const totalFees = studentData.reduce((sum, d) => sum + (d.student.totalFees || 0), 0);
    const collectionProgress = totalFees > 0 ? Math.round((totalCollected / totalFees) * 100) : 0;

    // Render table
    renderTable(programGroups, currency);
    
    // Render summary cards
    renderSummaryCards(totalCollected, totalOutstanding, students.length, collectionProgress, currency);
    
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
function renderTable(programGroups, currency) {
  const tableContainer = document.getElementById('tableContainer');
  
  const programs = Object.keys(programGroups);
  
  if (programs.length === 0) {
    tableContainer.innerHTML = `
      <div class="empty-state">
        <div class="icon-lg">${Icons.search}</div>
        <h3>No results found</h3>
        <p>Try adjusting your search or filters.</p>
      </div>
    `;
    return;
  }

  let tableRows = '';
  let rowNumber = 1;
  
  programs.forEach(program => {
    const students = programGroups[program];
    
    // Standardize branding for all programs using the new institute icon
    const logoHtml = Icons.institute;
    
    // Program header
    tableRows += `
      <tr class="institution-header">
        <td colspan="8">
          <div class="institution-name">
            <div class="program-logo">${logoHtml}</div>
            <span>${program}</span>
          </div>
        </td>
      </tr>
    `;
    
    // Student rows
    students.forEach(data => {
      const { student, totalPaid, balance, misc, cost } = data;
      const initials = getInitials(student.name);
      
      tableRows += `
        <tr>
          <td>${rowNumber++}</td>
          <td class="sticky-col">
            <div class="student-cell">
              <div class="student-info">
                <div class="student-name">${escapeHtml(student.name)}</div>
              </div>
            </div>
          </td>
          <td>${student.intake ? formatMonthYear(student.intake) : '-'}</td>
          <td>${student.completionDate ? formatMonthYear(student.completionDate) : '-'}</td>
          <td class="amount-bold">${formatCurrency(cost, currency)}</td>
          <td class="amount-bold">${formatCurrency(student.totalFees || 0, currency)}</td>
          <td class="amount-paid">
            ${formatCurrency(totalPaid, currency)}
          </td>
          <td class="${balance >= 0.01 ? 'amount-outstanding' : 'amount-paid'}">
            ${formatCurrency(balance, currency)}
          </td>
        </tr>
      `;
    });
  });

  const totalStudents = Object.values(programGroups).reduce((sum, arr) => sum + arr.length, 0);
  const startIndex = (currentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(currentPage * itemsPerPage, totalStudents);
  const totalPages = Math.ceil(totalStudents / itemsPerPage);

  tableContainer.innerHTML = `
    <div class="program-section">
      <h2 class="program-title">
        <span class="program-indicator"></span>
        ${currentCourse}
      </h2>
      <div class="table-card">
        <div class="table-scroll">
          <table class="spreadsheet-table">
            <thead>
              <tr>
                <th class="${sortBy === 'no' ? 'active-sort' : ''}" data-sort="no">
                  No. ${sortBy === 'no' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="sticky-col ${sortBy === 'name' ? 'active-sort' : ''}" data-sort="name">
                  Student Name ${sortBy === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="${sortBy === 'intake' ? 'active-sort' : ''}" data-sort="intake">
                  Intake ${sortBy === 'intake' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="${sortBy === 'completion' ? 'active-sort' : ''}" data-sort="completion">
                  Completion ${sortBy === 'completion' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="${sortBy === 'cost' ? 'active-sort' : ''}" data-sort="cost">
                  Cost ${sortBy === 'cost' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="${sortBy === 'fees' ? 'active-sort' : ''}" data-sort="fees">
                  Total Fees ${sortBy === 'fees' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="${sortBy === 'paid' ? 'active-sort' : ''}" data-sort="paid">
                  Total Paid ${sortBy === 'paid' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th class="${sortBy === 'balance' ? 'active-sort' : ''}" data-sort="balance">
                  Balance ${sortBy === 'balance' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
        <div class="table-footer">
          <div class="pagination-info">
            Showing <strong>${startIndex} to ${endIndex}</strong> of ${totalStudents} students
          </div>
          <div class="pagination-controls">
            <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window.changePage(${currentPage - 1})">
              ◀
            </button>
            ${Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
              const page = i + 1;
              return `
                <button class="page-number ${page === currentPage ? 'active' : ''}" onclick="window.changePage(${page})">
                  ${page}
                </button>
              `;
            }).join('')}
            <button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="window.changePage(${currentPage + 1})">
              ▶
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render summary cards
 */
function renderSummaryCards(totalCollected, totalOutstanding, activeEnrollments, collectionProgress, currency) {
  const summaryCardsContainer = document.getElementById('summaryCards');
  
  summaryCardsContainer.innerHTML = `
    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-card-label">Total Fees Collected</div>
        <div class="summary-card-value success">${formatCurrency(totalCollected, currency)}</div>
        <div class="summary-card-meta success">
          <span>▲</span>
          <span>12% from last month</span>
        </div>
      </div>
      
      <div class="summary-card">
        <div class="summary-card-label">Pending Balance</div>
        <div class="summary-card-value danger">${formatCurrency(totalOutstanding, currency)}</div>
        <div class="summary-card-meta danger">
          <span>⚠</span>
          <span>High balance alert</span>
        </div>
      </div>
      
      <div class="summary-card">
        <div class="summary-card-label">Active Enrollments</div>
        <div class="summary-card-value primary">${activeEnrollments}</div>
        <div class="summary-card-meta primary">
          <span>+</span>
          <span>8 new this intake</span>
        </div>
      </div>
      
      <div class="summary-card">
        <div class="summary-card-label">Collection Progress</div>
        <div class="summary-card-value primary">${collectionProgress}%</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${collectionProgress}%"></div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Change page
 */
window.changePage = async function(page) {
  currentPage = page;
  await loadSpreadsheetData();
};

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
 * Export to CSV
 */
async function exportToCSV() {
  alert('CSV export functionality - to be implemented');
}

/**
 * Export to PDF
 */
async function exportToPDF() {
  alert('PDF export functionality - to be implemented');
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
