/**
 * IMPORT WIZARD COMPONENT
 * Multi-step wizard for intelligent data import
 */

import { Icons } from '../utils/icons.js';
import { parseSpreadsheet, suggestColumnMapping, transformToPayments, matchProofFiles, importPayments } from '../services/importService.js';

let wizardState = {
  currentStep: 1,
  spreadsheetFile: null,
  spreadsheetData: null,
  columnMapping: null,
  transformedPayments: null,
  proofsFolder: null,
  importResults: null
};

export function renderImportWizard() {
  const steps = [
    { number: 1, title: 'Upload Files', icon: Icons.upload },
    { number: 2, title: 'Map Columns', icon: Icons.settings },
    { number: 3, title: 'Review & Import', icon: Icons.checkCircle }
  ];
  
  return `
    <div class="import-wizard-overlay active">
      <div class="import-wizard-container">
        <div class="wizard-header">
          <h2>
            <span class="icon">${Icons.upload}</span>
            Smart Data Import
          </h2>
          <button class="btn-close" id="closeWizard">&times;</button>
        </div>
        
        <div class="wizard-steps">
          ${steps.map(step => `
            <div class="wizard-step ${step.number === wizardState.currentStep ? 'active' : ''} ${step.number < wizardState.currentStep ? 'completed' : ''}">
              <div class="step-number">${step.number < wizardState.currentStep ? Icons.check : step.number}</div>
              <span>${step.title}</span>
            </div>
          `).join('')}
        </div>
        
        <div class="wizard-content" id="wizardContent">
          ${renderStep(wizardState.currentStep)}
        </div>
      </div>
    </div>
  `;
}

function renderStep(stepNumber) {
  switch (stepNumber) {
    case 1:
      return renderStep1();
    case 2:
      return renderStep2();
    case 3:
      return renderStep3();
    default:
      return '';
  }
}

function renderStep1() {
  return `
    <div class="wizard-step-content">
      <h3>Select Files to Import</h3>
      <p>Upload your spreadsheet and optionally point to a folder containing payment proofs.</p>
      
      <div class="file-upload-section">
        <label class="file-upload-box" for="spreadsheetInput">
          <div class="upload-icon">
            <span class="icon">${Icons.file}</span>
          </div>
          <div class="upload-text">
            <strong>Click to select spreadsheet</strong>
            <span>Supports .xlsx, .xls, .csv</span>
          </div>
          <input type="file" id="spreadsheetInput" accept=".xlsx,.xls,.csv" style="display: none;" />
        </label>
        
        <div id="spreadsheetPreview" class="file-preview hidden"></div>
      </div>
      
      <div class="file-upload-section">
        <button class="btn btn-secondary" id="selectProofsFolderBtn" style="width: 100%;">
          <span class="icon icon-sm">${Icons.folderOpen}</span>
          Select Proofs Folder (Optional)
        </button>
        <div id="proofsPreview" class="file-preview hidden"></div>
      </div>
      
      <div class="wizard-actions">
        <button class="btn btn-primary" id="nextStep1" disabled>
          Next
          <span class="icon icon-sm">${Icons.arrowRight}</span>
        </button>
      </div>
    </div>
  `;
}

function renderStep2() {
  if (!wizardState.spreadsheetData) return '<p>No data loaded</p>';
  
  const { headers } = wizardState.spreadsheetData;
  const mapping = wizardState.columnMapping || suggestColumnMapping(headers);
  
  const fields = [
    { key: 'studentName', label: 'Student Name', required: true },
    { key: 'studentId', label: 'Student ID', required: false },
    { key: 'course', label: 'Course', required: false },
    { key: 'semester', label: 'Semester', required: false },
    { key: 'amount', label: 'Amount', required: true },
    { key: 'paymentDate', label: 'Payment Date', required: false },
    { key: 'method', label: 'Payment Method', required: false },
    { key: 'reference', label: 'Reference/Receipt No', required: false }
  ];
  
  return `
    <div class="wizard-step-content">
      <h3>Map Your Columns</h3>
      <p>We've tried to automatically detect your columns. Adjust if needed.</p>
      
      <div class="column-mapping">
        ${fields.map(field => `
          <div class="mapping-row">
            <label>
              ${field.label}${field.required ? ' <span class="required">*</span>' : ''}
            </label>
            <select class="mapping-select" data-field="${field.key}">
              <option value="">-- Not Mapped --</option>
              ${headers.map((header, index) => `
                <option value="${index}" ${mapping[field.key] === index ? 'selected' : ''}>
                  ${header || `Column ${index + 1}`}
                </option>
              `).join('')}
            </select>
          </div>
        `).join('')}
      </div>
      
      <div class="wizard-actions">
        <button class="btn btn-secondary" id="prevStep2">
          <span class="icon icon-sm">${Icons.arrowLeft}</span>
          Back
        </button>
        <button class="btn btn-primary" id="nextStep2">
          Next
          <span class="icon icon-sm">${Icons.arrowRight}</span>
        </button>
      </div>
    </div>
  `;
}

