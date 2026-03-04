/**
 * AI CHAT COMPONENT
 * Floating assistant for natural language data queries
 */

import { Icons } from '../utils/icons.js';
import { aiService } from '../services/aiService.js';
import { Student } from '../models/Student.js';
import { Payment } from '../models/Payment.js';
import aiBirdLogo from '../assets/logos/AI-Bird.png';
import { db, STORES } from '../db/database.js';
import { formatDate } from '../utils/formatting.js';
import { setTheme, setVisualPreset } from './ThemeToggle.js';
// ExcelJS via CDN — same pattern as spreadsheetExporter.js (reading side)
const getExcelJS = () => import('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/+esm').then(m => m.default);
import { fuzzyMatchStudent, applyUpdatePlan } from '../services/smartXLSXProcessor.js';

// Initialize state from localStorage
const savedState = localStorage.getItem('ai-chat-state');
const parsedState = savedState ? JSON.parse(savedState) : {};

// Load messages from localStorage or use default
const savedMessages = localStorage.getItem('ai-chat-messages');
const initialMessages = savedMessages ? JSON.parse(savedMessages) : [
  { role: 'assistant', text: 'Hello! I am your Smart Assistant. Ask me anything about your student records or financial data.' }
];

let chatState = {
  isOpen: false,
  messages: initialMessages,
  isTyping: false,
  attachedFile: null,
  draftMessage: '', // Track unsent typed text
  position: parsedState.position || { right: '2rem', bottom: '2rem' },
  dimensions: parsedState.dimensions || { width: '400px', height: '650px' },
  // Two-Pass state
  pendingDiscovery: null,   // Stores discovery result awaiting confirmation
  pendingWorkbook: null,    // Stores workbook for extraction after mapping confirmation
  instructionStack: [],     // Session-level user rules, e.g. "ignore program changes"
  ignoredColumns: new Set() // Columns to exclude from extraction/display
};

/**
 * Capture current UI state for the AI
 */
function getLiveContext() {
  const activePage = document.querySelector('.nav-item.active')?.textContent?.trim() || 'Dashboard';
  const modalHeader = document.querySelector('.modal-overlay:not([style*="display: none"]) .modal-content h2');
  const openModal = modalHeader?.textContent?.trim() || null;
  
  // Try to find specific data context (e.g., Student Name in a detail view)
  let subContext = '';
  if (openModal === 'Student Details' || openModal === 'Edit Student') {
    const nameEl = document.querySelector('.modal-content .student-name-header') || 
                   document.querySelector('.modal-content input[name="name"]');
    if (nameEl) {
      const name = nameEl.value || nameEl.textContent;
      subContext = ` for student "${name.trim()}"`;
    }
  }
  
  // Quick summary of what's on screen
  let summary = `User is currently on the ${activePage} page.`;
  if (openModal) {
    summary += ` A modal titled "${openModal}"${subContext} is currently open.`;
  }
  
  return { page: activePage, modal: openModal, subContext, summary };
}

function saveMessages() {
  localStorage.setItem('ai-chat-messages', JSON.stringify(chatState.messages));
}

/**
 * Simple Markdown-to-HTML converter
 */
function parseMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n\* /g, '<br/>• ')
    .replace(/\n/g, '<br/>');
  return html;
}

/**
 * Normalizes date strings (e.g., "Oct-22", "Oct 22", "2022") to "MMM YYYY"
 */
function normalizeDateString(str) {
  if (!str) return str;
  const s = String(str).trim();
  
  // Handle "MMM-YY" or "MMM YY" (e.g. Oct-22, Oct 22)
  const monthYear2DigitRegex = /^([A-Za-z]{3})[- ](\d{2})$/;
  const match2 = s.match(monthYear2DigitRegex);
  if (match2) {
    return `${match2[1]} 20${match2[2]}`;
  }

  // Handle "MMM-YYYY" or "MMM YYYY" (e.g. Oct-2022, Oct 2022)
  const monthYear4DigitRegex = /^([A-Za-z]{3})[- ](\d{4})$/;
  const match4 = s.match(monthYear4DigitRegex);
  if (match4) {
    return `${match4[1]} ${match4[2]}`;
  }

  // Handle standalone 2-digit year (e.g. "22")
  if (/^\d{2}$/.test(s)) {
    return `20${s}`;
  }
  
  return s;
}

// ═══════════════════════════════════════════════════════════════
// CONCIERGE BRIDGE — Prompt Generator & Card Renderer
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a Master Cleaning Prompt for the Concierge Bridge (v5.0).
 * Designed to be pasted into Gemini alongside the XLSX file attachment.
 */
function generateBridgePrompt() {
  return `I am uploading a Student Ledger XLSX.

CRITICAL INSTRUCTION: Use your Python tool to analyze the file first. Do not generate data from memory or provide examples. If no file is attached, ask me to upload it.

TASK: Extract the complete financial history and categorize all transactions for every student in the spreadsheet.

STRICT PROGRAM NORMALIZATION:
- The 'S' Rule: If a program name starts with the letter 'S' (e.g., SIUC, Spec Dip, s, SIUC & Spec), normalize it to 'SIUC'.
- The 'T' Rule: If a program name starts with the letter 'T' (e.g., Twintech, twin dip, T, T-Dip), normalize it to 'TWINTECH'.
- Others: Keep all other program names exactly as they appear.
- Note: Ignore case sensitivity for these rules.

EXTRACTION & CATEGORIZATION RULES:
1. Identity: Capture name, program, intake, and completion.
2. New Student Detection: If a student has registration details but zero payment history in the ledger, set "is_new": true. Otherwise, set it to false.
3. Transaction Ledger: Scan the columns 'REG.FEES', 'SEM 1', 'SEM 2', 'SEM 3', and 'COMM'. Every payment or fee found must be an individual object in a transactions array:
   - transactionType: Must be 'REGISTRATION', 'SEMESTER_PAYMENT', or 'COMMISSION_PAYOUT'.
   - category: 'REVENUE' for all fees; 'EXPENSE' for all commission payouts.
   - semester: Identify which semester column it came from (e.g., 'Sem 1', 'Sem 2').
   - amount: Extract as a clean number (remove RM and commas).
   - receipt_id: Extract the 4-digit code.
   - date: Convert to 'DD/MM/YYYY' format where possible.
   - recipient: (For commissions only) Extract the name like 'PREMA' or 'SATYA'.

FINANCIAL SANITIZER (NO ERRORS):
- No Concatenation: NEVER join a receipt ID and an amount (e.g., '0451 500' is NOT 451500). Treat them as two separate data points.
- Heuristics: Identify receipt IDs by their 4-digit length and sequential nature. Identify fees/payments by their standard magnitudes (e.g., 500, 700, 12500).

OUTPUT: Return ONLY a raw JSON array. No conversational text, no markdown code blocks, no explanations.

JSON SCHEMA:
{
  "name": string,
  "program": string,
  "is_new": boolean,
  "intake": string,
  "completion": string,
  "ledger": {
    "total_fees": number,
    "total_paid": number,
    "balance": number,
    "transactions": [
      {
        "transactionType": string,
        "category": string,
        "semester": string,
        "amount": number,
        "receipt_id": string,
        "date": string,
        "recipient": string
      }
    ]
  }
}`;
}

// Keywords that trigger the Bridge Card immediately (bypass local AI)
const IMPORT_KEYWORDS = ['import', 'upload', 'spreadsheet', 'xlsx', 'xls', 'excel', 'csv'];

