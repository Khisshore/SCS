/**
 * STUDENT DETAIL MODAL COMPONENT
 * Shared modern modal for viewing and managing student financial details
 */

import { Student } from '../models/Student.js';
import { Payment } from '../models/Payment.js';
import { db } from '../db/database.js';
import { formatCurrency, formatMonthYear, escapeHtml } from '../utils/formatting.js';
import { Icons } from '../utils/icons.js';
import { generateReceiptPDF, previewPDF, generateFeeReceiptPDF } from '../utils/pdfGenerator.js';
import { renderReceiptInput } from './ReceiptInput.js';
import { initPdfPreviewModal, openPdfPreviewModal } from './PdfPreviewModal.js';
import { fileSystem } from '../services/fileSystem.js';

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
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(4px);
        z-index: var(--z-modal-backdrop);
      }

      .modal-content {
        position: relative;
        z-index: var(--z-modal);
        width: 100%;
        max-width: 85rem;
        max-height: 92vh;
        background: var(--glass-bg);
        backdrop-filter: var(--glass-blur);
        -webkit-backdrop-filter: var(--glass-blur);
        border: 1px solid var(--glass-border);
        border-radius: 2rem;
        box-shadow: var(--shadow-2xl), var(--glass-shadow);
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
        padding: 0.5rem 1rem;
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-header:hover {
        background: var(--surface-hover);
        border-color: var(--primary-300);
        color: var(--primary-600);
        transform: translateY(-1px);
        box-shadow: var(--shadow-sm);
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
        background: var(--danger-50);
        color: var(--danger-600);
        transform: rotate(90deg);
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
        background: var(--glass-bg);
        backdrop-filter: var(--glass-blur);
        -webkit-backdrop-filter: var(--glass-blur);
        padding: 2.25rem;
        border-radius: 2rem;
        border: 1px solid var(--glass-border);
        box-shadow: var(--glass-shadow);
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
        padding-bottom: 1.25rem;
        border-bottom: 2px solid var(--border-light);
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

      .btn-semester-action {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .btn-semester-action:hover {
        background: var(--primary-50);
        border-color: var(--primary-300);
        color: var(--primary-700);
        transform: translateY(-1px);
        box-shadow: var(--shadow-sm);
      }

      .btn-semester-action.danger:hover {
        background: var(--danger-50);
        border-color: var(--danger-300);
        color: var(--danger-700);
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
        background: linear-gradient(135deg, var(--primary-600), var(--primary-700));
        color: white;
        border: none;
        border-radius: var(--radius-xl);
        font-size: 0.9375rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
      }

      .btn-add-semester:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
        filter: brightness(1.1);
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
        background: var(--danger-50);
        color: var(--danger-600);
        border-color: var(--danger-200);
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
        margin-bottom: 3rem;
      }

      .semester-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
      }

      .semester-title {
        font-size: 1.25rem;
        font-weight: 800;
        color: var(--text-primary);
        margin: 0;
      }

      .semester-card {
        background: var(--glass-bg);
        backdrop-filter: var(--glass-blur);
        -webkit-backdrop-filter: var(--glass-blur);
        border: 1px solid var(--glass-border);
        border-radius: 1.5rem;
        overflow: hidden;
        box-shadow: var(--glass-shadow);
      }

      .payment-table {
        width: 100%;
        border-collapse: collapse;
      }

      .payment-table th {
        padding: 1rem 1.25rem;
        text-align: left;
        font-size: 0.6875rem;
        font-weight: 800;
        color: var(--text-tertiary);
        text-transform: uppercase;
        background: var(--background-secondary);
        border-bottom: 1px solid var(--border-color);
      }

      .payment-table td {
        padding: 1.25rem;
        border-bottom: 1px solid var(--border-color);
        color: var(--text-secondary);
        font-weight: 500;
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
        background: var(--glass-bg);
        backdrop-filter: var(--glass-blur);
        -webkit-backdrop-filter: var(--glass-blur);
        border-top: 1px solid var(--glass-border);
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

      /* Form Polish */
      .inline-payment-form {
        background: var(--glass-bg);
        backdrop-filter: var(--glass-blur);
        -webkit-backdrop-filter: var(--glass-blur);
        border: 1px solid var(--glass-border);
        border-radius: 1.5rem;
        padding: 2.5rem;
        margin: 1.5rem;
        box-shadow: var(--glass-shadow), var(--shadow-xl);
      }

      .inline-form-input, .inline-form-select {
        padding: 1rem;
        border: 2px solid var(--border-color);
        border-radius: var(--radius-lg);
        background: var(--background);
        color: var(--text-primary);
        font-size: 1rem;
        font-weight: 600;
        width: 100%;
        transition: all 0.2s;
      }

      .inline-form-input:focus, .inline-form-select:focus {
        border-color: var(--primary-500);
        box-shadow: 0 0 0 4px var(--primary-50);
        outline: none;
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
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
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
        <div style="font-size: 0.75rem; color: var(--text-tertiary); font-weight: 500; display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
          ${student.registrationFeeReceipt ? `Receipt #: ${student.registrationFeeReceipt}` : 'No receipt'}
          <div class="flex gap-xs">
            ${student.registrationFeeReceipt ? `
              <button class="btn-icon-xs" title="Preview Receipt" onclick="window.previewFeeReceipt(${student.id}, 'Registration Fee', ${student.registrationFee || 0}, '${student.registrationFeeReceipt}')">
                ${Icons.eye}
              </button>
              <button class="btn-icon-xs" title="Download Receipt" onclick="window.generateFeeReceipt(${student.id}, 'Registration Fee', ${student.registrationFee || 0}, '${student.registrationFeeReceipt}')">
                ${Icons.download}
              </button>
            ` : ''}
            <button class="btn-icon-xs" title="Edit Fee" onclick="window.editFeeDetail(${student.id}, 'registration')">
              ${Icons.edit}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-info-item" id="commFeeItem">
      <div class="modal-info-label">Commission Fees</div>
      <div class="modal-info-value">
        ${formatCurrency(student.commission || 0, currency)}
        <div style="font-size: 0.75rem; color: var(--text-tertiary); font-weight: 500; display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
          ${student.commissionReceipt ? `Receipt #: ${student.commissionReceipt}` : 'No receipt'}
          <div class="flex gap-xs">
            ${student.commissionReceipt ? `
              <button class="btn-icon-xs" title="Preview Receipt" onclick="window.previewFeeReceipt(${student.id}, 'Commission Fee', ${student.commission || 0}, '${student.commissionReceipt}', '${student.commissionPaidTo || ''}')">
                ${Icons.eye}
              </button>
              <button class="btn-icon-xs" title="Download Receipt" onclick="window.generateFeeReceipt(${student.id}, 'Commission Fee', ${student.commission || 0}, '${student.commissionReceipt}', '${student.commissionPaidTo || ''}')">
                ${Icons.download}
              </button>
            ` : ''}
            <button class="btn-icon-xs" title="Edit Fee" onclick="window.editFeeDetail(${student.id}, 'commission')">
              ${Icons.edit}
            </button>
          </div>
        </div>
        ${student.commissionPaidTo ? `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">Paid To: ${student.commissionPaidTo}</div>` : ''}
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
            <button class="btn-semester-action" onclick="window.addPaymentEntry(${student.id}, ${sem})">
              <span class="icon">${Icons.plus}</span>
              Add Payment
            </button>
            <button class="btn-semester-action danger icon-only" title="Delete Semester" onclick="window.editSemester(${student.id}, ${sem})">
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
                    <td>${new Date(payment.date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td style="font-weight: 600;">${payment.description || '-'}</td>
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
                          <span class="icon" style="width: 1rem; height: 1rem;">${Icons.download}</span>
                        </button>
                        <button class="payment-action-btn" title="Edit" onclick="window.editPaymentEntry(${student.id}, ${sem}, ${payment.id})">
                          <span class="icon" style="width: 1rem; height: 1rem;">${Icons.edit}</span>
                        </button>
                        <button class="payment-action-btn danger" title="Delete" onclick="window.deletePaymentEntry(${student.id}, ${payment.id})">
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
              <p style="margin-bottom: 1.5rem; font-weight: 600; color: var(--slate-400);">No payments recorded for this semester yet.</p>
              <button class="inner-add-btn" onclick="window.addPaymentEntry(${student.id}, ${sem})">
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
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem;">
        <h5 style="margin: 0; font-size: 1.125rem; font-weight: 800; color: var(--slate-900);">
          <span style="color: var(--primary-600);">Record Payment</span> — Semester ${semester}
        </h5>
        <div class="status-badge" style="background: var(--primary-50); color: var(--primary-700); border-color: var(--primary-200);">NEW ENTRY</div>
      </div>
      
      <div class="inline-form-grid">
        <div class="inline-form-group">
          <label class="inline-form-label">Amount (RM)</label>
          <input type="number" id="inlineAmount-${semester}" class="inline-form-input" placeholder="0.00" step="0.01" required />
        </div>
        <div class="inline-form-group">
          <label class="inline-form-label">Date</label>
          <input type="date" id="inlineDate-${semester}" class="inline-form-input" value="${today}" required />
        </div>
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
      </div>

      <div class="inline-form-grid" style="grid-template-columns: 2fr 1fr;">
        <div class="inline-form-group">
          <label class="inline-form-label">Description (What is this payment for?)</label>
          <input type="text" id="inlineDesc-${semester}" class="inline-form-input" placeholder="e.g. Tuition Fee Part 1, Exam Fee, etc." />
        </div>
        <div class="inline-form-group">
          <label class="inline-form-label">Reference (Receipt #)</label>
          <div id="inlineRefContainer-${semester}"></div>
        </div>
      </div>

      <div class="inline-form-actions">
        <button class="btn-inline-cancel" onclick="window.cancelInlinePayment(${semester})">Discard</button>
        <button class="btn-inline-save" onclick="window.saveInlinePayment(${studentId}, ${semester})">
          <span class="icon" style="margin-right: 0.625rem;">${Icons.check}</span>
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
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem;">
        <h5 style="margin: 0; font-size: 1.125rem; font-weight: 800; color: var(--slate-900);">
          <span style="color: var(--primary-600);">Update Payment</span> — Semester ${semester}
        </h5>
        <div class="status-badge" style="background: var(--warning-50); color: var(--warning-700); border-color: var(--warning-200);">EDITING</div>
      </div>
      
      <div class="inline-form-grid">
        <div class="inline-form-group">
          <label class="inline-form-label">Amount (RM)</label>
          <input type="number" id="inlineAmount-${semester}" class="inline-form-input" value="${payment.amount}" step="0.01" required />
        </div>
        <div class="inline-form-group">
          <label class="inline-form-label">Date</label>
          <input type="date" id="inlineDate-${semester}" class="inline-form-input" value="${paymentDate}" required />
        </div>
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
      </div>

      <div class="inline-form-grid" style="grid-template-columns: 2fr 1fr;">
        <div class="inline-form-group">
          <label class="inline-form-label">Description</label>
          <input type="text" id="inlineDesc-${semester}" class="inline-form-input" value="${payment.description || ''}" />
        </div>
        <div class="inline-form-group">
          <label class="inline-form-label">Reference (Receipt #)</label>
          <div id="inlineRefContainer-${semester}"></div>
        </div>
      </div>

      <div class="inline-form-actions">
        <button class="btn-inline-cancel" onclick="window.cancelInlinePayment(${semester})">Cancel Changes</button>
        <button class="btn-inline-save" onclick="window.updateInlinePayment(${studentId}, ${paymentId}, ${semester})">
          <span class="icon" style="margin-right: 0.625rem;">${Icons.check}</span>
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
 * Delete payment entry
 */
async function deletePaymentEntry(studentId, paymentId) {
  if (confirm('Are you sure you want to delete this payment record? This action cannot be undone.')) {
    try {
      const payment = await Payment.findById(paymentId);
      const student = await Student.findById(studentId);

      // Delete local PDF if exists
      if (payment && payment.reference && fileSystem.isDesktopApp()) {
        try {
          const baseFilename = `Receipt_${payment.reference}_${student.name.replace(/\s+/g, '_')}`;
          const semesterLabel = payment.semester ? `Semester ${payment.semester}` : 'General';
          await fileSystem.deletePDF(student.course, student.program, student.name, semesterLabel, baseFilename);
        } catch (err) {
          console.warn('Failed to delete associated PDF:', err);
        }
      }

      await Payment.delete(paymentId);
      
      // Refresh modal
      await openStudentDetailModal(student);
    } catch (error) {
      console.error('Error deleting payment:', error);
      alert('Failed to delete payment.');
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
    
    const doc = await generateReceiptPDF(student, payment, allPayments);
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
    
    const doc = await generateReceiptPDF(student, payment, allPayments);
    const filename = `Receipt_${payment.reference || 'PAY'}_${student.name.replace(/\s+/g, '_')}`;
    openPdfPreviewModal(doc, filename);
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
    
    const doc = await generateFeeReceiptPDF(student, feeType, amount, receiptNo, paidTo);
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
    
    const doc = await generateFeeReceiptPDF(student, feeType, amount, receiptNo, paidTo);
    const filename = `${feeType} Receipt - ${student.name}`;
    openPdfPreviewModal(doc, filename);
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
      ${!isReg ? `
        <div class="form-group mb-xs">
          <label style="font-size: 0.7rem; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase;">Paid To</label>
          <input type="text" id="editFeePaidTo-${type}" class="form-input" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;" value="${paidTo || ''}" />
        </div>
      ` : ''}
      <div class="flex gap-xs mt-sm">
        <button class="btn btn-sm btn-success" style="flex: 1; padding: 0.25rem;" onclick="window.saveFeeUpdate(${studentId}, '${type}')">Save</button>
        <button class="btn btn-sm btn-secondary" style="flex: 1; padding: 0.25rem;" onclick="window.openStudentDetailModalById(${studentId})">Cancel</button>
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
  const paidToEl = document.getElementById(`editFeePaidTo-${type}`);
  const paidTo = paidToEl ? paidToEl.value : null;

  try {
    const oldStudent = await Student.findById(studentId);
    
    const updates = {};
    if (type === 'registration') {
      updates.registrationFee = parseFloat(amount) || 0;
      updates.registrationFeeReceipt = receipt.trim();
    } else {
      updates.commission = parseFloat(amount) || 0;
      updates.commissionReceipt = receipt.trim();
      updates.commissionPaidTo = paidTo ? paidTo.trim() : '';
    }

    await Student.update(studentId, updates);
    const updatedStudent = await Student.findById(studentId);

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
  return methods[method] || method || '-';
}