function renderStep3() {
  if (!wizardState.transformedPayments) return '<p>No payments to review</p>';
  
  const payments = wizardState.transformedPayments;
  const withProofs = payments.filter(p => p.proofMatched).length;
  
  return `
    <div class="wizard-step-content">
      <h3>Review & Confirm Import</h3>
      
      <div class="import-summary">
        <div class="summary-card">
          <div class="summary-icon">
            <span class="icon">${Icons.users}</span>
          </div>
          <div>
            <strong>${payments.length}</strong>
            <span>Total Payments</span>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon">
            <span class="icon">${Icons.fileText}</span>
          </div>
          <div>
            <strong>${withProofs}</strong>
            <span>With Proofs</span>
          </div>
        </div>
      </div>
      
      <div class="payments-preview">
        <h4>Preview (first 5 rows)</h4>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>ID</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Proof</th>
              </tr>
            </thead>
            <tbody>
              ${payments.slice(0, 5).map(p => `
                <tr>
                  <td>${p.studentName}</td>
                  <td>${p.studentId}</td>
                  <td>RM ${p.amount.toFixed(2)}</td>
                  <td>${p.paymentDate.toLocaleDateString()}</td>
                  <td>${p.proofMatched ? '<span style="color: var(--success-500);">✓</span>' : '<span style="color: var(--warning-500);">–</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      
      <div class="wizard-actions">
        <button class="btn btn-secondary" id="prevStep3">
          <span class="icon icon-sm">${Icons.arrowLeft}</span>
          Back
        </button>
        <button class="btn btn-success" id="confirmImport">
          <span class="icon icon-sm">${Icons.check}</span>
          Import All
        </button>
      </div>
    </div>
  `;
}

export async function initImportWizard() {
  // Step 1: File selection
  document.getElementById('spreadsheetInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        wizardState.spreadsheetFile = file;
        const data = await parseSpreadsheet(file);
        wizardState.spreadsheetData = data;
        
        // Update UI
        const preview = document.getElementById('spreadsheetPreview');
        preview.innerHTML = `
          <div class="file-info">
            ${Icons.checkCircle} ${file.name} (${data.totalRows} rows)
          </div>
        `;
        preview.classList.remove('hidden');
        
        document.getElementById('nextStep1').disabled = false;
      } catch (error) {
        alert(`Failed to parse spreadsheet: ${error.message}`);
      }
    }
  });
  
  document.getElementById('selectProofsFolderBtn')?.addEventListener('click', async () => {
    if (window.electronAPI) {
      try {
        const folderPath = await window.electronAPI.selectFolder();
        if (folderPath) {
          wizardState.proofsFolder = folderPath;
          const preview = document.getElementById('proofsPreview');
          preview.innerHTML = `<div class="file-info">${Icons.folderOpen} ${folderPath}</div>`;
          preview.classList.remove('hidden');
        }
      } catch (error) {
        console.error(error);
      }
    }
  });
  
  document.getElementById('nextStep1')?.addEventListener('click', () => {
    wizardState.currentStep = 2;
    document.getElementById('wizardContent').innerHTML = renderStep(2);
    initImportWizard(); // Re-init for new step
  });
  
  // Step 2: Column mapping
  document.querySelectorAll('.mapping-select').forEach(select => {
    select.addEventListener('change', (e) => {
      if (!wizardState.columnMapping) {
        wizardState.columnMapping = suggestColumnMapping(wizardState.spreadsheetData.headers);
      }
      const field = e.target.dataset.field;
      const value = e.target.value === '' ? null : parseInt(e.target.value);
      wizardState.columnMapping[field] = value;
    });
  });
  
  document.getElementById('prevStep2')?.addEventListener('click', () => {
    wizardState.currentStep = 1;
    document.getElementById('wizardContent').innerHTML = renderStep(1);
    initImportWizard();
  });
  
  document.getElementById('nextStep2')?.addEventListener('click', async () => {
    const mapping = wizardState.columnMapping || suggestColumnMapping(wizardState.spreadsheetData.headers);
    wizardState.transformedPayments = transformToPayments(wizardState.spreadsheetData.rows, mapping, wizardState.spreadsheetData.headers);
    
    // Match proofs if folder selected
    if (wizardState.proofsFolder) {
      wizardState.transformedPayments = await matchProofFiles(wizardState.transformedPayments, wizardState.proofsFolder);
    }
    
    wizardState.currentStep = 3;
    document.getElementById('wizardContent').innerHTML = renderStep(3);
    initImportWizard();
  });
  
  // Step 3: Review & Confirm
  document.getElementById('prevStep3')?.addEventListener('click', () => {
    wizardState.currentStep = 2;
    document.getElementById('wizardContent').innerHTML = renderStep(2);
    initImportWizard();
  });
  
  document.getElementById('confirmImport')?.addEventListener('click', async () => {
    try {
      const btn = document.getElementById('confirmImport');
      btn.disabled = true;
      btn.textContent = 'Importing...';
      
      const results = await importPayments(wizardState.transformedPayments);
      
      alert(`Import complete!\n${results.studentsCreated} students created\n${results.paymentsCreated} payments added`);
      
      // Close wizard and reload
      document.querySelector('.import-wizard-overlay').remove();
      window.location.reload();
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    }
  });
  
  // Close wizard
  document.getElementById('closeWizard')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to cancel the import?')) {
      document.querySelector('.import-wizard-overlay').remove();
    }
  });
}