function isImportMention(text) {
  const lower = (text || '').toLowerCase();
  return IMPORT_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Render the Bridge Card — 3-step glassmorphic guide.
 */
function renderBridgeCard(prompt, fileName) {
  // Escape for HTML attribute
  const escapedPrompt = prompt.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `
    <div class="bridge-card">
      <div class="bridge-card-body">
        <div class="bridge-step">
          <span class="bridge-step-num">1</span>
          <div class="bridge-step-content">
            <strong>Copy the Master Prompt below</strong>
            <p>This tells Gemini exactly how to extract your spreadsheet data.</p>
          </div>
        </div>
        <div class="bridge-prompt-box">
          <pre class="bridge-prompt-text" id="bridgePromptText">${escapedPrompt}</pre>
          <button class="bridge-copy-btn" onclick="window.copyBridgePrompt()" id="bridgeCopyBtn">
            📋 Copy Prompt
          </button>
        </div>
        <div class="bridge-step">
          <span class="bridge-step-num">2</span>
          <div class="bridge-step-content">
            <strong>Paste into Gemini + attach your file</strong>
            <p>Go to <a href="#" onclick="window.electronAPI.openExternal('https://gemini.google.com'); return false;">gemini.google.com</a>, paste the prompt, then attach your .xlsx file using the 📎 icon.</p>
          </div>
        </div>
        <div class="bridge-step">
          <span class="bridge-step-num">3</span>
          <div class="bridge-step-content">
            <strong>Paste the results back here</strong>
            <p>Copy Gemini's response and paste it into this chat. I'll preview all changes before applying them to your records.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Direct-to-Preview: Parse JSON pasted by user, build update plan.
 * Supports v5.0 nested ledger schema with typed transactions.
 * Returns null if text is not valid student JSON.
 */
async function parseDirectJSON(text) {
  const trimmed = text.trim();
  // Must start with [ or {
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null;

  // Strip markdown code fences if present
  let jsonStr = trimmed;
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    // Try to repair common issues
    try {
      // Remove trailing commas
      const repaired = jsonStr.replace(/,\s*([\]}])/g, '$1');
      data = JSON.parse(repaired);
    } catch (e2) {
      return null;
    }
  }

  // Normalize to array
  if (!Array.isArray(data)) data = [data];
  if (data.length === 0) return null;

  // Validate: must have student-related fields
  const studentFields = ['name', 'student', 'student_name', 'nama'];
  const first = data[0];
  const keys = Object.keys(first).map(k => k.toLowerCase());
  const hasName = studentFields.some(f => keys.includes(f));
  if (!hasName) return null;

  // Build update plan by fuzzy-matching to DB
  const dbStudents = await Student.findAll() || [];
  const updates = [];
  const unmatched = [];

  for (const record of data) {
    // Find the name field (flexible key matching)
    const nameKey = Object.keys(record).find(k =>
      ['name', 'student', 'student_name', 'nama'].includes(k.toLowerCase())
    );
    const rawName = (record[nameKey] || '').trim();
    if (!rawName) continue;

    const match = fuzzyMatchStudent(rawName, dbStudents);
    
    // NEW logic: If no match, treat as new student
    const isNew = record.is_new === true || !match;
    const student = match ? match.student : { name: rawName };
    const matchScore = match ? match.score : 0;

    // Map JSON fields to DB schema
    const changes = {};
    const conflicts = [];
    const warnings = [];

    if (isNew) changes.is_new = true;

    // ─── v5.0: Flatten nested `ledger` object ───────────────
    const ledger = record.ledger || {};
    const flatRecord = { ...record };
    // Surface ledger-level totals to top-level for field mapping
    if (ledger.total_fees !== undefined) flatRecord.total_fees = ledger.total_fees;
    if (ledger.total_paid !== undefined) flatRecord.total_paid = ledger.total_paid;
    if (ledger.balance !== undefined) flatRecord.balance = ledger.balance;

    // Flatten nested summary if present (legacy v4)
    if (record.summary && typeof record.summary === 'object') {
      Object.entries(record.summary).forEach(([k, v]) => {
        flatRecord[k] = v;
      });
    }

    // ─── v5.0: Map transactions from ledger.transactions (primary) or record.transactions (legacy) ───
    const rawTransactions = ledger.transactions || record.transactions || [];
    if (Array.isArray(rawTransactions) && rawTransactions.length > 0) {
      changes._payments = rawTransactions.map(t => {
        const amt = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '').replace(/[RM,\s]/g, ''));
        return {
          transactionType: t.transactionType || t.type || 'SEMESTER_PAYMENT',
          category: t.category || (t.transactionType === 'COMMISSION_PAYOUT' || t.type === 'COMMISSION_PAYOUT' ? 'EXPENSE' : 'REVENUE'),
          amount: isNaN(amt) ? 0 : amt,
          receipt: t.receipt_id || t.receipt || '',
          date: t.date || '',
          sem: t.semester || '',
          recipient: t.recipient || ''
        };
      });
    }

    // Field mapping: JSON key → DB field
    const fieldMap = {
      'intake': 'intake', 'intake_date': 'intake', 'start_date': 'intake',
      'completion': 'completionDate', 'completion_date': 'completionDate', 'end_date': 'completionDate',
      'program': 'program', 'programme': 'program', 'course': 'program',
      'total_fees': 'totalFees', 'fees': 'totalFees', 'fee': 'totalFees',
      'total_paid': '_totalPaid', 'balance': '_balance'
    };

    for (const [jsonKey, value] of Object.entries(flatRecord)) {
      if (value === null || value === undefined || value === '') continue;
      const lk = jsonKey.toLowerCase();
      // Skip name key, nested objects we've already processed, and internal fields
      if (lk === nameKey?.toLowerCase() || lk === 'transactions' || lk === 'ledger' || lk === 'summary' || lk === 'is_new') continue;

      const dbField = fieldMap[lk];
      if (!dbField) continue;

      // Financial fields → number
      if (['totalFees', 'registrationFee', '_totalPaid', '_balance'].includes(dbField)) {
        const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[RM,\s]/g, ''));
        if (!isNaN(num)) {
          if (dbField.startsWith('_')) {
            changes[dbField] = num;
          } else {
            const current = isNew ? 0 : (student[dbField] || 0);
            if (!isNew && current && Math.abs(current - num) > 0.1) {
              conflicts.push({ field: dbField, current: `RM${current}`, proposed: `RM${num}` });
            }
            changes[dbField] = num;
          }
        }
        continue;
      }

      // String fields (dates, program)
      const strVal = String(value).trim();
      if (strVal) {
        const current = isNew ? '' : (student[dbField] || '');
        if (!isNew && current && current !== strVal) {
          conflicts.push({ field: dbField, current, proposed: strVal });
        }
        changes[dbField] = strVal;
      }
    }

    if (Object.keys(changes).length > 0) {
      updates.push({
        student,
        matchScore,
        xlsName: rawName,
        changes,
        conflicts,
        warnings,
        isNew
      });
    }
  }

  if (updates.length === 0 && unmatched.length === 0) return null;

  return { updates, unmatched };
}

/**
 * Render the Diff View staging table.
 * Shows Current Value vs Proposed Value per field.
 * Conflicts (overwriting existing data) are highlighted in muted coral.
 * Column headers have ignore toggles.
 */
function renderStagingTable(updates) {
  if (!updates || updates.length === 0) return '';

  // Collect all unique field names across updates, excluding ignored
  const allFields = new Set();
  for (const { changes } of updates) {
    for (const field of Object.keys(changes)) {
      if (!field.startsWith('_') && !chatState.ignoredColumns.has(field)) allFields.add(field);
    }
    // Add Ledger column if internal totals or payments exist
    if (changes._totalPaid !== undefined || changes._payments?.length > 0) allFields.add('_ledgerSummary');
  }
  const fields = Array.from(allFields);

  const fieldLabel = (f) => {
    const labels = {
      intake: 'Intake', completionDate: 'Completion', program: 'Program',
      totalFees: 'Total Fees', commission: 'Commission', registrationFee: 'Reg. Fee',
      semester: 'Semester', _ledgerSummary: 'Ledger Summary'
    };
    return labels[f] || (f.startsWith('_') ? f.slice(1) : f.charAt(0).toUpperCase() + f.slice(1));
  };

  const formatValue = (field, val) => {
    if (field === 'commission' && typeof val === 'object') {
      const parts = [];
      if (val.recipient) parts.push(val.recipient);
      parts.push(`RM${val.amount}`);
      if (val.warning) parts.push('⚠️');
      return parts.join(' — ');
    }
    if (field === '_ledgerSummary') {
      const u = val; // We pass the whole change object for summary
      const parts = [];
      if (u._payments?.length > 0) {
        // v5.0: Show typed transaction counts
        const payments = u._payments.filter(p => (p.transactionType || p.type) !== 'COMMISSION_PAYOUT');
        const commissions = u._payments.filter(p => (p.transactionType || p.type) === 'COMMISSION_PAYOUT');
        if (payments.length > 0) parts.push(`+${payments.length} Payment${payments.length > 1 ? 's' : ''}`);
        if (commissions.length > 0) parts.push(`+${commissions.length} Commission`);
      }
      if (u._totalPaid !== undefined) parts.push(`Paid: RM${u._totalPaid}`);
      if (u._balance !== undefined) parts.push(`Bal: RM${u._balance}`);
      return parts.join(' | ') || '-';
    }
    if (field === 'totalFees' || field === 'registrationFee' || field === '_totalPaid' || field === '_balance') return `RM${val}`;
    return String(val || '-');
  };

  return `
    <div class="staging-table-wrapper">
      <table class="staging-table">
        <thead>
          <tr>
            <th>Match</th>
            <th>Student</th>
            ${fields.map(f => `
              <th>
                <div class="staging-col-header">
                  <span>${fieldLabel(f)}</span>
                  <label class="staging-ignore-toggle" title="Ignore this column">
                    <input type="checkbox" data-ignore-field="${f}" />
                    <span class="staging-ignore-label">Ignore</span>
                  </label>
                </div>
              </th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          ${updates.map((u, rowIdx) => {
            const confidence = u.matchScore >= 90 ? '✅' : u.matchScore >= 70 ? '🟡' : '🔴';
            const conflictFields = new Set((u.conflicts || []).map(c => c.field));
            const warningFields = new Set((u.warnings || []).map(w => w.field));

            return `
              <tr>
                <td>${u.isNew ? '✨' : confidence}</td>
                <td title="Spreadsheet: ${u.xlsName}">${u.isNew ? `<span class="staging-new-label">NEW</span> ${u.student.name}` : u.student.name}</td>
                ${fields.map(f => {
                  const val = f === '_ledgerSummary' ? u.changes : u.changes[f];
                  if (val === undefined || (f === '_ledgerSummary' && !val._payments?.length && val._totalPaid === undefined)) {
                    return '<td class="staging-empty">—</td>';
                  }

                  const display = formatValue(f, val);
                  const currentVal = u.student[f];
                  const currentDisplay = currentVal ? String(currentVal) : '(empty)';
                  const isConflict = conflictFields.has(f);
                  const isWarning = warningFields.has(f);

                  const cellClass = [
                    'staging-editable',
                    isConflict ? 'staging-conflict' : '',
                    isWarning ? 'staging-warning' : ''
                  ].filter(Boolean).join(' ');

                  return `<td class="${cellClass}" data-row="${rowIdx}" data-field="${f}" title="Double-click to edit">
                    <div class="staging-diff">
                      <span class="staging-current">${currentDisplay}</span>
                      <span class="staging-arrow">→</span>
                      <span class="staging-proposed">${display}</span>
                    </div>
                  </td>`;
                }).join('')}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      <div class="staging-hint">💡 Double-click any value to edit · Check "Ignore" to skip a column</div>
    </div>
  `;
}

function renderMessages() {
  const today = formatDate(new Date(), 'long');
  return `
    <div class="chat-date-separator">${today}</div>

    ${chatState.messages.map((msg, index) => {
      let content = parseMarkdown(msg.text);
      
      // WhatsApp-style file bubble
      if (msg.file) {
        const fileHtml = `
          <div class="ai-file-bubble">
            <div class="ai-file-icon">${Icons.paperclip}</div>
            <div class="ai-file-info">
              <span class="ai-file-name">${msg.file.name}</span>
              <span class="ai-file-type">${msg.file.type || 'DOCUMENT'}</span>
            </div>
          </div>
        `;
        content = `${fileHtml}<div>${content}</div>`;
      }

      // Success Badge
      if (msg.actionResult) {
        content += `
          <div class="ai-status-badge">
            <span class="ai-status-icon">${Icons.check}</span>
            <span>${msg.actionResult}</span>
          </div>
        `;
      }

      // Confirmation UI for proposals
      if (msg.proposal) {
        content += `
          <div class="ai-action-row">
            <button class="ai-action-btn confirm" onclick="window.confirmAiProposal(${index})">Confirm</button>
            <button class="ai-action-btn cancel" onclick="window.cancelAiProposal(${index})">Cancel</button>
          </div>
        `;
      }

      // Smart XLSX Preview — render editable staging table + Apply/Cancel
      if (msg.isPreview && chatState.pendingUpdatePlan) {
        content += renderStagingTable(chatState.pendingUpdatePlan);
        content += `
          <div class="ai-action-row">
            <button class="ai-action-btn confirm" onclick="window.applyXLSXPlan()">✅ Apply Changes</button>
            <button class="ai-action-btn cancel" onclick="window.cancelXLSXPlan(${index})">❌ Cancel</button>
          </div>
        `;
      }

      // Bridge Card
      if (msg.isBridgeCard && msg.bridgePrompt) {
        content += renderBridgeCard(msg.bridgePrompt, msg.bridgeFile || 'Spreadsheet');
      }

      // Antigravity-style Undo/Edit icon inside user bubble
      let undoIconHtml = '';
      if (msg.role === 'user' && msg.canUndo) {
        undoIconHtml = `
          <button class="ai-undo-edit-btn" onclick="window.undoAiAction(${index})" title="Undo and Edit">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"></path><path d="M4 9h12a5 5 0 0 1 5 5v3"></path></svg>
          </button>
        `;
      }

      return `
        <div class="ai-chat-message ${msg.role}">
          ${undoIconHtml}
          ${content}
        </div>
      `;
    }).join('')}
    
    ${chatState.isTyping ? `
      <div class="ai-chat-message assistant">
        <div class="typing-indicator">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      </div>
    ` : ''}
  `;
}

function renderInputAreaContent() {
  return `
    ${chatState.attachedFile ? `
      <div class="file-preview-pill">
        <span class="file-icon">${Icons.paperclip}</span>
        <span class="file-name">${chatState.attachedFile.name}</span>
        <button class="remove-file-btn" id="removeAttachedFile">${Icons.close}</button>
      </div>
    ` : ''}
    <div class="whatsapp-input-row">
      <div class="pill-input-container">
        <button class="attach-btn" id="attachFileBtn" title="Attach File">${Icons.paperclip}</button>
        <textarea id="aiChatInput" placeholder="Enter message..." autocomplete="off" spellcheck="true" autocorrect="on" rows="1">${chatState.draftMessage || ''}</textarea>
        <input type="file" id="aiChatFileInput" style="display: none;" />
      </div>
      <button id="sendAiQuery" class="circular-send-btn" ${chatState.isTyping ? 'disabled' : ''}>
        ${Icons.send}
      </button>
    </div>
  `;
}

export function renderAiChat() {
  const { right, bottom } = chatState.position;
  const { width, height } = chatState.dimensions;

  const rVal = parseInt(right);
  const bVal = parseInt(bottom);
  const wVal = parseInt(width);
  const hVal = parseInt(height);

  if (!chatState.isOpen) {
    const toggleStyle = `right: ${right}; bottom: ${bottom};`;
    return `
      <button class="ai-chat-toggle" id="toggleAiChat" style="${toggleStyle}" title="Ask Assistant">
        <img src="${aiBirdLogo}" class="ai-bird-icon" alt="AI" />
      </button>
    `;
  }

  // Center-aware positioning
  const screenCenterX = window.innerWidth / 2;
  const screenCenterY = window.innerHeight / 2;
  const birdCX = window.innerWidth - rVal - 25;
  const birdCY = window.innerHeight - bVal - 25;

  let finalRight = rVal;
  let finalBottom = bVal;

  if (birdCX < screenCenterX) finalRight = Math.max(20, rVal - wVal + 60); 
  if (birdCY < screenCenterY) finalBottom = Math.max(20, bVal - hVal + 60);

  finalRight = Math.max(20, Math.min(finalRight, window.innerWidth - wVal - 20));
  finalBottom = Math.max(20, Math.min(finalBottom, window.innerHeight - hVal - 20));

  const style = `right: ${finalRight}px; bottom: ${finalBottom}px; width: ${width}; height: ${height};`;

  return `
    <div class="ai-chat-container" id="aiChatContainer" style="${style}">
      <div class="chat-header" id="aiChatHeader">
        <div class="header-info">
          <div class="chatbot-icon">
            <img src="${aiBirdLogo}" class="ai-bird-small" alt="AI" />
          </div>
          <div class="header-content">
            <h3>Smart Assistant <span id="aiStatusDot" class="ai-status-dot" title="Checking...">⏳</span></h3>
          </div>
        </div>
        <div class="header-actions">
          <button id="refreshAiChat" class="btn-action" title="Clear Chat">
            ${Icons.trash}
          </button>
          <button id="closeAiChat" class="btn-action btn-close" title="Minimize Chat">
            ${Icons.close}
          </button>
        </div>
      </div>
      
      <div class="chat-messages" id="chatMessages">
        ${renderMessages()}
        <div id="streamingMsg" class="message assistant streaming-msg" style="display:none">
          <div class="message-bubble"><span id="streamingText"></span><span class="streaming-cursor"></span></div>
        </div>
      </div>
      
      <div class="chat-input-area" id="chatInputArea">
        ${renderInputAreaContent()}
      </div>
      
      <div class="chat-resizer resizer-t" data-dir="t"></div>
      <div class="chat-resizer resizer-b" data-dir="b"></div>
      <div class="chat-resizer resizer-l" data-dir="l"></div>
      <div class="chat-resizer resizer-r" data-dir="r"></div>
      <div class="chat-resizer resizer-tl" data-dir="tl"></div>
      <div class="chat-resizer resizer-tr" data-dir="tr"></div>
      <div class="chat-resizer resizer-bl" data-dir="bl"></div>
      <div class="chat-resizer resizer-br" data-dir="br"></div>
    </div>
  `;
}

export function initAiChat() {
  const root = document.getElementById('aiChatRoot');
  if (!root) return;

  const existingContainer = document.getElementById('aiChatContainer');
  const existingToggle = document.getElementById('toggleAiChat');

  // If already open, just update the dynamic parts (messages & input)
  if (chatState.isOpen && existingContainer) {
    const msgContainer = document.getElementById('chatMessages');
    const inputArea = document.getElementById('chatInputArea');
    if (msgContainer) {
      msgContainer.innerHTML = renderMessages() + 
        `<div id="streamingMsg" class="message assistant streaming-msg" style="display:none">
          <div class="message-bubble"><span id="streamingText"></span><span class="streaming-cursor">\u258a</span></div>
        </div>`;
    }
    if (inputArea) inputArea.innerHTML = renderInputAreaContent();
    
    // Update AI status dot
    updateStatusDot();
    scrollToBottom();
    bindInnerListeners(); // Only bind listeners for dynamic content
    return;
  }

  // Full re-render (Initial open or closing)
  root.innerHTML = renderAiChat();

  // Update AI status dot AFTER it's in the DOM
  updateStatusDot();

  const toggleBtn = document.getElementById('toggleAiChat');
  const chatHeader = document.getElementById('aiChatHeader');
  const resizers = document.querySelectorAll('.chat-resizer');
  
  if (toggleBtn) {
    initDraggable(toggleBtn);
    toggleBtn.addEventListener('click', (e) => {
      if (toggleBtn.dataset.dragging === 'true') return;
      chatState.isOpen = true;
      initAiChat();
    });
  }

  if (chatHeader) {
    const chatContainer = document.getElementById('aiChatContainer');
    initDraggable(chatHeader, chatContainer);
  }

  resizers.forEach(resizer => {
    const chatContainer = document.getElementById('aiChatContainer');
    initResizable(resizer, chatContainer);
  });

  const refreshBtn = document.getElementById('refreshAiChat');
  if (refreshBtn) {
    refreshBtn.onclick = () => {
      chatState.messages = [{ role: 'assistant', text: 'Hello! I am your Smart Assistant. Ask me anything about your student records or financial data.' }];
      saveMessages();
      aiService.clearHistory(); // Also clear Gemini's conversation memory
      initAiChat();
    };
  }

  const closeBtn = document.getElementById('closeAiChat');
  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      chatState.isOpen = false;
      initAiChat();
    };
  }

  // Listen for real-time status updates from aiService
  if (!window.hasOllamaStatusListener) {
    window.addEventListener('ollama-status-update', () => {
      initAiChat();
    });
    window.hasOllamaStatusListener = true;
  }

  bindInnerListeners();
}

/**
 * Consolidated status dot updater — handles both Electron and browser modes.
 */
function updateStatusDot() {
  const statusDot = document.getElementById('aiStatusDot');
  if (!statusDot) return;

  if (aiService.ollamaReady) {
    statusDot.textContent = '🟢';
    statusDot.title = 'AI Ready (Offline)';
    return;
  }

  // Electron mode: ask for actual status
  if (window.electronAPI?.ollama?.getStatus) {
    window.electronAPI.ollama.getStatus().then(s => {
      if (s.status === 'ready') {
        statusDot.textContent = '🟢';
        statusDot.title = 'AI Ready (Offline)';
      } else if (s.status === 'error' || s.status === 'stopped') {
        statusDot.textContent = '🔴';
        statusDot.title = `AI Offline (${s.status})`;
      } else {
        statusDot.textContent = '🟡';
        statusDot.title = `AI Loading (${s.status})...`;
      }
    }).catch(() => {
      statusDot.textContent = '🟡';
      statusDot.title = 'AI Status Unknown';
    });
  } else {
    // Browser dev mode: try a quick health check
    fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2000) })
      .then(r => r.ok ? '🟢' : '🔴')
      .then(dot => { statusDot.textContent = dot; statusDot.title = dot === '🟢' ? 'AI Ready' : 'AI Offline'; })
      .catch(() => { statusDot.textContent = '🔴'; statusDot.title = 'AI Offline'; });
  }
}

function bindInnerListeners() {
  // Attachment Button
  const attachBtn = document.getElementById('attachFileBtn');
  const fileInput = document.getElementById('aiChatFileInput');
  if (attachBtn && fileInput) {
    attachBtn.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      if (e.target.files.length > 0) {
        chatState.attachedFile = e.target.files[0];
        initAiChat();
      }
    };
  }

  const removeFileBtn = document.getElementById('removeAttachedFile');
  if (removeFileBtn) {
    removeFileBtn.onclick = () => {
      chatState.attachedFile = null;
      if (fileInput) fileInput.value = '';
      initAiChat();
    };
  }

  // ─── STAGING TABLE: Double-click to edit cell ───
  const stagingCells = document.querySelectorAll('.staging-editable');
  stagingCells.forEach(cell => {
    cell.addEventListener('dblclick', () => {
      if (cell.querySelector('input')) return;

      const rowIdx = parseInt(cell.dataset.row);
      const field = cell.dataset.field;
      const update = chatState.pendingUpdatePlan?.[rowIdx];
      if (!update) return;

      const currentVal = update.changes[field];
      const editVal = (typeof currentVal === 'object' && currentVal?.amount)
        ? currentVal.amount
        : (currentVal ?? '');

      const input = document.createElement('input');
      input.type = 'text';
      input.value = editVal;
      input.className = 'staging-cell-input';
      input.style.cssText = 'width:100%;padding:2px 4px;font-size:inherit;border:1px solid var(--primary);border-radius:4px;background:var(--bg-secondary);color:inherit;';

      const originalHTML = cell.innerHTML;
      cell.innerHTML = '';
      cell.appendChild(input);
      input.focus();
      input.select();

      const commit = () => {
        const newVal = input.value.trim();
        if (!newVal) {
          delete update.changes[field];
        } else if (field === 'commission' && typeof currentVal === 'object') {
          update.changes[field] = { ...currentVal, amount: parseFloat(newVal) || 0 };
        } else if (field === 'totalFees' || field === 'registrationFee') {
          update.changes[field] = parseFloat(newVal.replace(/[RM,\s]/g, '')) || 0;
        } else {
          update.changes[field] = newVal;
        }
        initAiChat();
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { cell.innerHTML = originalHTML; }
      });
    });
  });

  // ─── STAGING TABLE: Column ignore toggles ───
  const ignoreToggles = document.querySelectorAll('[data-ignore-field]');
  ignoreToggles.forEach(cb => {
    cb.addEventListener('change', () => {
      const field = cb.dataset.ignoreField;
      if (cb.checked) {
        chatState.ignoredColumns.add(field);
      } else {
        chatState.ignoredColumns.delete(field);
      }
      initAiChat(); // Re-render to hide/show the column
    });
  });

  setupInputListeners();
}

function initDraggable(handle, target = handle) {
  let isDragging = false;
  let startX, startY, startRight, startBottom;
  let animationFrame;

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button') && e.target.closest('button').id !== 'toggleAiChat') return;
    
    startX = e.clientX;
    startY = e.clientY;
    
    const computed = window.getComputedStyle(target);
    startRight = parseInt(computed.right);
    startBottom = parseInt(computed.bottom);

    isDragging = false;
    handle.dataset.dragging = 'false';

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  };

  const onMouseMove = (e) => {
    const deltaX = startX - e.clientX;
    const deltaY = startY - e.clientY;

    if (!isDragging && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
      isDragging = true;
      handle.dataset.dragging = 'true';
    }

    if (isDragging) {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const newRight = startRight + deltaX;
        const newBottom = startBottom + deltaY;
        
        const clampedRight = Math.max(10, Math.min(window.innerWidth - target.offsetWidth - 10, newRight));
        const clampedBottom = Math.max(10, Math.min(window.innerHeight - target.offsetHeight - 10, newBottom));

        chatState.position = { 
          right: `${clampedRight}px`, 
          bottom: `${clampedBottom}px` 
        };
        
        target.style.right = chatState.position.right;
        target.style.bottom = chatState.position.bottom;
      });
    }
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    if (isDragging) {
      saveState();
      setTimeout(() => { handle.dataset.dragging = 'false'; }, 50);
    }
    if (animationFrame) cancelAnimationFrame(animationFrame);
  };

  handle.addEventListener('mousedown', onMouseDown);
}

function initResizable(handle, target) {
  let isResizing = false;
  let startX, startY, startWidth, startHeight, startRight, startBottom;
  let animationFrame;
  const dir = handle.dataset.dir;

  const onMouseDown = (e) => {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startWidth = target.offsetWidth;
    startHeight = target.offsetHeight;
    
    const computed = window.getComputedStyle(target);
    startRight = parseInt(computed.right);
    startBottom = parseInt(computed.bottom);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
    e.stopPropagation();
  };

  const onMouseMove = (e) => {
    if (!isResizing) return;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(() => {
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newRight = startRight;
      let newBottom = startBottom;

      // Vertical
      if (dir.includes('t')) {
        newHeight = startHeight - deltaY;
      } else if (dir.includes('b')) {
        newHeight = startHeight + deltaY;
        newBottom = startBottom - deltaY;
      }

      // Horizontal
      if (dir.includes('l')) {
        newWidth = startWidth - deltaX;
      } else if (dir.includes('r')) {
        newWidth = startWidth + deltaX;
        newRight = startRight - deltaX;
      }

      // Clamping
      newWidth = Math.max(300, Math.min(window.innerWidth - 40, newWidth));
      newHeight = Math.max(400, Math.min(window.innerHeight - 40, newHeight));

      chatState.dimensions = { width: `${newWidth}px`, height: `${newHeight}px` };
      chatState.position = { right: `${newRight}px`, bottom: `${newBottom}px` };

      target.style.width = chatState.dimensions.width;
      target.style.height = chatState.dimensions.height;
      target.style.right = chatState.position.right;
      target.style.bottom = chatState.position.bottom;
    });
  };

  const onMouseUp = () => {
    if (isResizing) {
      isResizing = false;
      saveState();
    }
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    if (animationFrame) cancelAnimationFrame(animationFrame);
  };

  handle.addEventListener('mousedown', onMouseDown);
}

function saveState() {
  localStorage.setItem('ai-chat-state', JSON.stringify({
    position: chatState.position,
    dimensions: chatState.dimensions
  }));
}

function setupInputListeners() {
  const sendBtn = document.getElementById('sendAiQuery');
  const input = document.getElementById('aiChatInput');

  if (sendBtn && input) {
    const handleSend = async () => {
      const text = input.value.trim();
      const file = chatState.attachedFile;
      
      if (!text && !file || chatState.isTyping) return;

      // Clear draft on send
      chatState.draftMessage = '';

      let displayMessage = text;
      const messageObj = { 
        role: 'user', 
        text: displayMessage, 
        originalText: text,
        canUndo: true // Universal Edit Support
      };
      if (file) {
        messageObj.file = { name: file.name, type: file.name.split('.').pop().toUpperCase() };
      }

      chatState.messages.push(messageObj);
      saveMessages();
      
      chatState.isTyping = true;
      chatState.attachedFile = null;
      
      const fileInput = document.getElementById('aiChatFileInput');
      if (fileInput) fileInput.value = '';

      input.value = '';

      initAiChat();

      // --- SMOOTH TYPEWRITER STREAMING ---
      const streamingMsg = document.getElementById('streamingMsg');
      const streamingText = document.getElementById('streamingText');
      if (streamingMsg && streamingText) {
        streamingMsg.style.display = 'none'; // Keep hidden until first token
        streamingText.textContent = '';
      }

      let tokenQueue = [];
      let isTypingActive = true;
      let typewriterSpeed = 30; // ms per token piece

      const runTypewriter = () => {
        if (!isTypingActive && tokenQueue.length === 0) return;

        if (tokenQueue.length > 0) {
          // Switch from dots to stream on first token
          if (streamingMsg && streamingMsg.style.display === 'none') {
            streamingMsg.style.display = 'flex';
            // Instantly hide the typing indicator dots
            const dots = document.querySelector('.typing-indicator');
            if (dots) dots.parentElement.style.display = 'none';
          }

          const token = tokenQueue.shift();
          if (streamingText) {
            streamingText.textContent += token;
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
          }

          // Adaptive speed: go faster if the model is bursting, but never "flash"
          const currentSpeed = tokenQueue.length > 100 ? 2 : tokenQueue.length > 40 ? 10 : 25;
          setTimeout(runTypewriter, currentSpeed);
        } else {
          // Wait for more tokens
          setTimeout(runTypewriter, 50);
        }
      };

      const unsubStream = aiService.onToken((token) => {
        // Split token into smaller chunks if it's too large (bursts) to keep typewriter smooth
        if (token.length > 5) {
          for (let i = 0; i < token.length; i += 2) {
            tokenQueue.push(token.substring(i, i + 2));
          }
        } else {
          tokenQueue.push(token);
        }
      });

      // Start the typewriter engine
      runTypewriter();
      // --- END SMOOTH STREAMING ---
      scrollToBottom();

      try {
        // Prepare attachment if exists
        let attachment = null;
        let fileTextContent = null;
        let xlsxWorkbook = null; // Keep workbook for Smart Processor
        if (file) {
          try {
            const ext = file.name.split('.').pop().toLowerCase();
            const isSpreadsheet = ['xlsx', 'xls', 'csv'].includes(ext);

            if (isSpreadsheet) {
              const arrayBuffer = await file.arrayBuffer();
              const ExcelJS = await getExcelJS();
              xlsxWorkbook = new ExcelJS.Workbook();
              await xlsxWorkbook.xlsx.load(arrayBuffer);
              const allSheets = xlsxWorkbook.worksheets.map(ws => {
                let csv = '';
                ws.eachRow((row) => {
                  csv += row.values.slice(1).map(cell => {
                    if (cell && typeof cell === 'object') {
                      if (cell.text !== undefined) return cell.text;
                      if (cell.result !== undefined) return cell.result;
                    }
                    return cell ?? '';
                  }).join(',') + '\n';
                });
                return `--- Sheet: ${ws.name} ---\n${csv}`;
              }).join('\n\n');
              fileTextContent = allSheets;
            } else {
              // For images, PDFs etc — send as base64 inline data
              const base64Data = await readFileAsBase64(file);
              attachment = {
                mimeType: file.type || 'application/octet-stream',
                base64: base64Data.split(',')[1]
              };
            }
          } catch (readErr) {
            console.error("File read error:", readErr);
            chatState.messages.push({ role: 'assistant', text: "I couldn't read the attached file. Please try again." });
            saveMessages();
            return;
          }
        }

        // ─── INSTRUCTION STACK: Parse user rules ────────────────
        const lowerText = (text || '').toLowerCase();
        const ignoreMatch = lowerText.match(/ignore\s+(\w+)(?:\s+changes?)?/i);
        if (ignoreMatch) {
          const field = ignoreMatch[1].toLowerCase();
          // Map common words to field names
          const fieldMap = {
            'program': 'program', 'programme': 'program',
            'intake': 'intake', 'completion': 'completionDate',
            'fees': 'totalFees', 'commission': 'commission',
            'registration': 'registrationFee'
          };
          const mapped = fieldMap[field] || field;
          chatState.ignoredColumns.add(mapped);
          chatState.instructionStack.push(`ignore ${mapped}`);
          chatState.messages.push({
            role: 'assistant',
            text: `✅ Got it — I'll ignore **${mapped}** changes for the rest of this session.\n\nActive rules: ${chatState.instructionStack.map(r => `\`${r}\``).join(', ')}`
          });
          saveMessages();
          chatState.isTyping = false;
          unsubStream();
          if (streamingMsg) streamingMsg.style.display = 'none';
          initAiChat();
          return;
        }
        // ─── END INSTRUCTION STACK ────────────────────────────

        // ─── DIRECT-TO-PREVIEW: Detect pasted JSON ───────────
        const trimmedText = (text || '').trim();
        if (trimmedText.startsWith('[') || trimmedText.startsWith('{')) {
          chatState.isTyping = false;
          unsubStream();
          if (streamingMsg) streamingMsg.style.display = 'none';

          try {
            const result = await parseDirectJSON(trimmedText);
            if (result) {
              const { updates, unmatched } = result;
              if (updates.length > 0) {
                chatState.pendingUpdatePlan = updates;

                const confLabel = { high: '🟢 High', medium: '🟡 Medium', low: '🔴 Low' };
                let previewText = `📋 Found **${updates.length} student(s)** to update:\n\n`;
                for (const u of updates) {
                  const conf = u.matchScore >= 90 ? '✅' : u.matchScore >= 70 ? '🟡' : '🔴';
                  const summaryParts = [];

                  // Show program if present
                  if (u.changes.program) {
                    const old = u.student.program || '(none)';
                    summaryParts.push(`Program → **${u.changes.program}**`);
                  }

                  // v5.0: Show typed transaction summary
                  if (u.changes._payments?.length > 0) {
                    const payments = u.changes._payments.filter(p => (p.transactionType || p.type) !== 'COMMISSION_PAYOUT');
                    const commissions = u.changes._payments.filter(p => (p.transactionType || p.type) === 'COMMISSION_PAYOUT');
                    if (payments.length > 0) summaryParts.push(`+${payments.length} Payment${payments.length > 1 ? 's' : ''}`);
                    if (commissions.length > 0) summaryParts.push(`+${commissions.length} Commission`);
                  }

                  // Other field changes (non-internal, non-program)
                  const otherChanges = Object.entries(u.changes)
                    .filter(([f]) => !f.startsWith('_') && f !== 'program' && f !== 'is_new')
                    .map(([f, v]) => {
                      const label = f === 'completionDate' ? 'Completion' : f === 'totalFees' ? 'Total Fees' : f.charAt(0).toUpperCase() + f.slice(1);
                      const display = (f === 'totalFees' || f === 'registrationFee') ? `RM${v}` : `**${v}**`;
                      return `${label}: ${display}`;
                    });
                  summaryParts.push(...otherChanges);

                  const conflictFlag = u.conflicts?.length > 0 ? ' 🔴' : '';
                  previewText += `${conf} **${u.student.name}**${conflictFlag}: ${summaryParts.join(', ')}\n`;
                }
                if (unmatched.length > 0) {
                  previewText += `\n⚠️ Not found: ${unmatched.join(', ')}`;
                }

                chatState.messages.push({ role: 'assistant', text: previewText, isPreview: true });
              } else {
                let msg = "I parsed the data but couldn't match any students to the database.";
                if (unmatched.length > 0) {
                  msg += `\n\nNames not found: ${unmatched.map(n => `• ${n}`).join('\n')}`;
                }
                chatState.messages.push({ role: 'assistant', text: msg });
              }
              saveMessages();
              initAiChat();
              return;
            }
          } catch (jsonErr) {
            console.warn('Direct JSON parse failed:', jsonErr);
            // STOP: Do NOT fall through to getInsights — the 3B model chokes on large JSON.
            chatState.messages.push({
              role: 'assistant',
              text: `⚠️ I couldn't parse that JSON. Please check the format and try again.\n\nError: ${jsonErr.message}`
            });
            saveMessages();
            initAiChat();
            return;
          }
        }
        // ─── END DIRECT-TO-PREVIEW ────────────────────────────

        // ─── CONCIERGE BRIDGE: Import mention OR file upload → Bridge Card ─────
        // Triggered by EITHER: (a) user mentions import keywords, OR (b) user uploads xlsx
        if (xlsxWorkbook || isImportMention(text)) {
          chatState.isTyping = false;
          unsubStream();
          if (streamingMsg) streamingMsg.style.display = 'none';

          try {
            // Generate the Gemini-optimized prompt
            const bridgePrompt = generateBridgePrompt();
            chatState.messages.push({
              role: 'assistant',
              text: `I've prepared a Master Cleaning Prompt for your spreadsheet. Follow the 3 steps below to get clean, structured data.`,
              isBridgeCard: true,
              bridgePrompt: bridgePrompt,
              bridgeFile: file?.name || 'Spreadsheet'
            });
          } catch (procErr) {
            console.error('Bridge prompt generation error:', procErr);
            chatState.messages.push({ role: 'assistant', text: `I had trouble generating the prompt: ${procErr.message}` });
          }

          saveMessages();
          initAiChat();
          return;
        }
        // ─── END CONCIERGE BRIDGE ─────────────────────────────

        // ALWAYS fetch DB context so AI can match spreadsheet data to real students
        let contextData = {};
        const students = await Student.findAll() || [];
        const payments = await Payment.findAll() || [];
        
        const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
        const totalExpected = students.reduce((sum, s) => sum + s.totalFees, 0);
        const allPrograms = [...new Set(students.map(s => s.program).filter(Boolean))];
        
        contextData = {
          summary: {
            totalStudents: students.length,
            totalCollected,
            outstanding: totalExpected - totalCollected,
            availablePrograms: allPrograms
          },
          // Give AI ALL student names so it can match spreadsheet rows
          students: students.map(s => ({
            name: s.name,
            studentId: s.studentId,
            program: s.program,
            intake: s.intake || '',
            completionDate: s.completionDate || '',
            status: s.status
          }))
        };


        // Get Live UI context
        const viewContext = getLiveContext();
        contextData.viewContext = viewContext;

        // Build the final prompt
        let promptText = text || "Analyze this attached file.";
        
        // If spreadsheet was converted to text, include it in the prompt
        if (fileTextContent) {
          promptText = `${promptText}\n\nHere is the spreadsheet data:\n${fileTextContent}`;
        }

        const response = await aiService.getInsights(promptText, contextData, attachment);
        
        // Link the user message to this incoming assistant message for Undo/Edit
        const lastUserIdx = chatState.messages.findLastIndex(m => m.role === 'user');
        if (lastUserIdx !== -1) {
          chatState.messages[lastUserIdx].linkedAssistantMsgIndex = chatState.messages.length;
        }
        
        // Signal typewriter that no more tokens are coming
        isTypingActive = false;

        // Wait for typewriter to finish its queue before finalizing re-render
        while (tokenQueue.length > 0) {
          await new Promise(r => setTimeout(r, 100));
        }

        // Stop typing indicator now that we have the full response
        chatState.isTyping = false;
        // Hide streaming display
        unsubStream();
        if (streamingMsg) streamingMsg.style.display = 'none';

        initAiChat();

        // --- ROBUST ACTION EXTRACTION (Hardened for qwen3:8b) ---
        let displayText = response || "I processed your request, but the response was empty.";
        let actions = [];
        let isProposal = false;

        /**
         * Attempt to repair truncated JSON (model hit token limit mid-output).
         * Closes unclosed brackets/braces and strips trailing commas.
         */
        function repairJSON(str) {
          let s = str.trim();
          // Strip trailing commas
          s = s.replace(/,\s*$/, '');
          // Count unmatched braces/brackets
          let braces = 0, brackets = 0;
          for (const ch of s) {
            if (ch === '{') braces++;
            else if (ch === '}') braces--;
            else if (ch === '[') brackets++;
            else if (ch === ']') brackets--;
          }
          // Close unmatched
          while (brackets > 0) { s += ']'; brackets--; }
          while (braces > 0) { s += '}'; braces--; }
          return s;
        }

        function safeParse(raw) {
          try {
            return JSON.parse(raw);
          } catch {
            try {
              return JSON.parse(repairJSON(raw));
            } catch {
              return null;
            }
          }
        }

        try {
          // Identify potential JSON blocks (:::ACTION_START::: ... :::ACTION_END::: or just { ... })
          const actionRegex = /:::ACTION_START:::([\s\S]*?)(:::ACTION_END:::|$)/gi;
          let match;
          let hasAnyAction = false;

          while ((match = actionRegex.exec(response)) !== null) {
            const rawJson = match[1].trim();
            if (!rawJson) continue;
            
            const actionData = safeParse(rawJson);
            if (actionData) {
              const extracted = Array.isArray(actionData) ? actionData : [actionData];
              // Validate: each action must have an 'action' field
              const valid = extracted.filter(a => a && typeof a.action === 'string');
              if (valid.length > 0) {
                actions.push(...valid);
                hasAnyAction = true;
              }
            } else {
              console.warn('Partial AI Action Parse Error: could not repair JSON');
            }
          }

          // Fallback: If no explicit tags, look for any JSON-like block if the AI mentioned actions
          if (!hasAnyAction && response.includes('{') && response.includes('action')) {
            const rawJsonMatch = response.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
            if (rawJsonMatch) {
              const actionData = safeParse(rawJsonMatch[0].trim());
              if (actionData) {
                const extracted = Array.isArray(actionData) ? actionData : [actionData];
                const valid = extracted.filter(a => a && typeof a.action === 'string');
                actions.push(...valid);
              }
            }
          }

          // Clean the display text (remove action tags + any leaked code/JSON)
          displayText = response
            .replace(/:::ACTION_START:::[\s\S]*?:::ACTION_END:::/gi, '')
            // Strip duplicated action tags
            .replace(/:::ACTION_START:::/gi, '')
            .replace(/:::ACTION_END:::/gi, '')
            // Strip markdown code blocks the model might leak (```json ... ``` etc.)
            .replace(/```[\s\S]*?```/g, '')
            // Strip raw JSON objects/arrays that shouldn't be user-visible
            .replace(/\{[\s\S]*?"action"[\s\S]*?\}/g, '')
            .replace(/\{[\s\S]*?"collection"[\s\S]*?\}/g, '')
            .trim();

          // FALLBACK: If the cleaning left us with an empty string (only actions were sent), 
          // we use a default confirmation so the bubble isn't empty.
          if (!displayText && actions.length > 0) {
            displayText = "Done! I've processed the updates.";
          }

          if (actions.length > 0) {
            isProposal = actions.some(a => a.propose);
            
            if (isProposal) {
              chatState.messages.push({ 
                role: 'assistant', 
                text: displayText || `I've prepared ${actions.length} action(s) for your review:`, 
                proposal: actions 
              });
              saveMessages();
              return;
            }

            // --- EXECUTE DIRECT ACTIONS (AUTO) ---
            const allStudentsBefore = await Student.findAll() || [];
            const globalSnapshot = JSON.parse(JSON.stringify(allStudentsBefore));
            let totalUpdated = 0;
            const touchedIds = new Set();
            let hasFailures = false;
            let errorCount = 0;

            for (const act of actions) {
              try {
                const res = await executeGeneralizedAction(act);
                if (res.undo && res.undo.touchedIds) {
                  res.undo.touchedIds.forEach(id => touchedIds.add(id));
                }
                totalUpdated += (parseInt(res.summary) || 0);
              } catch (eErr) {
                console.error("Single Action Execution Failure:", eErr);
                hasFailures = true;
                errorCount++;
              }
            }
            
            if (touchedIds.size > 0) {
              const combinedUndo = {
                collection: 'students',
                previousData: globalSnapshot.filter(s => touchedIds.has(String(s.id)))
              };
              if (lastUserIdx !== -1) chatState.messages[lastUserIdx].undoData = combinedUndo;
            }

            // FINAL FEEDBACK: Inform user about failures if they happened
            let finalNote = displayText;
            if (hasFailures) {
              const errorNote = `\n\n⚠️ Note: ${errorCount} action(s) could not be completed. Please check your spreadsheet's format or data consistency.`;
              finalNote = finalNote ? `${finalNote}${errorNote}` : errorNote.trim();
            }

            chatState.messages.push({ 
              role: 'assistant', 
              text: finalNote || `I've successfully updated ${totalUpdated} record(s).`,
              actionResult: totalUpdated > 0 ? `${totalUpdated} record(s) updated` : (hasFailures ? "Action failed" : null)
            });
            saveMessages();
            return;
          }
        } catch (masterErr) {
          console.error("Master Action Extraction Failure:", masterErr);
          // UI Safety: Fallback to showing raw text if parsing explodes
          displayText = response.replace(/:::ACTION_START:::|:::ACTION_END:::/gi, '');
        }
        
        // Final fallback: standard message delivery
        chatState.messages.push({ role: 'assistant', text: displayText });
        saveMessages();
      } catch (err) {
        console.error('AI Chat Error:', err);
        unsubStream();
        if (streamingMsg) streamingMsg.style.display = 'none';
        chatState.messages.push({ role: 'assistant', text: "I encountered an error. Please make sure Ollama is running and try again." });
        saveMessages();
      } finally {
        chatState.isTyping = false;
        initAiChat();
        scrollToBottom();
      }
    };

    // Helper to read file as Base64
    const readFileAsBase64 = (file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    };

    sendBtn.onclick = handleSend;
    input.onkeydown = (e) => { 
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend(); 
      }
    };
    
    // Auto-expand textarea
    input.oninput = () => {
      chatState.draftMessage = input.value; // Store draft for persistence
      input.style.height = 'auto';
      input.style.height = (input.scrollHeight) + 'px';
    };

    if (chatState.isOpen) input.focus();
  }
}

