/**
 * PAYMENTS COMPONENT
 * Payment recording and management interface
 */

import { Payment } from '../models/Payment.js';
import { Student } from '../models/Student.js';
import { Receipt } from '../models/Receipt.js';
import { formatCurrency, formatDate, formatPaymentMethod } from '../utils/formatting.js';
import { generateReceiptPDF, downloadPDF, printPDF } from '../utils/pdfGenerator.js';
import { Icons } from '../utils/icons.js';
import { db } from '../db/database.js';

export async function renderPayments() {
  const container = document.getElementById('app-content');

  container.innerHTML = `
    <div style="animation: fadeIn 0.5s ease-in-out;">
      <div class="flex justify-between items-center mb-2xl">
        <div>
          <h1 style="margin-bottom: 0.5rem;">Payment Management</h1>
          <p style="margin: 0; color: var(--text-secondary);">Record and manage student payments.</p>
        </div>
        <button class="btn btn-success" id="recordPaymentBtn">
          <span class="icon">${Icons.dollarSign}</span>
          Record New Payment
        </button>
      </div>

      <!-- Filters -->
      <div class="card mb-xl">
        <div class="card-body">
          <div class="grid grid-4 gap-md">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Start Date</label>
              <input type="date" id="startDate" class="form-input" />
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">End Date</label>
              <input type="date" id="endDate" class="form-input" />
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Payment Method</label>
              <select id="methodFilter" class="form-select">
                <option value="">All Methods</option>
                <option value="cash">Cash</option>
                <option value="card">Credit/Debit Card</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="online">Online Payment</option>
                <option value="other">Other</option>
              </select>
            </div>
            <button class="btn btn-secondary" id="refreshPaymentsBtn" style="margin-top: 1.8rem;">
              <span class="icon icon-sm">${Icons.refresh}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Payments Table -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Payment Records</h3>
          <div class="flex gap-md">
            <span class="badge badge-primary" id="paymentCount">0 payments</span>
            <span class="badge badge-success" id="paymentTotal">RM 0.00</span>
          </div>
        </div>
        <div class="card-body">
          <div id="paymentsTableContainer"></div>
          <div id="paymentsActionsContainer"></div>
        </div>
      </div>
    </div>

    <style>
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes slideIn {
        from { opacity: 0; transform: translateX(-10px); }
        to { opacity: 1; transform: translateX(0); }
      }
    </style>
  `;

  await loadPayments();

  document.getElementById('recordPaymentBtn').addEventListener('click', () => showPaymentForm());
  document.getElementById('refreshPaymentsBtn').addEventListener('click', loadPayments);
  document.getElementById('startDate').addEventListener('change', loadPayments);
  document.getElementById('endDate').addEventListener('change', loadPayments);
  document.getElementById('methodFilter').addEventListener('change', loadPayments);
}

