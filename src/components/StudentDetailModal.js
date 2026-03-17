/**
 * STUDENT DETAIL MODAL COMPONENT
 * Shared modern modal for viewing and managing student financial details
 */

import { Student } from '../models/Student.js';
import { Payment } from '../models/Payment.js';
import { db } from '../db/database.js';
import { formatCurrency, formatDate, formatMonthYear, formatPaymentMethod, escapeHtml } from '../utils/formatting.js';
import { Icons } from '../utils/icons.js';
import { generateReceiptPDF, previewPDF, generateFeeReceiptPDF } from '../utils/pdfGenerator.js';
import { renderReceiptInput } from './ReceiptInput.js';
import { initPdfPreviewModal, openPdfPreviewModal } from './PdfPreviewModal.js';
import { fileSystem } from '../services/fileSystem.js';
import { optimisticRemove, showToast } from '../utils/optimistic.js';

/**
 * Initialize the Student Detail Modal
 * Injects the base structure and styles into the document
 */
export function initStudentDetailModal() {
  if (document.getElementById('studentDetailModal')) return;

  const modalContainer = document.createElement('div');
  modalContainer.id = 'studentDetailModal';
  modalContainer.className = 'student-modal';
  modalContainer.style.display = 'none';

  modalContainer.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-student-title">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <h2 id="modalStudentName"></h2>
            <span class="status-badge" id="modalStudentStatus">ACTIVE</span>
          </div>
          <p class="modal-student-meta" id="modalStudentMeta"></p>
        </div>
        <div class="modal-header-actions">
          <button class="btn-header" id="modalEditStudentBtn">
            <span class="icon">${Icons.edit}</span>
            <span>Edit Student</span>
          </button>
          <button class="modal-close-btn" id="modalCloseBtn" title="Close">
            <span class="icon">${Icons.close}</span>
          </button>
        </div>
      </div>

      <div class="modal-body">
        <div class="modal-info-grid" id="modalInfoGrid"></div>
        
        <div id="modalPaymentBreakdown"></div>
      </div>

      <div class="modal-footer">
        <div class="modal-totals">
          <div class="modal-total-item">
            <div class="modal-total-label">Total Amount Paid</div>
            <div class="modal-total-value paid" id="modalTotalPaid">RM 0.00</div>
          </div>
          <div class="modal-total-item">
            <div class="modal-total-label">Remaining Balance</div>
            <div class="modal-total-value balance" id="modalRemainingBalance">RM 0.00</div>
          </div>
        </div>
      </div>
    </div>

    <style>
      /* --- Premium Student Detail Modal Styles (True Theme Support) --- */
      .student-modal {
        position: fixed;
        inset: 0;
        z-index: 2000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        animation: modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes modalFadeIn {
        from { opacity: 0; backdrop-filter: blur(0); }
        to { opacity: 1; backdrop-filter: blur(8px); }
      }

      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.72); /* Much stronger to block background text */
        backdrop-filter: blur(12px);
        z-index: var(--z-modal-backdrop);
      }

      .modal-content {
        position: relative;
        z-index: var(--z-modal);
        width: 100%;
        max-width: 85rem;
        max-height: 92vh;
        background: var(--surface); /* SOLID BACKGROUND instead of glass */
        border: 1px solid var(--border-color); /* Clean border */
        border-radius: 2rem;
        box-shadow: var(--shadow-2xl); /* Removed glass-shadow */
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: modalSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .modal-content::before {
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
        z-index: 1060;
      }

      @keyframes modalSlideUp {
        from { opacity: 0; transform: translateY(30px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1.5rem 2.5rem;
        border-bottom: 1px solid var(--border-color);
        background: var(--surface-hover);
        position: sticky;
        top: 0;
        z-index: 20;
      }

      .modal-student-title h2 {
        font-size: 1.75rem;
        font-weight: 800;
        color: var(--text-primary);
        margin: 0;
        display: flex;
        align-items: center;
        gap: 1rem;
        letter-spacing: -0.02em;
      }

      .btn-header {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        padding: 0.6rem 1.25rem;
        background: linear-gradient(135deg, #475569, #1e293b);
        border: none;
        border-radius: var(--radius-xl);
        font-size: 0.875rem;
        font-weight: 700;
        color: #fff;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 12px rgba(30, 41, 59, 0.25);
      }

      .btn-header:hover {
        transform: translateY(-2px) scale(1.02);
        background: linear-gradient(135deg, #334155, #0f172a);
        box-shadow: 0 8px 20px rgba(30, 41, 59, 0.4);
      }
      
      .btn-header .icon {
        font-size: 1.125rem;
        opacity: 0.95;
      }

      .modal-student-meta {
        font-size: 1rem;
        color: var(--text-secondary);
        font-weight: 600;
        margin-top: 0.25rem;
      }

      .modal-header-actions {
        display: flex;
        align-items: center;
        gap: 1.25rem;
      }

      .modal-close-btn {
        width: 2.75rem;
        height: 2.75rem;
        border-radius: var(--radius-full);
        background: var(--surface-subtle);
        border: 1px solid var(--border-color);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--danger-500); /* Make cross red by default for visibility */
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .modal-close-btn:hover {
        background: var(--danger-600);
        color: #fff; /* Solid red fill on hover */
        border-color: var(--danger-600);
        transform: rotate(90deg) scale(1.1);
        box-shadow: 0 4px 20px rgba(220, 38, 38, 0.3);
      }

      .modal-body {
        flex: 1;
        overflow-y: auto;
        padding: 2.5rem;
        scrollbar-width: thin;
        scrollbar-color: var(--border-color) transparent;
      }

      .modal-info-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 2rem;
        margin-bottom: 3.5rem;
        background: var(--glass-bg); /* Frosted Glass background */
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        padding: 2.25rem;
        border-radius: 1.5rem;
        border: 1px solid var(--glass-border);
        box-shadow: var(--shadow-xl), var(--glass-shadow);
      }

      .modal-info-item {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .modal-info-label {
        font-size: 0.6875rem;
        font-weight: 800;
        color: var(--text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }

      .modal-info-value {
        font-size: 1.125rem;
        font-weight: 700;
        color: var(--text-primary);
      }

      .modal-info-value.highlight {
        color: var(--primary-500);
        font-size: 1.25rem;
        font-weight: 800;
      }

      .modal-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 2rem;
        /* removed the divider border — clean look */
      }

      .modal-section-title {
        display: flex;
        align-items: center;
        gap: 1rem;
        font-size: 1.5rem;
        font-weight: 800;
        color: var(--text-primary);
        letter-spacing: -0.01em;
      }

      /* --- Colorful, visible semester action buttons --- */
      .btn-semester-action {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1.1rem;
        background: var(--primary-600);
        border: none;
        border-radius: var(--radius-lg);
        font-size: 0.8125rem;
        font-weight: 700;
        color: #fff;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
      }

      .btn-semester-action:hover {
        background: var(--primary-700);
        transform: translateY(-1px);
        box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
      }

      .btn-semester-action.danger {
        background: linear-gradient(135deg, #ef4444, #dc2626);
        border: none;
        color: #fff;
        box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2);
      }

      .btn-semester-action.danger:hover {
        background: linear-gradient(135deg, #dc2626, #b91c1c);
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(220, 38, 38, 0.35);
      }

      .btn-semester-action.icon-only {
        width: 2.25rem;
        height: 2.25rem;
        padding: 0;
        justify-content: center;
      }

      .btn-semester-action .icon {
        font-size: 0.875rem;
        display: flex;
        align-items: center;
      }

      .semester-header-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .btn-add-semester {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        padding: 0.625rem 1.375rem;
        /* Distinguish from blue Add Payment: indigo/slate gradient */
        background: linear-gradient(135deg, #4f46e5, #4338ca);
        color: white;
        border: none;
        border-radius: var(--radius-xl);
        font-size: 0.9375rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
      }

      .btn-add-semester:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(79, 70, 229, 0.4);
        background: linear-gradient(135deg, #4338ca, #3730a3);
        color: white;
      }

      .btn-add-semester:active {
        transform: translateY(0);
      }

      /* Payment Table Action Icons */
      .payment-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.75rem;
      }

      .payment-action-btn {
        width: 2.25rem;
        height: 2.25rem;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        color: var(--text-tertiary);
        cursor: pointer;
        transition: all 0.2s;
      }

      .payment-action-btn:hover {
        background: var(--primary-50);
        color: var(--primary-600);
        border-color: var(--primary-200);
        transform: translateY(-1px);
      }

      .payment-action-btn.danger:hover {
        background: var(--danger-600);
        color: #fff;
        border-color: transparent;
        box-shadow: 0 4px 12px rgba(220, 38, 38, 0.25);
      }

      .receipt-link {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem 0.875rem;
        background: var(--primary-50);
        color: var(--primary-700);
        border-radius: var(--radius-lg);
        font-size: 0.8125rem;
        font-weight: 700;
        text-decoration: none;
        border: 1px solid var(--primary-100);
        transition: all 0.2s;
      }

      .receipt-link:hover {
        background: var(--primary-100);
        transform: translateY(-1px);
      }

      .semester-group {
        margin-bottom: 2.5rem;
      }

      .semester-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.875rem;
        padding: 0.5rem 0;
      }

      .semester-title {
        font-size: 1.125rem;
        font-weight: 800;
        color: var(--text-primary);
        margin: 0;
        letter-spacing: -0.01em;
      }

      .semester-card {
        background: var(--glass-bg); /* Frosted Glass background */
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-2xl);
        padding: 2rem;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), var(--glass-shadow);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .semester-card:hover {
          box-shadow: var(--shadow-lg);
      }

      .payment-table {
        width: 100%;
        border-collapse: collapse;
      }

      .payment-table th {
        padding: 0.875rem 1.25rem;
        text-align: left;
        font-size: 0.6875rem;
        font-weight: 800;
        color: var(--text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        background: var(--surface-subtle);
        border-bottom: 1px solid var(--border-color);
      }

      .payment-table td {
        padding: 1.25rem;
        border-bottom: 1px solid var(--border-light); /* Lighter border for rows */
        color: var(--text-secondary);
        font-weight: 500;
        background: var(--surface);
      }
      
      .payment-table tbody tr {
          transition: background 0.15s ease;
      }
      
      .payment-table tbody tr:hover td {
          background: var(--surface-hover);
      }

      .amount {
        font-weight: 800;
        color: var(--text-primary);
        font-size: 1.125rem;
      }

      .modal-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 2.5rem 3rem;
        background: var(--surface-hover); /* Matches header */
        border-top: 1px solid var(--border-color);
      }

      .modal-totals {
        display: flex;
        align-items: center;
        gap: 4rem;
      }

      .modal-total-item {
        text-align: right;
      }

      .modal-total-label {
        font-size: 0.75rem;
        font-weight: 800;
        color: var(--text-tertiary);
        text-transform: uppercase;
        margin-bottom: 0.25rem;
      }

      .modal-total-value {
        font-size: 2rem;
        font-weight: 900;
        letter-spacing: -1px;
      }

      .modal-total-value.paid { color: var(--success-500); }
      .modal-total-value.balance { color: var(--danger-500); }

      /* Empty Semester State */
      .empty-semester {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 4rem 2rem;
        text-align: center;
        gap: 0.75rem;
        width: 100%;
        min-height: 250px;
      }

      .empty-semester-icon {
        width: 52px;
        height: 52px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--primary-50);
        color: var(--primary-500);
        border-radius: 50%;
        margin-bottom: 1rem;
        border: 1px solid var(--primary-100);
      }

      .empty-semester-text {
        font-size: 1rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
      }

      .empty-semester-sub {
        font-size: 0.875rem;
        color: var(--text-tertiary);
        margin: 0.5rem auto 2rem auto;
        max-width: 38ch;
        line-height: 1.6;
      }

      .inner-add-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.65rem 1.4rem;
        background: linear-gradient(135deg, var(--primary-600), var(--primary-700));
        color: #fff;
        border: none;
        border-radius: var(--radius-lg);
        font-size: 0.875rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3);
      }

      .inner-add-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(37, 99, 235, 0.45);
        background: linear-gradient(135deg, var(--primary-700), var(--primary-800));
      }

      .inner-add-btn .icon {
        width: 1rem;
        height: 1rem;
        display: flex;
        align-items: center;
      }

      .btn-icon-xs {
        width: 2rem;
        height: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--surface-subtle);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        padding: 0;
      }

      .btn-icon-xs:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .btn-icon-xs.view:hover {
        background: var(--primary-500);
        color: white;
        border-color: var(--primary-600);
      }

      .btn-icon-xs.download:hover {
        background: var(--success-500);
        color: white;
        border-color: var(--success-600);
      }

      .btn-icon-xs.edit:hover {
        background: var(--warning-500);
        color: white;
        border-color: var(--warning-600);
      }
      
      .btn-icon-xs .icon {
        width: 1.125rem;
        height: 1.125rem;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* --- Premium Inline Payment Form --- */
      .inline-payment-form {
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-top: 3px solid var(--primary-500);
        border-radius: 0 0 1.25rem 1.25rem;
        padding: 2.25rem 2.5rem 2rem;
        box-shadow: 0 8px 32px rgba(0,0,0,0.08);
      }

      /* Form header */
      .inline-form-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 2rem;
        padding-bottom: 1.25rem;
        border-bottom: 1px solid var(--border-light);
      }

      .inline-form-title {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        margin: 0;
        font-size: 1rem;
        font-weight: 800;
        color: var(--text-primary);
        letter-spacing: -0.01em;
      }

      .inline-form-title-accent {
        color: var(--primary-600);
      }

      .inline-form-badge {
        display: inline-flex;
        align-items: center;
        padding: 0.25rem 0.75rem;
        border-radius: var(--radius-full);
        font-size: 0.65rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .inline-form-badge.new {
        background: var(--primary-50);
        color: var(--primary-700);
        border: 1px solid var(--primary-200);
      }

      .inline-form-badge.editing {
        background: var(--warning-50);
        color: var(--warning-700);
        border: 1px solid var(--warning-200);
      }

      /* Grid layouts */
      .inline-form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.25rem;
        margin-bottom: 1.25rem;
      }

      .inline-form-row.three-col {
        grid-template-columns: 1fr 1fr 1fr;
      }

      .inline-form-row.full {
        grid-template-columns: 1fr;
      }

      .inline-form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      /* Labels with required star */
      .inline-form-label {
        font-size: 0.75rem;
        font-weight: 800;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.07em;
      }

      .inline-form-label .req {
        color: #ef4444;
        margin-left: 2px;
        font-size: 0.8rem;
      }

      .inline-form-label .opt {
        color: var(--text-tertiary);
        font-weight: 500;
        font-size: 0.7rem;
        margin-left: 4px;
        text-transform: none;
        letter-spacing: 0;
      }

      /* Inputs */
      .inline-form-input, .inline-form-select {
        padding: 0.875rem 1rem;
        border: 1.5px solid var(--border-color);
        border-radius: var(--radius-lg);
        background: var(--surface-subtle);
        color: var(--text-primary);
        font-size: 0.9375rem;
        font-weight: 600;
        width: 100%;
        transition: all 0.2s;
        outline: none;
      }

      .inline-form-input::placeholder {
        color: var(--text-tertiary);
        font-weight: 400;
      }

      .inline-form-input:focus, .inline-form-select:focus {
        border-color: var(--primary-500);
        background: var(--surface);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
        outline: none;
      }

      .inline-form-select {
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 1rem center;
        padding-right: 2.5rem;
        cursor: pointer;
      }

      /* Action buttons */
      .inline-form-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.875rem;
        margin-top: 1.75rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--border-light);
      }

      .btn-inline-cancel {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.75rem 1.4rem;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        border: none;
        border-radius: var(--radius-lg);
        font-size: 0.875rem;
        font-weight: 700;
        color: #fff;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        letter-spacing: 0.01em;
        box-shadow: 0 4px 14px rgba(220, 38, 38, 0.25);
      }

      .btn-inline-cancel:hover {
        transform: translateY(-2px);
        background: linear-gradient(135deg, #dc2626, #b91c1c);
        box-shadow: 0 8px 20px rgba(220, 38, 38, 0.4);
      }

      .btn-inline-save {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1.75rem;
        background: linear-gradient(135deg, #16a34a, #15803d);
        border: none;
        border-radius: var(--radius-lg);
        font-size: 0.9375rem;
        font-weight: 800;
        color: #fff;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        letter-spacing: 0.01em;
        box-shadow: 0 4px 14px rgba(22, 163, 74, 0.3);
      }

      .btn-inline-save:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 22px rgba(22, 163, 74, 0.45);
        background: linear-gradient(135deg, #15803d, #166534);
      }

      .btn-inline-save:active {
        transform: translateY(0);
      }

      /* Removal of spin buttons for number input */
      input[type=number]::-webkit-inner-spin-button, 
      input[type=number]::-webkit-outer-spin-button { 
          -webkit-appearance: none; 
          margin: 0; 
      }
      input[type=number] { -moz-appearance: textfield; }

      .status-badge {
        display: inline-flex;
        align-items: center;
        padding: 0.35rem 0.85rem;
        border-radius: var(--radius-full);
        background: var(--success-100);
        color: var(--success-700);
        font-size: 0.725rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border: 1px solid var(--success-200);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      }

      .status-badge.paid {
        background: var(--success-100);
        color: var(--success-700);
        border-color: var(--success-200);
      }

      .status-badge.pending {
        background: var(--warning-100);
        color: var(--warning-700);
        border-color: var(--warning-200);
      }

      .status-badge.inactive {
        background: var(--border-light);
        color: var(--text-tertiary);
        border-color: var(--border-color);
      }
    </style>
  `;

  document.body.appendChild(modalContainer);

  // Setup Event Listeners
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalCloseFooterBtn = document.getElementById('modalCloseFooterBtn');
  const modalBackdrop = modalContainer.querySelector('.modal-backdrop');

  const closeModal = () => {
    modalContainer.style.display = 'none';
    document.body.style.overflow = '';
    if (window.onStudentModalClose) {
        window.onStudentModalClose();
    }
  };

  modalCloseBtn?.addEventListener('click', closeModal);
  modalBackdrop?.addEventListener('click', closeModal);

  // Edit Student button
  document.getElementById('modalEditStudentBtn')?.addEventListener('click', async () => {
    // We need to know which student is currently open
    const name = document.getElementById('modalStudentName').textContent;
    const students = await Student.findAll();
    const student = students.find(s => s.name === name);
    if (student && window.editStudent) {
      closeModal();
      window.editStudent(student.id);
    }
  });

  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalContainer.style.display !== 'none') {
      closeModal();
    }
  });

  // Attach methods to window for global access (keeping compatibility)
  window.openStudentDetailModal = openStudentDetailModal;
  window.closeStudentModal = closeModal;
  window.addSemester = addSemester;
  window.editSemester = editSemester;
  window.addPaymentEntry = addPaymentEntry;
  window.saveInlinePayment = saveInlinePayment;
  window.cancelInlinePayment = cancelInlinePayment;
  window.editPaymentEntry = editPaymentEntry;
  window.updateInlinePayment = updateInlinePayment;
  window.deletePaymentEntry = deletePaymentEntry;
  window.downloadReceipt = downloadReceipt;
  window.previewReceipt = previewReceipt;
  window.generateFeeReceipt = generateFeeReceipt;
  window.previewFeeReceipt = previewFeeReceipt;
  window.editFeeDetail = editFeeDetail;
  window.saveFeeUpdate = saveFeeUpdate;
  window.openStudentDetailModalById = openStudentDetailModalById;
  window.formatPaymentMethod = formatPaymentMethod;
}

/**
 * Open student detail modal
 */
export async function openStudentDetailModal(studentIdOrObject) {
  let student;
  if (typeof studentIdOrObject === 'object') {
    student = studentIdOrObject;
  } else {
    student = await Student.findById(studentIdOrObject);
  }

  if (!student) return;

  const modal = document.getElementById('studentDetailModal');
  if (!modal) {
    initStudentDetailModal();
    initPdfPreviewModal();
    return openStudentDetailModal(student);
  }

  // Get currency
  const currency = await db.getSetting('currency') || 'RM';

  // Get student payments
  const payments = await Payment.findByStudent(student.id);
  const { grouped: paymentsBySemester, maxSemester } = await Payment.getStudentPaymentsBySemester(student.id);

  // Calculate totals
  // Calculate totals (excluding registration/commission which are handled separately)
  const tuitionPayments = payments.filter(p => p.transactionType !== 'REGISTRATION_FEE' && p.transactionType !== 'COMMISSION_PAYOUT');
  const totalPaid = tuitionPayments.reduce((sum, p) => sum + p.amount, 0);
  const balance = (student.totalFees || 0) - totalPaid;

  // Populate header
  document.getElementById('modalStudentName').textContent = student.name;
  document.getElementById('modalStudentMeta').textContent = 
    `${escapeHtml(student.course || 'Course')} • ${escapeHtml(student.program || 'Program')}`;
  
  const statusBadge = document.getElementById('modalStudentStatus');
  if (statusBadge) {
      statusBadge.textContent = (student.status || 'ACTIVE').toUpperCase();
      statusBadge.className = `status-badge ${student.status === 'inactive' ? 'inactive' : 'active'}`;
  }

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
    <div class="modal-info-item" id="regFeeItem">
      <div class="modal-info-label">Registration Fees</div>
      <div class="modal-info-value">
        ${formatCurrency(student.registrationFee || 0, currency)}
        <div style="font-size: 0.75rem; color: var(--text-tertiary); font-weight: 500; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 0.5rem; background: var(--surface-subtle); padding: 0.5rem 0.75rem; border-radius: var(--radius-lg); border: 1px solid var(--border-light);">
          <div class="flex items-center gap-sm">
            ${student.registrationFeeReceipt ? `Receipt #: <strong>${student.registrationFeeReceipt}</strong>` : 'No receipt'}
            ${student.registrationFeeMethod ? `&bull; <span>${formatPaymentMethod(student.registrationFeeMethod)}</span>` : ''}
          </div>
          <div class="flex gap-xs" style="align-items: center; gap: 0.5rem;">
            ${student.registrationFeeReceipt ? `
              <button class="btn-icon-xs view" title="Preview Receipt" onclick="window.previewFeeReceipt('${student.id}', 'Registration Fee', ${student.registrationFee || 0}, '${student.registrationFeeReceipt}')">
                <span class="icon">${Icons.eye}</span>
              </button>
              <button class="btn-icon-xs download" title="Download Receipt" onclick="window.generateFeeReceipt('${student.id}', 'Registration Fee', ${student.registrationFee || 0}, '${student.registrationFeeReceipt}')">
                <span class="icon">${Icons.download}</span>
              </button>
            ` : ''}
            <button class="btn-icon-xs edit" title="Edit Fee" onclick="window.editFeeDetail('${student.id}', 'registration')">
              <span class="icon">${Icons.edit}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-info-item" id="commFeeItem">
      <div class="modal-info-label">Commission Fees</div>
      <div class="modal-info-value">
        ${formatCurrency(student.commission || 0, currency)}
        ${student.commissionPaidTo ? `<div style="font-size: 0.725rem; color: var(--text-secondary); margin-top: 6px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.02em; display: flex; align-items: center; gap: 4px;"><span style="color: var(--text-tertiary); font-weight: 500;">PAID TO:</span> ${student.commissionPaidTo}</div>` : ''}
        <div style="font-size: 0.75rem; color: var(--text-tertiary); font-weight: 500; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-top: 0.5rem; background: var(--surface-subtle); padding: 0.5rem 0.75rem; border-radius: var(--radius-lg); border: 1px solid var(--border-light);">
          <div class="flex items-center gap-sm">
            ${student.commissionReceipt ? `Receipt #: <strong>${student.commissionReceipt}</strong>` : 'No receipt'}
            ${student.commissionMethod ? `&bull; <span>${formatPaymentMethod(student.commissionMethod)}</span>` : ''}
          </div>
          <div class="flex gap-xs" style="align-items: center; gap: 0.5rem;">
            ${student.commissionReceipt ? `
              <button class="btn-icon-xs view" title="Preview Receipt" onclick="window.previewFeeReceipt('${student.id}', 'Commission Fee', ${student.commission || 0}, '${student.commissionReceipt}', '${student.commissionPaidTo || ''}')">
                <span class="icon">${Icons.eye}</span>
              </button>
              <button class="btn-icon-xs download" title="Download Receipt" onclick="window.generateFeeReceipt('${student.id}', 'Commission Fee', ${student.commission || 0}, '${student.commissionReceipt}', '${student.commissionPaidTo || ''}')">
                <span class="icon">${Icons.download}</span>
              </button>
            ` : ''}
            <button class="btn-icon-xs edit" title="Edit Fee" onclick="window.editFeeDetail('${student.id}', 'commission')">
              <span class="icon">${Icons.edit}</span>
            </button>
          </div>
        </div>
      </div>
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
          </div>
          <div class="semester-header-actions">
            <button class="btn-semester-action" onclick="window.addPaymentEntry('${student.id}', ${sem})">
              <span class="icon">${Icons.plus}</span>
              Add Payment
            </button>
            <button class="btn-semester-action danger icon-only" title="Delete Semester" onclick="window.editSemester('${student.id}', ${sem})">
              <span class="icon">${Icons.trash}</span>
            </button>
          </div>
        </div>
        <div class="semester-card ${!hasPayments ? 'pending' : ''}">
          ${hasPayments ? `
            <table class="payment-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount Paid</th>
                  <th>Method</th>
                  <th>Receipt</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${semesterData.payments.map(payment => `
                  <tr>
                    <td>${formatDate(payment.date, 'short')}</td>
                    <td style="font-weight: 600;">${payment.description || '-'}</td>
                    <td class="amount">${formatCurrency(payment.amount, currency)}</td>
                    <td>${formatPaymentMethod(payment.method)}</td>
                    <td>
                      ${payment.reference ? `
                        <a href="#" class="receipt-link" onclick="window.previewReceipt('${student.id}', '${payment.id}'); return false;">
                          <span class="icon">${Icons.file}</span>
                          ${payment.reference}
                        </a>
                      ` : '-'}
                    </td>
                    <td>
                      <div class="payment-actions">
                        <button class="payment-action-btn" title="Download" onclick="window.downloadReceipt('${student.id}', '${payment.id}')">
                          <span class="icon" style="width: 1rem; height: 1rem;">${Icons.download}</span>
                        </button>
                        <button class="payment-action-btn" title="Edit" onclick="window.editPaymentEntry('${student.id}', ${sem}, '${payment.id}')">
                          <span class="icon" style="width: 1rem; height: 1rem;">${Icons.edit}</span>
                        </button>
                        <button class="payment-action-btn danger" title="Delete" onclick="window.deletePaymentEntry('${student.id}', '${payment.id}')">
                          <span class="icon" style="width: 1rem; height: 1rem;">${Icons.trash}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `
            <div class="empty-semester">
              <div class="empty-semester-icon">${Icons.dollarSign}</div>
              <p class="empty-semester-text">No payments recorded yet</p>
              <p class="empty-semester-sub">Add the first payment entry for this semester to start tracking.</p>
              <button class="inner-add-btn" onclick="window.addPaymentEntry('${student.id}', ${sem})">
                <span class="icon">${Icons.plus}</span>
                Record First Payment
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
async function editSemester(studentId, semester) {
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
}

/**
 * Global add payment entry function - Renders inline form
 */
function addPaymentEntry(studentId, semester) {
  const semesterGroups = document.querySelectorAll('.semester-group');
  const container = semesterGroups[semester - 1]?.querySelector('.semester-card');
  if (!container) return;
  
  // If already open, ignore
  if (container.querySelector('.inline-payment-form')) return;

  const today = new Date().toISOString().split('T')[0];

  const formHTML = `
    <div class="inline-payment-form" id="inlineForm-${semester}">
      <div class="inline-form-header">
        <h5 class="inline-form-title">
          <span class="inline-form-title-accent">Record Payment</span>
          &mdash; Semester ${semester}
        </h5>
        <span class="inline-form-badge new">New Entry</span>
      </div>

      <!-- Row 1: Amount + Date -->
      <div class="inline-form-row">
        <div class="inline-form-group">
          <label class="inline-form-label">Amount (RM) <span class="req">*</span></label>
          <input type="number" id="inlineAmount-${semester}" class="inline-form-input" placeholder="0.00" step="0.01" min="0" required />
        </div>
        <div class="inline-form-group">
          <label class="inline-form-label">Payment Date <span class="req">*</span></label>
          <input type="date" id="inlineDate-${semester}" class="inline-form-input" value="${today}" required />
        </div>
      </div>

      <!-- Row 2: Method + Reference -->
      <div class="inline-form-row">
        <div class="inline-form-group">
          <label class="inline-form-label">Payment Method <span class="req">*</span></label>
          <select id="inlineMethod-${semester}" class="inline-form-select">
            <option value="cash">Cash</option>
            <option value="online_banking">Online Banking</option>
            <option value="bank_in">Bank-In</option>
            <option value="card">Credit Card</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="inline-form-group">
          <label class="inline-form-label">Reference / Receipt # <span class="opt">(optional)</span></label>
          <div id="inlineRefContainer-${semester}"></div>
        </div>
      </div>

      <!-- Row 3: Description (full width) -->
      <div class="inline-form-row full">
        <div class="inline-form-group">
          <label class="inline-form-label">Description <span class="opt">(optional — what is this payment for?)</span></label>
          <input type="text" id="inlineDesc-${semester}" class="inline-form-input" placeholder="e.g. Tuition Fee Part 1, Exam Fee, Materials..." spellcheck="true" autocorrect="on" />
        </div>
      </div>

      <div class="inline-form-actions">
        <button class="btn-inline-cancel" onclick="window.cancelInlinePayment(${semester})">
          ✕ Discard
        </button>
        <button class="btn-inline-save" onclick="window.saveInlinePayment('${studentId}', ${semester})">
          <span class="icon" style="width:1rem;height:1rem;display:inline-flex;align-items:center;">${Icons.check}</span>
          Save Payment Record
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

  // Initialize Smart Receipt Input
  renderReceiptInput(`inlineRefContainer-${semester}`, {
    id: `inlineRef-${semester}`,
    placeholder: 'Ref #',
    context: 'PAY'
  });
}

/**
 * Save inline payment
 */
async function saveInlinePayment(studentId, semester) {
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

    const newPayment = await Payment.create(paymentData);
    
    // Auto-generate receipt PDF if reference exists
    if (reference.trim()) {
      try {
        const student = await Student.findById(studentId);
        const allPayments = await Payment.findByStudent(studentId);
        await generateReceiptPDF(student, newPayment, allPayments);
      } catch (err) {
        console.error('Auto-receipt generation failed:', err);
      }
    }

    // Refresh modal
    const student = await Student.findById(studentId);
    await openStudentDetailModal(student);
    
    alert('Payment recorded successfully!');
  } catch (error) {
    console.error('Error saving inline payment:', error);
    alert('Failed to save payment. Please try again.');
  }
}

/**
 * Cancel inline payment
 */
function cancelInlinePayment(semester) {
  const form = document.getElementById(`inlineForm-${semester}`);
  if (!form) return;
  
  const container = form.parentElement;
  form.remove();
  
  const emptyState = container.querySelector('.empty-semester');
  if (emptyState) {
    emptyState.style.display = 'block';
  }
}

/**
 * Edit payment entry - Renders inline form with existing data
 */
async function editPaymentEntry(studentId, semester, paymentId) {
  const semesterGroups = document.querySelectorAll('.semester-group');
  const container = semesterGroups[semester - 1]?.querySelector('.semester-card');
  if (!container) return;
  
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
      <div class="inline-form-header">
        <h5 class="inline-form-title">
          <span class="inline-form-title-accent">Update Payment</span>
          &mdash; Semester ${semester}
        </h5>
        <span class="inline-form-badge editing">Editing</span>
      </div>

      <!-- Row 1: Amount + Date -->
      <div class="inline-form-row">
        <div class="inline-form-group">
          <label class="inline-form-label">Amount (RM) <span class="req">*</span></label>
          <input type="number" id="inlineAmount-${semester}" class="inline-form-input" value="${payment.amount}" step="0.01" min="0" required />
        </div>
        <div class="inline-form-group">
          <label class="inline-form-label">Payment Date <span class="req">*</span></label>
          <input type="date" id="inlineDate-${semester}" class="inline-form-input" value="${paymentDate}" required />
        </div>
      </div>

      <!-- Row 2: Method + Reference -->
      <div class="inline-form-row">
        <div class="inline-form-group">
          <label class="inline-form-label">Payment Method <span class="req">*</span></label>
          <select id="inlineMethod-${semester}" class="inline-form-select">
            <option value="cash" ${payment.method === 'cash' ? 'selected' : ''}>Cash</option>
            <option value="online_banking" ${payment.method === 'online_banking' ? 'selected' : ''}>Online Banking</option>
            <option value="bank_in" ${payment.method === 'bank_in' ? 'selected' : ''}>Bank-In</option>
            <option value="card" ${payment.method === 'card' ? 'selected' : ''}>Credit Card</option>
            <option value="other" ${payment.method === 'other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="inline-form-group">
          <label class="inline-form-label">Reference / Receipt # <span class="opt">(optional)</span></label>
          <div id="inlineRefContainer-${semester}"></div>
        </div>
      </div>

      <!-- Row 3: Description (full width) -->
      <div class="inline-form-row full">
        <div class="inline-form-group">
          <label class="inline-form-label">Description <span class="opt">(optional — what is this payment for?)</span></label>
          <input type="text" id="inlineDesc-${semester}" class="inline-form-input" value="${payment.description || ''}" spellcheck="true" autocorrect="on" />
        </div>
      </div>

      <div class="inline-form-actions">
        <button class="btn-inline-cancel" onclick="window.cancelInlinePayment(${semester})">
          ✕ Cancel
        </button>
        <button class="btn-inline-save" onclick="window.updateInlinePayment('${studentId}', '${paymentId}', ${semester})">
          <span class="icon" style="width:1rem;height:1rem;display:inline-flex;align-items:center;">${Icons.check}</span>
          Update Entry
        </button>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', formHTML);

  // Initialize Smart Receipt Input
  renderReceiptInput(`inlineRefContainer-${semester}`, {
    id: `inlineRef-${semester}`,
    placeholder: 'Ref #',
    value: payment.reference || '',
    context: 'PAY'
  });
}

/**
 * Update inline payment
 */
async function updateInlinePayment(studentId, paymentId, semester) {
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
    const oldPayment = await Payment.findById(paymentId);
    const student = await Student.findById(studentId);

    const updates = {
      amount: parseFloat(amount),
      date: new Date(date).toISOString(),
      method: method,
      reference: reference.trim(),
      description: description.trim()
    };

    await Payment.update(paymentId, updates);
    
    // Manage local files
    if (fileSystem.isDesktopApp()) {
      // If reference changed and old one existed, delete old PDF
      if (oldPayment.reference && oldPayment.reference !== updates.reference) {
         try {
           const oldFilename = `Receipt_${oldPayment.reference}_${student.name.replace(/\s+/g, '_')}`;
           const semesterLabel = oldPayment.semester ? `Semester ${oldPayment.semester}` : 'General';
           await fileSystem.deletePDF(student.course, student.program, student.name, semesterLabel, oldFilename);
         } catch (err) {
           console.warn('Could not delete old PDF:', err);
         }
      }

      // Generate new PDF (always if updated, to keep data sync)
      if (updates.reference) {
        try {
          const updatedPayment = await Payment.findById(paymentId);
          const allPayments = await Payment.findByStudent(studentId);
          await generateReceiptPDF(student, updatedPayment, allPayments);
        } catch (err) {
          console.error('New receipt generation failed:', err);
        }
      }
    }

    // Refresh modal
    await openStudentDetailModal(student);
    
    alert('Payment updated successfully!');
  } catch (error) {
    console.error('Error updating inline payment:', error);
    alert('Failed to update payment. Please try again.');
  }
}

/**
 * Delete payment entry — Optimistic UI
 */
async function deletePaymentEntry(studentId, paymentId) {
  if (!confirm('Are you sure you want to delete this payment record? This action cannot be undone.')) return;

  // Find the payment row in the DOM for optimistic removal
  const btn = document.querySelector(`button[onclick="window.deletePaymentEntry('${studentId}', '${paymentId}')"]`);
  const row = btn?.closest('.payment-row') || btn?.closest('tr');

  const doDelete = async () => {
    const payment = await Payment.findById(paymentId);
    const student = await Student.findById(studentId);

    // Delete local PDF if exists
    if (payment && payment.reference && fileSystem.isDesktopApp()) {
      try {
        const baseFilename = `Receipt_${payment.reference}_${student.name.replace(/\s+/g, '_')}`;
        const semesterLabel = payment.semester ? `Semester ${payment.semester}` : null;
        await fileSystem.deletePDF(student.course, student.program, student.name, semesterLabel, baseFilename);
      } catch (err) {
        console.warn('Failed to delete associated PDF:', err);
      }
    }

    await Payment.delete(paymentId);
  };

  if (row) {
    await optimisticRemove(row, doDelete, {
      successMsg: 'Payment deleted!',
      errorMsg: 'Delete failed. Reverted.'
    });
  } else {
    // Fallback: full modal refresh
    try {
      await doDelete();
      const student = await Student.findById(studentId);
      await openStudentDetailModal(student);
    } catch (error) {
      console.error('Error deleting payment:', error);
      showToast('Failed to delete payment.', 'error');
    }
  }
}

/**
 * Global receipt download trigger
 */
async function downloadReceipt(studentId, paymentId) {
  try {
    const student = await Student.findById(studentId);
    const payment = await Payment.findById(paymentId);
    const allPayments = await Payment.findByStudent(studentId);
    
    if (!student || !payment) {
      alert('Error: Could not find student or payment data.');
      return;
    }
    
    const { doc, saveResult } = await generateReceiptPDF(student, payment, allPayments);
    const filename = `Receipt_${payment.reference || 'PAY'}_${student.name.replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
  } catch (error) {
    console.error('Error generating receipt:', error);
    alert('Failed to generate receipt. Please try again.');
  }
}

/**
 * Global receipt preview trigger
 */
async function previewReceipt(studentId, paymentId) {
  try {
    const student = await Student.findById(studentId);
    const payment = await Payment.findById(paymentId);
    const allPayments = await Payment.findByStudent(studentId);
    
    if (!student || !payment) {
      alert('Error: Could not find student or payment data.');
      return;
    }
    
    const { doc, saveResult } = await generateReceiptPDF(student, payment, allPayments);
    
    if (saveResult?.success && window.electronAPI) {
      await window.electronAPI.openFile(saveResult.path);
    } else {
      // Fallback to modal only if file saving failed or not in Electron
      const filename = `Receipt_${payment.reference || 'PAY'}_${student.name.replace(/\s+/g, '_')}`;
      openPdfPreviewModal(doc, filename, saveResult);
    }
  } catch (error) {
    console.error('Error previewing receipt:', error);
    alert('Failed to preview receipt. Please try again.');
  }
}

/**
 * Global fee receipt generator
 */
async function generateFeeReceipt(studentId, feeType, amount, receiptNo, paidTo = null) {
  try {
    const student = await Student.findById(studentId);
    if (!student) return;
    
    const { doc, saveResult } = await generateFeeReceiptPDF(student, feeType, amount, receiptNo, paidTo);
    const filename = `${feeType.replace(/\s+/g, '_')}_Receipt_${student.name.replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
  } catch (error) {
    console.error('Error generating fee receipt:', error);
    alert('Failed to generate receipt.');
  }
}

/**
 * Global fee receipt preview
 */
async function previewFeeReceipt(studentId, feeType, amount, receiptNo, paidTo = null) {
  try {
    const student = await Student.findById(studentId);
    if (!student) return;
    
    const { doc, saveResult } = await generateFeeReceiptPDF(student, feeType, amount, receiptNo, paidTo);
    
    if (saveResult?.success && window.electronAPI) {
      await window.electronAPI.openFile(saveResult.path);
    } else {
      const filename = `${feeType} Receipt - ${student.name}`;
      openPdfPreviewModal(doc, filename, saveResult);
    }
  } catch (error) {
    console.error('Error previewing fee receipt:', error);
    alert('Failed to preview receipt.');
  }
}

/**
 * Global edit fee detail function
 */
async function editFeeDetail(studentId, type) {
  const student = await Student.findById(studentId);
  if (!student) return;

  const itemEl = document.getElementById(type === 'registration' ? 'regFeeItem' : 'commFeeItem');
  if (!itemEl) return;

  const isReg = type === 'registration';
  const amount = isReg ? student.registrationFee : student.commission;
  const receipt = isReg ? student.registrationFeeReceipt : student.commissionReceipt;
  const paidTo = isReg ? null : student.commissionPaidTo;
  const method = isReg ? student.registrationFeeMethod : student.commissionMethod;

  itemEl.innerHTML = `
    <div class="modal-info-label">${isReg ? 'Registration Fees' : 'Commission Fees'}</div>
    <div class="fee-edit-form" style="margin-top: 0.5rem; padding: 0.5rem; background: var(--surface-hover); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
      <div class="form-group mb-xs">
        <label style="font-size: 0.7rem; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase;">Amount (RM)</label>
        <input type="number" id="editFeeAmount-${type}" class="form-input" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;" value="${amount || 0}" step="0.01" />
      </div>
      <div class="form-group mb-xs">
        <label style="font-size: 0.7rem; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase;">Receipt #</label>
        <div id="editFeeReceiptContainer-${type}"></div>
      </div>
      <div class="form-group mb-xs">
        <label style="font-size: 0.7rem; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase;">Method</label>
        <select id="editFeeMethod-${type}" class="form-select" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;">
          <option value="cash" ${method === 'cash' ? 'selected' : (!method ? 'selected' : '')}>Cash</option>
          <option value="online_banking" ${method === 'online_banking' ? 'selected' : ''}>Online Banking</option>
          <option value="bank_in" ${method === 'bank_in' ? 'selected' : ''}>Bank-In</option>
          <option value="card" ${method === 'card' ? 'selected' : ''}>Credit Card</option>
          <option value="other" ${method === 'other' ? 'selected' : ''}>Other</option>
        </select>
      </div>
      ${!isReg ? `
        <div class="form-group mb-xs">
          <label style="font-size: 0.7rem; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase;">Paid To</label>
          <input type="text" id="editFeePaidTo-${type}" class="form-input" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;" value="${paidTo || ''}" spellcheck="true" autocorrect="on" />
        </div>
      ` : ''}
      <div class="flex gap-xs mt-sm">
        <button class="btn btn-sm btn-success" style="flex: 1; padding: 0.25rem;" onclick="window.saveFeeUpdate('${studentId}', '${type}')">Save</button>
        <button class="btn btn-sm btn-secondary" style="flex: 1; padding: 0.25rem;" onclick="window.openStudentDetailModalById('${studentId}')">Cancel</button>
      </div>
    </div>
  `;

  // Initialize Smart Receipt Input
  renderReceiptInput(`editFeeReceiptContainer-${type}`, {
    id: `editFeeReceipt-${type}`,
    placeholder: 'Receipt #',
    value: receipt || '',
    context: isReg ? 'REG' : 'COM'
  });
}

/**
 * Global save fee update function
 */
async function saveFeeUpdate(studentId, type) {
  const amount = document.getElementById(`editFeeAmount-${type}`).value;
  const receipt = document.getElementById(`editFeeReceipt-${type}`).value;
  const method = document.getElementById(`editFeeMethod-${type}`).value;
  const paidToEl = document.getElementById(`editFeePaidTo-${type}`);
  const paidTo = paidToEl ? paidToEl.value : null;

  try {
    const oldStudent = await Student.findById(studentId);
    
    const updates = {};
    if (type === 'registration') {
      updates.registrationFee = parseFloat(amount) || 0;
      updates.registrationFeeReceipt = receipt.trim();
      updates.registrationFeeMethod = method;
    } else {
      updates.commission = parseFloat(amount) || 0;
      updates.commissionReceipt = receipt.trim();
      updates.commissionMethod = method;
      updates.commissionPaidTo = paidTo ? paidTo.trim() : '';
    }

    await Student.update(studentId, updates);
    const updatedStudent = await Student.findById(studentId);

    // Sync Payment Record
    const feeReceipt = type === 'registration' ? updates.registrationFeeReceipt : updates.commissionReceipt;
    const feeAmount = type === 'registration' ? updates.registrationFee : updates.commission;
    const feeMethod = method || 'cash';
    
    if (feeReceipt) {
      const existingPayment = await Payment.findByReference(feeReceipt);
      if (existingPayment) {
        await Payment.update(existingPayment.id, {
          amount: feeAmount,
          method: feeMethod,
          recipient: type === 'registration' ? undefined : paidTo,
          description: type === 'registration' ? 'Registration Fee' : ('Commission Payout' + (paidTo ? ' - ' + paidTo : ''))
        });
      } else {
        await Payment.create({
          studentId: studentId,
          amount: feeAmount,
          date: new Date().toISOString(),
          method: feeMethod,
          reference: feeReceipt,
          description: type === 'registration' ? 'Registration Fee' : ('Commission Payout' + (paidTo ? ' - ' + paidTo : '')),
          transactionType: type === 'registration' ? 'REGISTRATION_FEE' : 'COMMISSION_PAYOUT',
          category: type === 'registration' ? 'REVENUE' : 'EXPENSE',
          recipient: type === 'registration' ? undefined : paidTo
        });
      }
    }

    // Sync files
    if (fileSystem.isDesktopApp()) {
      const isReg = type === 'registration';
      const oldReceipt = isReg ? oldStudent.registrationFeeReceipt : oldStudent.commissionReceipt;
      const newReceipt = isReg ? updates.registrationFeeReceipt : updates.commissionReceipt;
      const feeLabel = isReg ? 'Registration Fee' : 'Commission Fee';

      // 1. Delete old if changed
      if (oldReceipt && oldReceipt !== newReceipt) {
        try {
          const oldFilename = `${feeLabel.replace(/\s+/g, '_')}_Receipt_${oldStudent.name.replace(/\s+/g, '_')}`;
          await fileSystem.deletePDF(oldStudent.course, oldStudent.program, oldStudent.name, null, oldFilename);
        } catch (err) {
          console.warn('Could not delete old fee PDF:', err);
        }
      }

      // 2. Generate new if reference exists
      if (newReceipt) {
        try {
           const feeAmount = isReg ? updates.registrationFee : updates.commission;
           const feePaidTo = isReg ? null : updates.commissionPaidTo;
           await generateFeeReceiptPDF(updatedStudent, feeLabel, feeAmount, newReceipt, feePaidTo);
        } catch (err) {
           console.error('Fee receipt generation failed:', err);
        }
      }
    }
    
    // Refresh modal
    await openStudentDetailModal(updatedStudent);
  } catch (error) {
    console.error('Error saving fee update:', error);
    alert('Failed to save update.');
  }
}

/**
 * Helper to refresh modal by ID
 */
async function openStudentDetailModalById(studentId) {
  const student = await Student.findById(studentId);
  if (student) openStudentDetailModal(student);
}