/**
 * GLOBAL ACTION HANDLERS
 */
window.confirmAiProposal = async (index) => {
  const msg = chatState.messages[index];
  if (!msg || !msg.proposal) return;
  
  const proposal = msg.proposal;
    msg.proposal = null; // Remove buttons
    initAiChat();
    
    try {
      chatState.isTyping = true;
      initAiChat();

      // Mark PREVIOUS user message as undoable BEFORE we try the action
      const userMsgIndex = chatState.messages.findLastIndex((m, i) => m.role === 'user' && i < index);
      if (userMsgIndex !== -1) {
        chatState.messages[userMsgIndex].canUndo = true;
        chatState.messages[userMsgIndex].linkedAssistantMsgIndex = index;
      }
      
      // CRITICAL: Take a GLOBAL snapshot of ALL students BEFORE any batch action executes.
      // This ensures Undo reverts to the TRUE original state, not an intermediate one.
      const allStudentsBefore = await Student.findAll() || [];
      const globalSnapshot = JSON.parse(JSON.stringify(allStudentsBefore));
      
      const actions = Array.isArray(proposal) ? proposal : [proposal];
      let totalUpdated = 0;
      const touchedIds = new Set(); // Track which students were touched across ALL actions

      for (const act of actions) {
        const res = await executeGeneralizedAction(act);
        // Collect all touched IDs
        if (res.undo && res.undo.touchedIds) {
          res.undo.touchedIds.forEach(id => touchedIds.add(id));
        }
        totalUpdated += (parseInt(res.summary) || 0);
      }
      
      // Build undo data from the GLOBAL pre-batch snapshot, filtered to only touched students
      const combinedUndo = {
        collection: 'students',
        previousData: globalSnapshot.filter(s => touchedIds.has(String(s.id)))
      };
      
      if (userMsgIndex !== -1) {
        chatState.messages[userMsgIndex].undoData = combinedUndo;
      }

      msg.actionResult = `${totalUpdated} record(s) updated`;
      saveMessages();
    } catch (err) {
    console.error("Action error:", err);
    chatState.messages.push({ role: 'assistant', text: `❌ I ran into an error: ${err.message}` });
  } finally {
    chatState.isTyping = false;
    initAiChat();
  }
};


