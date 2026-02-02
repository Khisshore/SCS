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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateReceiptPDF, previewPDF, generateFeeReceiptPDF } from '../utils/pdfGenerator.js';
import { initStudentDetailModal, openStudentDetailModal } from './StudentDetailModal.js';
import { SpreadsheetExporter } from '../utils/spreadsheetExporter.js';
import { initPdfPreviewModal, openPdfPreviewModal } from './PdfPreviewModal.js';

// Available courses (removed 'Other')
const COURSES = ['All Programs', 'Diploma', 'BBA', 'MBA', 'DBA'];

// Current state
let currentCourse = 'Diploma';
let spreadsheetData = [];
let searchQuery = '';
let filterOutstanding = false;
let sortBy = 'name';
let sortOrder = 'asc'; // 'asc' or 'desc'

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

      <!-- Scaled Content Wrapper -->
      <div class="spreadsheet-data-scaled">
        <!-- Table Container -->
        <div id="tableContainer"></div>

        <!-- Summary Cards -->
        <div id="summaryCards"></div>
      </div>
    </div>

    <style>
      .spreadsheet-page {
        animation: fadeIn 0.4s ease-out;
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
        padding: 1rem;
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
        min-width: 240px;
      }

      .spreadsheet-table td.sticky-col {
        position: sticky;
        left: 50px;
        background: var(--surface);
        z-index: 10;
        min-width: 240px;
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
        padding: 1rem;
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

      /* Student Detail Modal */
      .student-modal {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal);
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
        z-index: var(--z-modal-backdrop);
      }

      .modal-content {
        position: relative;
        z-index: var(--z-modal);
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


      .btn-icon-xs {
        width: 1.5rem;
        height: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-sm);
        color: var(--text-tertiary);
        background: var(--surface);
        border: 1px solid var(--border-color);
        cursor: pointer;
        transition: all 0.2s;
        padding: 0;
      }

      .btn-icon-xs:hover {
        background: var(--primary-50);
        color: var(--primary-600);
        border-color: var(--primary-200);
      }

      .btn-icon-xs svg {
        width: 0.875rem;
        height: 0.875rem;
      }

      .gap-xs {
        gap: 0.25rem;
      }

      .fee-edit-form .form-group label {
        display: block;
        margin-bottom: 0.25rem;
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--text-tertiary);
        text-transform: uppercase;
      }

      .fee-edit-form .form-input {
        width: 100%;
        padding: 0.375rem 0.625rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: var(--background-primary);
        font-size: 0.875rem;
      }

      .inactive-row {
        /* Removed grey background/opacity for completed students */
      }
      
      .inactive-row .student-name {
        /* Keep standard color */
      }
      
      .status-tag {
        font-size: 0.65rem;
        font-weight: 800;
        padding: 0.125rem 0.5rem;
        border-radius: var(--radius-full);
        background: var(--border-color);
        color: var(--text-tertiary);
        margin-left: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-style: normal;
      }
    </style>
  `;

  // Initialize shared modals
  initStudentDetailModal();
  initPdfPreviewModal();

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
  document.getElementById('exportXlsxBtn').addEventListener('click', (e) => {
    e.preventDefault();
    const exporter = new SpreadsheetExporter({
      title: `Student Payment Spreadsheet - ${currentCourse}`,
      subtitle: `Generated: ${new Date().toLocaleString()}`,
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

  // Expose clear filters to window for the empty state button
  window.clearFilters = async () => {
    searchQuery = '';
    currentCourse = 'Diploma'; // Reset to default
    filterOutstanding = false;
    
    // Update UI elements if they exist
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    const balanceFilter = document.getElementById('balanceFilter');
    if (balanceFilter) balanceFilter.classList.remove('active');
    if (searchInput) searchInput.value = '';
    
    document.querySelectorAll('.course-pill:not(.status-filter)').forEach(p => {
      p.classList.toggle('active', p.dataset.course === currentCourse);
    });
    
    await loadSpreadsheetData();
  };

  // Student Detail Modal Close Event
  window.onStudentModalClose = async () => {
    await loadSpreadsheetData();
  };

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
        if (page) page.classList.add('is-empty');
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

    if (page) page.classList.remove('is-empty');

    const currency = await db.getSetting('currency') || 'RM';
    const courseName = currentCourse || 'All Programs';

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

    // Apply "With Balance" filter
    if (filterOutstanding) {
      students = studentData
        .filter(d => d.balance >= 0.01)
        .map(d => d.student);
      
      // Re-map to final data structure
      const filteredResults = [];
      for (const student of students) {
        const d = studentData.find(item => item.student.id === student.id);
        if (d) filteredResults.push(d);
      }
      
      // Re-calculate the studentData array with filtered results
      studentData.length = 0;
      studentData.push(...filteredResults);
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
      <div class="empty-state">
        <div class="empty-state-icon">${Icons.search}</div>
        <h3>No results found</h3>
        <p>Try adjusting your search or filters.</p>
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
      <div class="course-header" style="margin-top: 1rem; margin-bottom: 1.5rem; padding: 1rem 0; border-bottom: 2px solid var(--primary-600);">
        <h1 style="font-size: 2rem; font-weight: 800; color: var(--primary-600); margin: 0; text-transform: uppercase; letter-spacing: 0.05em;">
          ${courseName}
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
        
        rowsHtml += `
          <tr class="${student.status === 'inactive' ? 'inactive-row' : ''}">
            <td>${rowNumber++}</td>
            <td class="sticky-col">
              <div class="student-name">
                ${escapeHtml(student.name)}
                ${student.status === 'inactive' ? '<span class="status-tag">Completed</span>' : ''}
              </div>
            </td>
            <td>${student.intake ? formatMonthYear(student.intake) : '-'}</td>
            <td>${student.completionDate ? formatMonthYear(student.completionDate) : '-'}</td>
            <td class="amount-bold">${formatCurrency(cost, currency)}</td>
            <td class="amount-bold">${formatCurrency(student.totalFees || 0, currency)}</td>
            <td class="amount-paid">${formatCurrency(totalPaid, currency)}</td>
            <td class="${balance >= 0.01 ? 'amount-outstanding' : 'amount-paid'}">
              ${formatCurrency(balance, currency)}
            </td>
          </tr>
        `;
      });

      fullHtml += `
        <div class="program-section">
          <h2 class="program-title">
            <span class="program-indicator"></span>
            ${program}
            <span style="font-size: 0.875rem; font-weight: 500; color: var(--text-tertiary); margin-left: auto; margin-right: 2.5rem;">
              ${students.length} Students
            </span>
          </h2>
          <div class="table-card" style="margin-bottom: 2.5rem;">
            <div class="table-scroll">
              <table class="spreadsheet-table">
                <thead>
                  <tr>
                    <th style="width: 50px;">NO.</th>
                    <th class="sticky-col">STUDENT NAME</th>
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
                    <td colspan="4" style="text-align: right; font-weight: 700; color: var(--text-primary);">Program Sub-Totals:</td>
                    <td class="amount-bold">${formatCurrency(subTotalCost, currency)}</td>
                    <td class="amount-bold">${formatCurrency(subTotalFees, currency)}</td>
                    <td class="amount-paid">${formatCurrency(subTotalPaid, currency)}</td>
                    <td class="amount-bold ${subTotalBalance > 0 ? 'amount-outstanding' : ''}">${formatCurrency(subTotalBalance, currency)}</td>
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
        <div class="summary-card-value success">${formatCurrency(totalCollected, currency)}</div>
      </div>
      
      <div class="summary-card">
        <div class="summary-card-label">Pending Balance</div>
        <div class="summary-card-value danger">${formatCurrency(totalOutstanding, currency)}</div>
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
    const payments = await Payment.findAll({ studentId: student.id });
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
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
    subtitle: `Generated on ${new Date().toLocaleDateString('en-GB')}`,
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

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