async function loadPayments() {
  const startDate = document.getElementById('startDate')?.value;
  const endDate = document.getElementById('endDate')?.value;
  const method = document.getElementById('methodFilter')?.value;

  const filters = {};
  if (startDate) filters.startDate = new Date(startDate).toISOString();
  if (endDate) filters.endDate = new Date(endDate).toISOString();
  if (method) filters.method = method;

  const payments = await Payment.findAll(filters);
  const currency = await db.getSetting('currency') || 'RM';
  const total = payments.reduce((sum, p) => sum + p.amount, 0);

  const countBadge = document.getElementById('paymentCount');
  const totalBadge = document.getElementById('paymentTotal');

  if (countBadge) countBadge.textContent = `${payments.length} payment${payments.length !== 1 ? 's' : ''}`;
  if (totalBadge) totalBadge.textContent = formatCurrency(total, currency);

  const tableContainer = document.getElementById('paymentsTableContainer');
  const actionContainer = document.getElementById('paymentsActionsContainer');

  if (payments.length === 0) {
    tableContainer.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: var(--text-tertiary);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">
          <span class="icon icon-xl" style="opacity: 0.5;">${Icons.wallet}</span>
        </div>
        <p style="font-size: var(--font-size-lg); margin-bottom: 0.5rem;">No payments found</p>
        <p style="font-size: var(--font-size-sm);">Record your first payment to get started!</p>
      </div>
    `;
    actionContainer.innerHTML = '';
    return;
  }

  const studentsMap = new Map();
  for (const payment of payments) {
    if (!studentsMap.has(payment.studentId)) {
      const student = await Student.findById(payment.studentId);
      studentsMap.set(payment.studentId, student);
    }
  }

  tableContainer.innerHTML = `
    <div class="table-container" style="box-shadow: none;">
      <table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Student</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Reference</th>
            <th>Description</th>
            <th style="text-align: center;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${payments.map((payment, index) => {
            const student = studentsMap.get(payment.studentId);
            return `
              <tr style="animation: slideIn 0.3s ease-out ${index * 0.05}s both;">
                <td>${formatDate(payment.date, 'short')}</td>
                <td>
                  <div><strong>${student ? student.name : 'Unknown'}</strong></div>
                  <div style="font-size: var(--font-size-sm); color: var(--text-tertiary);">${student ? student.studentId : '-'}</div>
                </td>
                <td><strong>${formatCurrency(payment.amount, currency)}</strong></td>
                <td><span class="badge badge-primary">${formatPaymentMethod(payment.method)}</span></td>
                <td style="font-size: var(--font-size-sm);">${payment.reference || '-'}</td>
                <td style="font-size: var(--font-size-sm);">${payment.description || '-'}</td>
                <td style="text-align: center;">
                  <div class="flex gap-sm" style="justify-content: center;">
                    <button class="btn btn-sm btn-primary" onclick="window.viewReceipt(${payment.id})" title="View Receipt">
                      <span class="icon icon-sm">${Icons.eye}</span>
                    </button>
                    <button class="btn btn-sm btn-success" onclick="window.printReceipt(${payment.id})" title="Print Receipt">
                      <span class="icon icon-sm">${Icons.printer}</span>
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  actionContainer.innerHTML = `
    <div style="text-align: center; margin-top: 1.5rem;">
      <button class="btn btn-primary" id="downloadPaymentsBtn">
        <span class="icon">${Icons.download}</span>
        Download Payment Records (CSV)
      </button>
    </div>
  `;

  // Store data for download
  window.currentPayments = payments;
  window.currentStudentsMap = studentsMap;
  window.currentCurrency = currency;

  // Add event listener for the new button
  document.getElementById('downloadPaymentsBtn')?.addEventListener('click', () => downloadPaymentRecords());
}

export function showPaymentForm(initialData = {}) {
  const modal = document.getElementById('modal-container');
  modal.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Record New Payment</h2>
          <button class="modal-close" onclick="window.closeModal()">×</button>
        </div>
        <form id="paymentForm">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label required">Select Student</label>
              <select id="paymentStudent" class="form-select" required>
                <option value="">-- Select Student --</option>
              </select>
            </div>

            <div class="grid grid-2 gap-md">
              <div class="form-group">
                <label class="form-label required">Amount (RM)</label>
                <input type="number" id="paymentAmount" class="form-input" required min="0" step="0.01" placeholder="0.00" />
              </div>

              <div class="form-group">
                <label class="form-label required">Payment Date</label>
                <input type="date" id="paymentDate" class="form-input" required />
              </div>
            </div>

            <div class="grid grid-2 gap-md">
              <div class="form-group">
                <label class="form-label required">Payment Method</label>
                <select id="paymentMethod" class="form-select" required>
                  <option value="cash">Cash</option>
                  <option value="card">Credit/Debit Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="online">Online Payment</option>
                  <option value="other">Other</option>
                </select>
              </div>

            <div class="grid grid-2 gap-md">
              <div class="form-group">
                <label class="form-label">Semester</label>
                <select id="paymentSemester" class="form-select">
                  <option value="">-- Select Semester --</option>
                  <option value="1">Semester 1</option>
                  <option value="2">Semester 2</option>
                  <option value="3">Semester 3</option>
                  <option value="4">Semester 4</option>
                  <option value="5">Semester 5</option>
                  <option value="6">Semester 6</option>
                  <option value="7">Semester 7</option>
                  <option value="8">Semester 8</option>
                </select>
                <div class="form-help">Semester this payment is for (used in Spreadsheet)</div>
              </div>

              <div class="form-group">
                <label class="form-label">Reference Number</label>
                <input type="text" id="paymentReference" class="form-input" placeholder="Optional" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Description/Purpose</label>
              <textarea id="paymentDescription" class="form-textarea" placeholder="e.g., Tuition Fee - Semester 1"></textarea>
            </div>

            <div id="formError" class="form-error hidden"></div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-success">Record Payment</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Load students
  loadStudentOptions();

  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('paymentDate').value = today;

  // Pre-fill data if provided
  if (initialData.studentId) {
    document.getElementById('paymentStudent').value = initialData.studentId;
  }
  if (initialData.semester) {
    document.getElementById('paymentSemester').value = initialData.semester;
  }

  document.getElementById('paymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await savePayment();
  });
}

async function loadStudentOptions() {
  const students = await Student.findAll({ status: 'active' });
  const select = document.getElementById('paymentStudent');

  students.forEach(student => {
    const option = document.createElement('option');
    option.value = student.id;
    option.textContent = `${student.name} (${student.studentId})`;
    select.appendChild(option);
  });
}

async function savePayment() {
  const formError = document.getElementById('formError');
  formError.classList.add('hidden');

  const studentId = parseInt(document.getElementById('paymentStudent').value);
  const semesterValue = document.getElementById('paymentSemester').value;
  const paymentData = {
    studentId,
    amount: document.getElementById('paymentAmount').value,
    date: new Date(document.getElementById('paymentDate').value).toISOString(),
    method: document.getElementById('paymentMethod').value,
    semester: semesterValue ? parseInt(semesterValue) : null,
    reference: document.getElementById('paymentReference').value.trim(),
    description: document.getElementById('paymentDescription').value.trim()
  };

  try {
    const paymentId = await Payment.create(paymentData);
    
    // Generate receipt
    await Receipt.generate(paymentId, { ...paymentData, id: paymentId });

    window.closeModal();
    await loadPayments();
    alert('Payment recorded successfully!');
  } catch (error) {
    formError.textContent = error.message;
    formError.classList.remove('hidden');
  }
}

async function viewReceipt(paymentId) {
  const payment = await Payment.findById(paymentId);
  const student = await Student.findById(payment.studentId);
  const receipt = await Receipt.getByPaymentId(paymentId);
  const currency = await db.getSetting('currency') || 'RM';

  const modal = document.getElementById('modal-container');
  modal.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" style="max-width: 700px;">
        <div class="modal-header">
          <h2 class="modal-title">Receipt #${receipt.receiptNumber}</h2>
          <button class="modal-close" onclick="window.closeModal()">×</button>
        </div>
        <div class="modal-body">
          <div style="border: 2px solid var(--border-color); border-radius: var(--radius-lg); padding: 2rem; background: var(--gray-50);">
            <h2 style="text-align: center; color: var(--primary-600);">PAYMENT RECEIPT</h2>
            <p style="text-align: center; margin-bottom: 2rem;">Education Institution</p>
            
            <div style="background: white; padding: 1.5rem; border-radius: var(--radius-lg); margin-bottom: 1.5rem;">
              <p><strong>Receipt Number:</strong> ${receipt.receiptNumber}</p>
              <p><strong>Date:</strong> ${formatDate(receipt.generatedAt, 'long')}</p>
            </div>

            <div style="background: white; padding: 1.5rem; border-radius: var(--radius-lg); margin-bottom: 1.5rem;">
              <h4>Student Information</h4>
              <p><strong>Name:</strong> ${student.name}</p>
              <p><strong>Student ID:</strong> ${student.studentId}</p>
              <p><strong>Program:</strong> ${student.program}</p>
            </div>

            <div style="background: white; padding: 1.5rem; border-radius: var(--radius-lg); margin-bottom: 1.5rem;">
              <h4>Payment Details</h4>
              <p><strong>Payment Date:</strong> ${formatDate(payment.date, 'long')}</p>
              <p><strong>Method:</strong> ${formatPaymentMethod(payment.method)}</p>
              <p><strong>Reference:</strong> ${payment.reference || 'N/A'}</p>
              <p><strong>Description:</strong> ${payment.description || 'Payment'}</p>
            </div>

            <div style="background: var(--primary-50); padding: 1.5rem; border-radius: var(--radius-lg); border: 2px solid var(--primary-500);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0;">Total Amount Paid:</h3>
                <h2 style="margin: 0; color: var(--primary-600);">${formatCurrency(payment.amount, currency)}</h2>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="window.closeModal()">Close</button>
          <button class="btn btn-primary" onclick="window.downloadReceiptPDF(${paymentId})">
            <span class="icon">${Icons.download}</span>
            Download PDF
          </button>
          <button class="btn btn-success" onclick="window.printReceipt(${paymentId})">
            <span class="icon">${Icons.printer}</span>
            Print
          </button>
        </div>
      </div>
    </div>
  `;
}

async function printReceipt(paymentId) {
  const payment = await Payment.findById(paymentId);
  const student = await Student.findById(payment.studentId);
  const allPayments = await Payment.findByStudent(payment.studentId);

  const doc = await generateReceiptPDF(student, payment, allPayments);
  printPDF(doc);
}

async function downloadReceiptPDF(paymentId) {
  const payment = await Payment.findById(paymentId);
  const student = await Student.findById(payment.studentId);
  const allPayments = await Payment.findByStudent(payment.studentId);

  const doc = await generateReceiptPDF(student, payment, allPayments);
  const filename = `Receipt_${payment.reference || 'PAY'}_${student.name.replace(/\s+/g, '_')}.pdf`;
  downloadPDF(doc, filename);
}

/**
 * Export payment records to CSV
 */
function downloadPaymentRecords() {
  if (!window.currentPayments || window.currentPayments.length === 0) {
    alert('No payment records to download');
    return;
  }

  const payments = window.currentPayments;
  const studentsMap = window.currentStudentsMap;
  const currency = window.currentCurrency;

  // Create CSV content
  const headers = ['Date', 'Student Name', 'Student ID', 'Amount', 'Currency', 'Method', 'Reference', 'Description'];
  const rows = payments.map(payment => {
    const student = studentsMap.get(payment.studentId);
    return [
      formatDate(payment.date, 'short'),
      `"${student ? student.name : 'Unknown'}"`,
      `"${student ? student.studentId : '-'}"`,
      payment.amount.toFixed(2),
      currency,
      formatPaymentMethod(payment.method),
      `"${payment.reference || '-'}"`,
      `"${(payment.description || '-').replace(/"/g, '""')}"`
    ];
  });

  const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `NeoTrackr-Payments-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Global window functions for template interactions
window.viewReceipt = viewReceipt;
window.printReceipt = printReceipt;
window.downloadReceiptPDF = downloadReceiptPDF;
window.downloadPaymentRecords = downloadPaymentRecords;