window.cancelAiProposal = (index) => {
  if (chatState.messages[index]) {
    chatState.messages[index].proposal = null;
    chatState.messages[index].text += "\n\n(Action cancelled by user)";
    initAiChat();
    saveMessages();
  }
};

// ─── SMART XLSX PLAN HANDLERS ───────────────────────────────
window.applyXLSXPlan = async () => {
  if (!chatState.pendingUpdatePlan || chatState.pendingUpdatePlan.length === 0) return;

  const previewIdx = chatState.messages.findLastIndex(m => m.isPreview);
  if (previewIdx >= 0) {
    chatState.messages[previewIdx].isPreview = false;
  }

  try {
    const { successCount, errorCount } = await applyUpdatePlan(chatState.pendingUpdatePlan, chatState.ignoredColumns);

    let resultText = `✅ **${successCount} student(s)** updated successfully!`;
    if (errorCount > 0) {
      resultText += ` (⚠️ ${errorCount} failed)`;
    }
    if (chatState.ignoredColumns.size > 0) {
      resultText += `\n_(Ignored: ${[...chatState.ignoredColumns].join(', ')})_`;
    }

    chatState.messages.push({ role: 'assistant', text: resultText, actionResult: `${successCount} record(s) updated` });
  } catch (err) {
    console.error('Apply XLSX plan error:', err);
    chatState.messages.push({ role: 'assistant', text: `❌ Failed to apply updates: ${err.message}` });
  }

  chatState.pendingUpdatePlan = null;
  saveMessages();
  initAiChat();
};

window.cancelXLSXPlan = (index) => {
  chatState.pendingUpdatePlan = null;
  if (chatState.messages[index]) {
    chatState.messages[index].isPreview = false;
    chatState.messages[index].text += "\n\n_(Cancelled by user)_";
  }
  saveMessages();
  initAiChat();
};

// ─── BRIDGE CARD HANDLERS ────────────────────────────────────
window.copyBridgePrompt = () => {
  const promptEl = document.getElementById('bridgePromptText');
  const btn = document.getElementById('bridgeCopyBtn');
  if (!promptEl) return;

  const text = promptEl.textContent || promptEl.innerText;
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      btn.textContent = '✅ Copied!';
      btn.classList.add('bridge-copy-success');
      setTimeout(() => {
        btn.textContent = '📋 Copy Prompt';
        btn.classList.remove('bridge-copy-success');
      }, 2000);
    }
  }).catch(() => {
    // Fallback: select text
    const range = document.createRange();
    range.selectNodeContents(promptEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    if (btn) btn.textContent = '📌 Selected — Ctrl+C to copy';
  });
};

window.undoAiAction = async (index) => {
  const msg = chatState.messages[index];
  if (!msg) return;
  
  try {
    const undoData = msg.undoData;
    const restoredText = msg.originalText || msg.text;
    
    // 1. Revert Database — FULL REPLACEMENT, not a merge
    if (undoData && undoData.collection === 'students' && Array.isArray(undoData.previousData)) {
      let restored = 0;
      for (const snapshot of undoData.previousData) {
        try {
          // Strip RxDB internal metadata that would cause conflicts
          const cleanData = { ...snapshot };
          delete cleanData._rev;
          delete cleanData._deleted;
          delete cleanData._attachments;
          delete cleanData._meta;
          
          // Direct db.update() for a FULL overwrite (bypasses Student.update's merge logic)
          await db.update(STORES.STUDENTS, cleanData);
          restored++;
        } catch (err) {
          console.error(`Undo failed for student ${snapshot.id}:`, err);
        }
      }
      console.log(`Undo complete: ${restored}/${undoData.previousData.length} records restored.`);
    }
    
    // 2. CASCADE DELETION: Remove this message AND all subsequent messages
    // This ensures that when you undo "dei i wanna import", the Bridge Card and file upload are also removed
    const newMessages = chatState.messages.slice(0, index);
    
    chatState.messages = newMessages;
    
    // 3. Re-render UI first (this replaces the input element)
    initAiChat();
    saveMessages();

    // 4. Restore User Text to the NEWLY rendered input
    setTimeout(() => {
      const input = document.getElementById('aiChatInput');
      if (input) {
        input.value = restoredText;
        // Trigger height adjustment for the new element
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight) + 'px';
        input.focus();
      }
    }, 0);
    
  } catch (err) {
    console.error("Undo error:", err);
    alert("Sorry, I couldn't undo that action.");
  }
};

/**
 * Generalized DB Engine
 */
async function executeGeneralizedAction(action) {
  const { payload } = action;
  if (!payload) throw new Error("Missing action payload");

  if (action.action === 'save_preference') {
    const { payload } = action;
    const value = payload?.value;
    if (!value) throw new Error("Missing preference value in payload");
    
    const existingPrefs = await db.get(STORES.SETTINGS, 'ai_learned_preferences');
    const currentList = Array.isArray(existingPrefs?.value) ? existingPrefs.value : [];
    
    // Add new rule if unique
    if (!currentList.includes(value)) {
      currentList.push(value);
      await db.update(STORES.SETTINGS, { key: 'ai_learned_preferences', value: currentList });
      // Proactively clear history cache to refresh rules for next request
      aiService.loadPreferences(); 
    }
    
    return { summary: "New rule learned successfully", undo: null };
  }

  if (action.action === 'set_theme') {
    const theme = action.payload?.theme || action.payload?.value;
    const preset = action.payload?.preset;

    if (theme === 'dark' || theme === 'light') {
      setTheme(theme);
    }
    
    if (preset) {
      setVisualPreset(preset);
    }

    return { 
      summary: `Theme preference updated${preset ? ` to ${preset}` : ''}`, 
      undo: null 
    };
  }

  let { collection, operation, find, update, data } = payload;

  // ROBUSTNESS: If operation is missing in payload, check action.action
  if (!operation) {
    console.log(`🔍 AI omitted operation in payload. Detecting from action: "${action.action}"`);
    if (['update', 'updateMany', 'updateOne', 'merge'].includes(action.action)) {
      operation = 'updateMany';
    } else if (['create', 'import'].includes(action.action)) {
      operation = 'create';
    } else if (action.action === 'delete') {
      operation = 'delete';
    }
  }


  // SAFETY NET: Auto-correct wrong collection names — everything is on "students"
  if (collection !== 'students' && collection !== 'settings' && action.action !== 'set_theme') {
    console.warn(`AI sent collection: "${collection}" — auto-correcting to "students"`);
    collection = 'students';
  }

  if (operation === 'update' || operation === 'merge' || operation === 'updateMany' || operation === 'updateOne') {
    const targetStudents = await Student.findAll() || [];
    const matchCriteria = find || {};
    
    const toUpdate = targetStudents.filter(s => {
      return Object.entries(matchCriteria).every(([key, val]) => {
        const studentVal = s[key];
        
        // Case 1: Matching against an Array of possible values (e.g. ["TWIN DIP", "twin dip"])
        if (Array.isArray(val)) {
          const lowerValList = val.map(v => String(v).toLowerCase());
          return lowerValList.includes(String(studentVal).toLowerCase());
        }
        
        // Case 2: Standard String Match (Case-Insensitive)
        if (typeof val === 'string' && typeof studentVal === 'string') {
          return studentVal.toLowerCase() === val.toLowerCase();
        }
        
        // Case 3: Exact Match (Numbers, nulls, etc)
        return studentVal === val;
      });
    });

    // Return the IDs of touched students (snapshots are handled at batch level)
    const touchedIds = toUpdate.map(s => String(s.id));

    for (const student of toUpdate) {
      let finalUpdate = { ...update };
      
      // AUTO-INFERENCE: Only if program changes AND the AI didn't explicitly set a course
      if (finalUpdate.program && !update.course) {
        finalUpdate.course = Student.inferCourse(finalUpdate.program);
      }

      // NORMALIZATION: Fix year parsing (e.g. Oct-22 -> Oct 2022)
      if (finalUpdate.intake) finalUpdate.intake = normalizeDateString(finalUpdate.intake);
      if (finalUpdate.completionDate) finalUpdate.completionDate = normalizeDateString(finalUpdate.completionDate);

      console.log(`📝 AI Update student ${student.id}:`, finalUpdate);
      await Student.update(student.id, finalUpdate); 
    }

    // Refresh UI
    window.dispatchEvent(new CustomEvent('studentsUpdated'));

    return { summary: `${toUpdate.length} record(s) updated`, undo: { touchedIds } };
  }
  
  if (operation === 'create' || operation === 'import') {
    const records = Array.isArray(data) ? data : [data];
    for (const item of records) {
      await Student.create(item);
    }
    return { summary: `${records.length} record(s) added`, undo: null };
  }

  throw new Error(`Unsupported operation ${operation} on ${collection}`);
}



function scrollToBottom() {
  const msgs = document.getElementById('chatMessages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}
