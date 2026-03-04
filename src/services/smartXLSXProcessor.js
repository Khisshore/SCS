/**
 * SMART XLSX PROCESSOR — v3 "Two-Pass Semantic Discovery"
 * 
 * Pass 1 (Discovery): Scans first 10 rows → produces a Mapping Profile
 * Pass 2 (Extraction): Uses confirmed mapping → row-isolated extraction
 * 
 * Key guarantees:
 * - Financial sanitizer prevents number concatenation ("0451 500" ≠ RM451,500)
 * - Row isolation: zero shared mutable state between rows
 * - Conflict detection: flags overwrites of existing DB data
 * - Instruction stack: honors user rules ("ignore program changes")
 */

// ExcelJS via CDN — same pattern as spreadsheetExporter.js (reading side)
const getExcelJS = () => import('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/+esm').then(m => m.default);

import { Student } from '../models/Student.js';
import { Payment } from '../models/Payment.js';

// ─── DATE PATTERNS ───────────────────────────────────────────────
const MONTH_MAP = {
  jan: 'Jan', january: 'Jan',
  feb: 'Feb', february: 'Feb',
  mar: 'Mar', march: 'Mar',
  apr: 'Apr', april: 'Apr',
  may: 'May',
  jun: 'Jun', june: 'Jun',
  jul: 'Jul', july: 'Jul',
  aug: 'Aug', august: 'Aug',
  sep: 'Sep', sept: 'Sep', september: 'Sep',
  oct: 'Oct', october: 'Oct',
  nov: 'Nov', november: 'Nov',
  dec: 'Dec', december: 'Dec'
};

const MONTH_NUM_MAP = {
  1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
  7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec'
};

// ─── HEADER KEYWORDS ─────────────────────────────────────────────
const HEADER_PATTERNS = {
  name: ['student name', 'name', 'student', 'nama', 'nama pelajar', 'pelajar'],
  intake: ['intake', 'intake date', 'start date', 'enrol', 'enrolled', 'tarikh masuk', 'tarikh mula', 'start'],
  completionDate: ['completion', 'completion date', 'complete', 'end date', 'end', 'finish', 'graduate', 'graduation', 'tamat', 'tarikh tamat', 'expected completion'],
  program: ['program', 'programme', 'course', 'kursus', 'program name'],
  studentId: ['student id', 'matric', 'matric no', 'id no'],
  status: ['status', 'completion status'],
  totalFees: ['total fees', 'total fee', 'fees', 'fee', 'yuran', 'total amount', 'jumlah'],
  commission: ['commission', 'comm', 'komisen', 'agent fee', 'referral', 'agent commission', 'comm fee'],
  registrationFee: ['registration', 'reg fee', 'registration fee', 'yuran pendaftaran', 'reg'],
  receipt: ['receipt', 'receipt no', 'resit', 'receipt number'],
  semester: ['sem', 'semester', 'year of study', 'sem no', 'year'],
};

const NAME_INDICATORS = ['A/L', 'A/P', 'BIN', 'BINTI', 'B/', 'S/O', 'D/O'];

// ═══════════════════════════════════════════════════════════════════
// FINANCIAL SANITIZER — Order-Independent, Heuristic-Based
// ═══════════════════════════════════════════════════════════════════

/**
 * Sanitize a financial cell value. Prevents concatenation bugs.
 * Uses heuristics to distinguish receipt codes from monetary amounts.
 *
 * Returns: { amount, receipt, recipient, code, warning }
 * - warning is set for ambiguous cases (e.g. "500 600")
 */
export function sanitizeFinancialCell(value, fieldHint = 'unknown') {
  if (value === null || value === undefined || value === '') return null;

  // Pure number → straightforward
  if (typeof value === 'number' && !isNaN(value)) {
    return { amount: value };
  }

  const str = String(value).trim();
  if (!str) return null;

  // "RM 15,000" or "RM15000" → clean amount
  const rmMatch = str.match(/^RM\s*([\d,]+(?:\.\d{1,2})?)$/i);
  if (rmMatch) {
    return { amount: parseFloat(rmMatch[1].replace(/,/g, '')) };
  }

  // Split into tokens
  const tokens = str.split(/\s+/);

  // Classify each token
  const classified = tokens.map(tok => {
    const cleaned = tok.replace(/,/g, '');
    const num = parseFloat(cleaned);
    const isNum = !isNaN(num) && /^[\d,.]+$/.test(cleaned);
    const isAlpha = /^[A-Za-z]+$/.test(tok);
    return { raw: tok, num: isNum ? num : null, isNum, isAlpha };
  });

  const numbers = classified.filter(t => t.isNum);
  const alphas = classified.filter(t => t.isAlpha);

  // Single number → simple amount
  if (numbers.length === 1 && alphas.length === 0) {
    return { amount: numbers[0].num };
  }

  // "NAME AMOUNT" pattern (e.g. "PREMA 1000")
  if (alphas.length >= 1 && numbers.length === 1) {
    const recipient = alphas.map(t => t.raw).join(' ');
    return { recipient, amount: numbers[0].num };
  }

  // "CODE NAME AMOUNT" pattern (e.g. "0398 SATYA 500")
  if (numbers.length === 2 && alphas.length >= 1) {
    // Heuristic: the larger number is likely the amount,
    // the smaller/shorter one is likely a code/receipt
    const [a, b] = numbers;
    const recipient = alphas.map(t => t.raw).join(' ');

    // Code heuristic: leading zeros, or ≤4 digits, or much smaller value
    const aIsCode = a.raw.startsWith('0') || a.raw.length <= 4;
    const bIsCode = b.raw.startsWith('0') || b.raw.length <= 4;

    if (aIsCode && !bIsCode) {
      return { code: a.raw, recipient, amount: b.num };
    }
    if (bIsCode && !aIsCode) {
      return { code: b.raw, recipient, amount: a.num };
    }
    // Both look like codes or amounts — use the later one as amount
    return { code: a.raw, recipient, amount: b.num };
  }

  // Two numbers, no alpha (e.g. "0451 500" or "500 600")
  if (numbers.length === 2 && alphas.length === 0) {
    const [a, b] = numbers;

    // Heuristic: receipt numbers often have leading zeros or are 3-4 digit codes
    const aLooksLikeReceipt = a.raw.startsWith('0') || (a.raw.length <= 4 && a.num < 10000);
    const bLooksLikeReceipt = b.raw.startsWith('0') || (b.raw.length <= 4 && b.num < 10000);

    // If one clearly looks like a receipt and the other doesn't
    if (aLooksLikeReceipt && !bLooksLikeReceipt) {
      return { receipt: a.raw, amount: b.num };
    }
    if (bLooksLikeReceipt && !aLooksLikeReceipt) {
      return { receipt: b.raw, amount: a.num };
    }

    // Fee heuristic: fees are typically > 1000 (tuition), commissions are typically < 5000
    if (fieldHint === 'totalFees') {
      // Larger value is the fee
      return a.num >= b.num
        ? { amount: a.num, receipt: b.raw, warning: 'ambiguous_split' }
        : { amount: b.num, receipt: a.raw, warning: 'ambiguous_split' };
    }

    // Ambiguous — flag for review
    return {
      amount: Math.max(a.num, b.num),
      receipt: a.num < b.num ? a.raw : b.raw,
      warning: 'ambiguous_split'
    };
  }

  // 3+ numbers → always flag
  if (numbers.length >= 3) {
    return {
      amount: numbers[numbers.length - 1].num,
      warning: 'multi_number_cell',
      rawTokens: tokens
    };
  }

  // Plain number string
  const plainNum = parseFloat(str.replace(/,/g, ''));
  if (!isNaN(plainNum) && plainNum > 0) {
    return { amount: plainNum };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// EXCELJS WORKSHEET → ROW ARRAY ADAPTER
// Mirrors XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert an ExcelJS worksheet to an array-of-arrays.
 * ExcelJS rows are 1-indexed → slice(1) drops the phantom [0] slot.
 * @param {import('exceljs').Worksheet} worksheet
 * @param {boolean} raw - if false, prefer formatted text over raw values
 * @returns {Array<Array<any>>}
 */
function worksheetToRows(worksheet, raw = true) {
  const rows = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    rows.push(row.values.slice(1).map(cell => {
      if (cell == null) return '';
      if (typeof cell === 'object') {
        if (!raw && cell.text !== undefined) return cell.text;     // rich-text
        if (cell.result !== undefined) return cell.result;         // formula
        if (cell.text !== undefined) return cell.text;             // rich-text fallback
        if (cell instanceof Date) return cell;                     // date cell
      }
      return cell;
    }));
  });
  return rows;
}


// ═══════════════════════════════════════════════════════════════════
// DATE PARSING
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse any date string/number into "MMM YYYY" format.
 */
export function parseDate(value, anchorYear = null) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (!isNaN(value.getTime()) && value.getFullYear() > 1990) {
      return `${MONTH_NUM_MAP[value.getMonth() + 1]} ${value.getFullYear()}`;
    }
    return null;
  }

  // Excel serial number
  if (typeof value === 'number') {
    if (value > 25000 && value < 60000) {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + value * 86400000);
      if (!isNaN(date.getTime())) {
        return `${MONTH_NUM_MAP[date.getMonth() + 1]} ${date.getFullYear()}`;
      }
    }
    if (value >= 10 && value <= 50) {
      return `20${String(value).padStart(2, '0')}`;
    }
    return null;
  }

  const str = String(value).trim();
  if (!str) return null;

  function resolve2DigitYear(yy) {
    const num = parseInt(yy);
    if (anchorYear && anchorYear >= 2000) {
      const candidate = Math.floor(anchorYear / 100) * 100 + num;
      if (Math.abs(candidate - anchorYear) <= 20) return candidate;
    }
    return 2000 + num;
  }

  // "MMM-YY" or "MMM YY" or "MMM/YY"
  const m1 = str.match(/^([A-Za-z]+)[- /](\d{2})$/);
  if (m1) {
    const mon = MONTH_MAP[m1[1].toLowerCase()];
    if (mon) return `${mon} ${resolve2DigitYear(m1[2])}`;
  }

  // "MMM-YYYY" or "MMM YYYY"
  const m2 = str.match(/^([A-Za-z]+)[- /](\d{4})$/);
  if (m2) {
    const mon = MONTH_MAP[m2[1].toLowerCase()];
    if (mon) return `${mon} ${m2[2]}`;
  }

  // "MM/YYYY"
  const m3 = str.match(/^(\d{1,2})[/-](\d{4})$/);
  if (m3) {
    const monthNum = parseInt(m3[1]);
    if (monthNum >= 1 && monthNum <= 12) return `${MONTH_NUM_MAP[monthNum]} ${m3[2]}`;
  }

  // "YYYY-MM"
  const m4 = str.match(/^(\d{4})[/-](\d{1,2})$/);
  if (m4) {
    const monthNum = parseInt(m4[2]);
    if (monthNum >= 1 && monthNum <= 12) return `${MONTH_NUM_MAP[monthNum]} ${m4[1]}`;
  }

  // "MM/YY" (e.g. 10/22)
  const m5a = str.match(/^(\d{1,2})[/-](\d{2})$/);
  if (m5a) {
    const monthNum = parseInt(m5a[1]);
    if (monthNum >= 1 && monthNum <= 12) return `${MONTH_NUM_MAP[monthNum]} ${resolve2DigitYear(m5a[2])}`;
  }

  // "DD/MM/YYYY"
  const m5 = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m5) {
    const a = parseInt(m5[1]), b = parseInt(m5[2]);
    const monthNum = a > 12 ? b : a;
    if (monthNum >= 1 && monthNum <= 12) return `${MONTH_NUM_MAP[monthNum]} ${m5[3]}`;
  }

  // "YYYY" standalone
  const m7 = str.match(/^(20\d{2})$/);
  if (m7) return m7[1];

  // Just a month name
  const m6 = str.match(/^([A-Za-z]+)$/);
  if (m6) {
    const mon = MONTH_MAP[m6[1].toLowerCase()];
    if (mon) return mon;
  }

  // Native Date parse as last resort
  const nativeDate = new Date(str);
  if (!isNaN(nativeDate.getTime()) && nativeDate.getFullYear() > 1990 && nativeDate.getFullYear() < 2050) {
    return `${MONTH_NUM_MAP[nativeDate.getMonth() + 1]} ${nativeDate.getFullYear()}`;
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// CLASSIFICATION HELPERS
// ═══════════════════════════════════════════════════════════════════

function looksLikeDate(value) {
  if (value === null || value === undefined || value === '') return false;
  if (value instanceof Date) return true;
  if (typeof value === 'number' && value > 25000 && value < 60000) return true;
  const str = String(value).trim();
  if (!str) return false;
  if (/^[A-Za-z]{3,9}[- /]\d{2,4}$/.test(str)) return true;
  if (/^\d{1,2}[/-]\d{2}$/.test(str)) return true;
  if (/^\d{1,2}[/-]\d{4}$/.test(str)) return true;
  if (/^\d{4}[/-]\d{1,2}$/.test(str)) return true;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(str)) return true;
  if (/^20\d{2}$/.test(str)) return true;
  return false;
}

function looksLikeName(value) {
  if (!value || typeof value !== 'string') return false;
  const str = value.trim();
  if (str.length < 3 || str.length > 80) return false;
  if (!/^[A-Za-z\s/.'@-]+$/.test(str)) return false;
  if (NAME_INDICATORS.some(ind => str.toUpperCase().includes(ind))) return true;
  if (str === str.toUpperCase() && str.length >= 4 && /^[A-Z]+$/.test(str)) return true;
  if (str.split(/\s+/).length < 2) return false;
  if (str === str.toUpperCase() && str.split(/\s+/).length >= 2) return true;
  return str.split(/\s+/).length >= 2;
}

function looksLikeCommission(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number' && value > 0 && value < 100000) return true;
  const str = String(value).trim();
  if (!str) return false;
  // Contains alpha + number (e.g. "PREMA 500")
  if (/^[A-Za-z].*\d/.test(str) || /^\d+\s+[A-Za-z]/.test(str)) return true;
  return /^\d[\d,.]+$/.test(str);
}

function looksLikeFees(value) {
  if (value === null || value === undefined) return false;
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[RM,\s]/g, ''));
  return !isNaN(num) && num >= 500 && num <= 500000;
}

// ═══════════════════════════════════════════════════════════════════
// FUZZY NAME MATCHING
// ═══════════════════════════════════════════════════════════════════

export function fuzzyMatchStudent(xlsName, dbStudents) {
  if (!xlsName || !dbStudents.length) return null;
  const query = xlsName.toUpperCase().trim();

  let bestMatch = null;
  let bestScore = 0;

  for (const student of dbStudents) {
    const dbName = (student.name || '').toUpperCase().trim();
    if (!dbName) continue;

    if (query === dbName) return { student, score: 100 };

    if (dbName.includes(query) || query.includes(dbName)) {
      const score = 90;
      if (score > bestScore) { bestScore = score; bestMatch = student; }
      continue;
    }

    const queryTokens = query.split(/\s+/).filter(t => t.length > 1);
    const dbTokens = dbName.split(/\s+/).filter(t => t.length > 1);
    const shared = queryTokens.filter(qt => dbTokens.some(dt => dt === qt || dt.includes(qt) || qt.includes(dt)));
    const overlapScore = (shared.length / Math.max(queryTokens.length, dbTokens.length)) * 80;

    if (overlapScore > bestScore) {
      bestScore = overlapScore;
      bestMatch = student;
    }
  }

  return bestScore >= 50 ? { student: bestMatch, score: bestScore } : null;
}

// ═══════════════════════════════════════════════════════════════════
// PASS 1: DISCOVERY — Scan & Map
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect header row from keyword matching.
 */
function detectHeaders(rows) {
  for (let rowIdx = 0; rowIdx < Math.min(rows.length, 8); rowIdx++) {
    const row = rows[rowIdx];
    if (!row || row.length === 0) continue;

    const mapping = {};
    let matchCount = 0;

    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cellVal = String(row[colIdx] || '').toLowerCase().trim();
      if (!cellVal) continue;

      for (const [field, keywords] of Object.entries(HEADER_PATTERNS)) {
        if (mapping[field] !== undefined) continue;
        for (const keyword of keywords) {
          if (cellVal === keyword || cellVal.includes(keyword)) {
            mapping[field] = colIdx;
            matchCount++;
            break;
          }
        }
      }
    }

    if (mapping.name !== undefined && matchCount >= 2) {
      console.log('📊 [XLSX] ✅ Header detected at row', rowIdx, '→', mapping);
      return { headerRow: rowIdx, mapping, source: 'header' };
    }
  }
  return null;
}

/**
 * Infer columns from data content analysis.
 */
function inferColumnsFromData(rows) {
  if (rows.length < 3) return null;

  const dataStartRow = Math.min(2, rows.length - 1);
  const sampleRows = rows.slice(dataStartRow, Math.min(dataStartRow + 20, rows.length));
  const numCols = Math.max(...rows.map(r => r ? r.length : 0));

  const colStats = [];
  for (let col = 0; col < numCols; col++) {
    let nameCount = 0, dateCount = 0, commissionCount = 0, feeCount = 0, emptyCount = 0;
    const sampleValues = [];

    for (const row of sampleRows) {
      const val = row ? row[col] : null;
      if (val === null || val === undefined || String(val).trim() === '') {
        emptyCount++;
        continue;
      }
      sampleValues.push(val);
      if (looksLikeName(String(val))) nameCount++;
      if (looksLikeDate(val)) dateCount++;
      if (looksLikeCommission(val)) commissionCount++;
      if (looksLikeFees(val)) feeCount++;
    }

    const total = sampleValues.length || 1;
    colStats.push({
      col,
      nameRatio: nameCount / total,
      dateRatio: dateCount / total,
      commissionRatio: commissionCount / total,
      feeRatio: feeCount / total,
      emptyRatio: emptyCount / sampleRows.length,
      samples: sampleValues.slice(0, 5)
    });
  }

  const nameCol = colStats.reduce((best, cs) =>
    cs.nameRatio > (best?.nameRatio || 0) ? cs : best, null);

  if (!nameCol || nameCol.nameRatio < 0.3) return null;

  const dateCols = colStats
    .filter(cs => cs.dateRatio >= 0.3 && cs.col !== nameCol.col)
    .sort((a, b) => b.dateRatio - a.dateRatio);

  const commCol = colStats
    .filter(cs => cs.commissionRatio >= 0.4 && cs.col !== nameCol.col)
    .sort((a, b) => b.commissionRatio - a.commissionRatio)[0];

  const feeCol = colStats
    .filter(cs => cs.feeRatio >= 0.4 && cs.col !== nameCol.col && cs.col !== commCol?.col)
    .sort((a, b) => b.feeRatio - a.feeRatio)[0];

  const mapping = { name: nameCol.col };
  if (dateCols.length >= 1) mapping.intake = dateCols[0].col;
  if (dateCols.length >= 2) mapping.completionDate = dateCols[1].col;
  if (commCol) mapping.commission = commCol.col;
  if (feeCol) mapping.totalFees = feeCol.col;

  return { headerRow: -1, mapping, source: 'inferred', colStats };
}

/**
 * Find anchor year from 4-digit years in the data.
 */
function findAnchorYear(rows, mapping) {
  const yearCounts = {};
  const dateCols = [];
  if (mapping.intake !== undefined) dateCols.push(mapping.intake);
  if (mapping.completionDate !== undefined) dateCols.push(mapping.completionDate);

  for (const row of rows) {
    if (!row) continue;
    for (const col of dateCols) {
      const m = String(row[col] || '').match(/\b(20\d{2})\b/);
      if (m) yearCounts[m[1]] = (yearCounts[m[1]] || 0) + 1;
    }
  }

  // Also scan all cells in first 20 rows
  for (const row of rows.slice(0, 20)) {
    if (!row) continue;
    for (const cell of row) {
      const m = String(cell || '').match(/\b(20\d{2})\b/);
      if (m) yearCounts[m[1]] = (yearCounts[m[1]] || 0) + 1;
    }
  }

  if (Object.keys(yearCounts).length === 0) return null;
  const sorted = Object.entries(yearCounts).sort((a, b) => b[1] - a[1]);
  return parseInt(sorted[0][0]);
}

/**
 * PASS 1: Discovery Pass
 * Scans the workbook and produces a Mapping Profile.
 * Returns: { mapping, headerRow, confidence, needsConfirmation, ambiguous[], colSamples[] }
 */
export function discoveryPass(workbook) {
  // Accept ExcelJS workbook: first sheet is workbook.worksheets[0]
  const ws = workbook.worksheets[0];
  const sheetName = ws ? ws.name : 'Sheet1';
  const rows = ws ? worksheetToRows(ws, true) : [];
  const formattedRows = ws ? worksheetToRows(ws, false) : [];

  console.log(`📊 [DISCOVERY] Sheet "${sheetName}": ${rows.length} rows`);

  const result = {
    mapping: null,
    headerRow: -1,
    confidence: 'low',
    needsConfirmation: false,
    ambiguous: [],
    colSamples: [],
    sheetName
  };

  // Build column samples for UI display
  const numCols = Math.max(...rows.slice(0, 10).map(r => r ? r.length : 0), 0);
  for (let col = 0; col < Math.min(numCols, 15); col++) {
    const samples = [];
    for (let row = 0; row < Math.min(rows.length, 10); row++) {
      const val = formattedRows[row]?.[col];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        samples.push(String(val).trim().substring(0, 40));
      }
      if (samples.length >= 5) break;
    }
    if (samples.length > 0) {
      result.colSamples.push({ col, samples });
    }
  }

  // Step 1: Deterministic header scan
  let detection = detectHeaders(rows) || detectHeaders(formattedRows);
  if (detection) {
    result.mapping = detection.mapping;
    result.headerRow = detection.headerRow;
    result.confidence = 'high';
    console.log('📊 [DISCOVERY] High confidence — headers found:', detection.mapping);
    return result;
  }

  // Step 2: Content-based inference
  detection = inferColumnsFromData(formattedRows) || inferColumnsFromData(rows);
  if (detection) {
    result.mapping = detection.mapping;
    result.headerRow = detection.headerRow;

    // Check for ambiguity
    if (detection.colStats) {
      for (const cs of detection.colStats) {
        const scores = [
          { field: 'name', score: cs.nameRatio },
          { field: 'date', score: cs.dateRatio },
          { field: 'commission', score: cs.commissionRatio },
          { field: 'fees', score: cs.feeRatio }
        ].filter(s => s.score >= 0.25).sort((a, b) => b.score - a.score);

        if (scores.length >= 2 && (scores[0].score - scores[1].score) < 0.15) {
          result.ambiguous.push({
            col: cs.col,
            candidates: scores.slice(0, 2).map(s => s.field),
            samples: cs.samples
          });
        }
      }
    }

    result.confidence = result.ambiguous.length > 0 ? 'low' : 'medium';
    result.needsConfirmation = result.confidence !== 'high';
    console.log(`📊 [DISCOVERY] ${result.confidence} confidence — inferred:`, detection.mapping,
      result.ambiguous.length > 0 ? `(${result.ambiguous.length} ambiguous)` : '');
    return result;
  }

  // Step 3: No mapping found at all
  result.needsConfirmation = true;
  result.confidence = 'low';
  console.log('📊 [DISCOVERY] Low confidence — no structure detected');
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// PASS 2: EXTRACTION — Row-Isolated Data Extraction
// ═══════════════════════════════════════════════════════════════════

/**
 * Pure function: extract data from a single row.
 * ZERO shared mutable state — completely isolated.
 *
 * @param {Array} row - The row data
 * @param {Object} mapping - Column mapping { field: colIndex }
 * @param {number|null} anchorYear - 4-digit year anchor
 * @param {Object} dbStudent - The matched student from DB (for conflict detection)
 * @param {Set} ignoredColumns - Columns the user wants to ignore
 * @returns {{ fields: Object, warnings: Array, conflicts: Array }}
 */
function extractRowData(row, mapping, anchorYear, dbStudent, ignoredColumns) {
  const fields = {};
  const warnings = [];
  const conflicts = [];

  // ─── Intake ───
  if (mapping.intake !== undefined && !ignoredColumns.has('intake')) {
    const rawIntake = row[mapping.intake];
    const parsed = parseDate(rawIntake, anchorYear);
    if (parsed) {
      const current = dbStudent.intake || '';
      if (current && current !== parsed) {
        conflicts.push({ field: 'intake', current, proposed: parsed });
      }
      fields.intake = parsed;
    }
  }

  // ─── Completion Date ───
  if (mapping.completionDate !== undefined && !ignoredColumns.has('completionDate')) {
    const raw = row[mapping.completionDate];
    const parsed = parseDate(raw, anchorYear);
    if (parsed) {
      const current = dbStudent.completionDate || '';
      if (current && current !== parsed) {
        conflicts.push({ field: 'completionDate', current, proposed: parsed });
      }
      fields.completionDate = parsed;
    }
  }

  // ─── Program ───
  if (mapping.program !== undefined && !ignoredColumns.has('program')) {
    const rawProgram = String(row[mapping.program] || '').trim();
    if (rawProgram && rawProgram.length > 2) {
      const current = dbStudent.program || '';
      if (current && current !== rawProgram) {
        conflicts.push({ field: 'program', current, proposed: rawProgram });
      }
      fields.program = rawProgram;
    }
  }

  // ─── Commission (uses financial sanitizer) ───
  if (mapping.commission !== undefined && !ignoredColumns.has('commission')) {
    const raw = row[mapping.commission];
    const sanitized = sanitizeFinancialCell(raw, 'commission');
    if (sanitized && sanitized.amount) {
      fields.commission = sanitized;
      if (sanitized.warning) {
        warnings.push({ field: 'commission', type: sanitized.warning, raw: String(raw) });
      }
    }
  }

  // ─── Total Fees (uses financial sanitizer) ───
  if (mapping.totalFees !== undefined && !ignoredColumns.has('totalFees')) {
    const raw = row[mapping.totalFees];
    const sanitized = sanitizeFinancialCell(raw, 'totalFees');
    if (sanitized && sanitized.amount) {
      const current = dbStudent.totalFees || 0;
      if (current && current !== sanitized.amount) {
        conflicts.push({ field: 'totalFees', current: `RM${current}`, proposed: `RM${sanitized.amount}` });
      }
      fields.totalFees = sanitized.amount;
      if (sanitized.warning) {
        warnings.push({ field: 'totalFees', type: sanitized.warning, raw: String(raw) });
      }
    }
  }

  // ─── Registration Fee ───
  if (mapping.registrationFee !== undefined && !ignoredColumns.has('registrationFee')) {
    const raw = row[mapping.registrationFee];
    const sanitized = sanitizeFinancialCell(raw, 'registrationFee');
    if (sanitized && sanitized.amount) {
      fields.registrationFee = sanitized.amount;
      if (sanitized.warning) {
        warnings.push({ field: 'registrationFee', type: sanitized.warning, raw: String(raw) });
      }
    }
  }

  // ─── Fallback: scan all columns for dates if none mapped ───
  if (mapping.intake === undefined && mapping.completionDate === undefined) {
    const foundDates = [];
    for (let c = 0; c < row.length; c++) {
      if (c === mapping.name) continue;
      const parsed = parseDate(row[c], anchorYear);
      if (parsed) foundDates.push({ col: c, value: parsed });
    }
    if (foundDates.length >= 1 && !ignoredColumns.has('intake')) {
      const current = dbStudent.intake || '';
      if (foundDates[0].value !== current) {
        if (current) conflicts.push({ field: 'intake', current, proposed: foundDates[0].value });
        fields.intake = foundDates[0].value;
      }
    }
    if (foundDates.length >= 2 && !ignoredColumns.has('completionDate')) {
      const current = dbStudent.completionDate || '';
      if (foundDates[1].value !== current) {
        if (current) conflicts.push({ field: 'completionDate', current, proposed: foundDates[1].value });
        fields.completionDate = foundDates[1].value;
      }
    }
  }

  return { fields, warnings, conflicts };
}

/**
 * PASS 2: Extraction Pass
 * Uses a confirmed mapping to extract data row-by-row with full isolation.
 *
 * @param {Object} workbook - XLSX workbook
 * @param {Object} confirmedMapping - The mapping from discoveryPass (or user-confirmed)
 * @param {number} headerRow - Row index of headers (-1 if inferred)
 * @param {Set} ignoredColumns - Columns to ignore
 * @returns {Object} - { updates[], unmatched[], skipped[], warnings[], confidence }
 */
export async function extractionPass(workbook, confirmedMapping, headerRow = -1, ignoredColumns = new Set()) {
  const dbStudents = await Student.findAll() || [];
  console.log(`📊 [EXTRACTION] Starting. DB has ${dbStudents.length} students. Ignored: [${[...ignoredColumns].join(', ')}]`);

  const results = {
    updates: [],
    unmatched: [],
    skipped: [],
    warnings: [],
    confidence: 'high'
  };

  // Accept ExcelJS workbook: iterate workbook.worksheets
  for (const ws of workbook.worksheets) {
    const formattedRows = worksheetToRows(ws, false);

    if (formattedRows.length < 2) continue;

    const dataStartRow = headerRow >= 0 ? headerRow + 1 : 0;
    const anchorYear = findAnchorYear(formattedRows, confirmedMapping);

    for (let i = dataStartRow; i < formattedRows.length; i++) {
      const row = formattedRows[i];
      if (!row || row.length === 0) continue;

      // Extract name
      const rawName = confirmedMapping.name !== undefined
        ? String(row[confirmedMapping.name] || '').trim() : '';
      if (!rawName || !looksLikeName(rawName)) continue;

      // Match to DB
      const match = fuzzyMatchStudent(rawName, dbStudents);
      if (!match) {
        results.unmatched.push(rawName);
        continue;
      }

      // ─── ROW ISOLATION: Pure extraction ───
      const { fields, warnings, conflicts } = extractRowData(
        row, confirmedMapping, anchorYear, match ? match.student : {}, ignoredColumns
      );

      // Collect warnings
      if (warnings.length > 0) {
        results.warnings.push(...warnings.map(w => ({ ...w, student: match ? match.student.name : rawName })));
      }

      // Check if anything changed (or if it's new)
      const hasChanges = !match || Object.keys(fields).some(f => {
        if (f === 'commission') return true; // Always include commission
        return fields[f] !== (match.student[f] || '');
      });

      if (hasChanges) {
        const existingIdx = match ? results.updates.findIndex(u => u.student.id === match.student.id) : -1;
        if (existingIdx >= 0) {
          Object.assign(results.updates[existingIdx].changes, fields);
          results.updates[existingIdx].conflicts.push(...conflicts);
          results.updates[existingIdx].warnings.push(...warnings);
        } else {
          results.updates.push({
            student: match ? match.student : { name: rawName },
            matchScore: match ? match.score : 0,
            xlsName: rawName,
            changes: fields,
            conflicts,
            warnings,
            isNew: !match
          });
        }
      }
    }
  }

  // Adjust confidence
  if (results.warnings.length > 0) results.confidence = 'medium';
  if (results.updates.length === 0 && results.unmatched.length > 3) results.confidence = 'low';

  console.log('📊 [EXTRACTION] Done:', {
    updates: results.updates.length,
    unmatched: results.unmatched.length,
    warnings: results.warnings.length,
    confidence: results.confidence
  });

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// LEGACY COMPAT: processSpreadsheet wraps both passes
// ═══════════════════════════════════════════════════════════════════

export async function processSpreadsheet(workbook) {
  const discovery = discoveryPass(workbook);
  if (!discovery.mapping) {
    return {
      updates: [], unmatched: [], skipped: ['No column structure detected.'],
      warnings: [], confidence: 'low', discovery
    };
  }
  const results = await extractionPass(workbook, discovery.mapping, discovery.headerRow);
  results.discovery = discovery;
  return results;
}

// ═══════════════════════════════════════════════════════════════════
// APPLY & PREVIEW
// ═══════════════════════════════════════════════════════════════════

/**
 * Apply an update plan to the database.
 */
export async function applyUpdatePlan(updates, ignoredColumns = new Set()) {
  let successCount = 0;
  let errorCount = 0;

  for (const { student, changes } of updates) {
    try {
      const dbChanges = { ...changes };
      // Strip internal metadata
      delete dbChanges._semester;

      // Remove ignored columns
      for (const col of ignoredColumns) {
        delete dbChanges[col];
      }

      // Commission: store as number
      if (dbChanges.commission && typeof dbChanges.commission === 'object') {
        dbChanges.commission = dbChanges.commission.amount;
      }

      // Skip if nothing to apply after filtering
      if (Object.keys(dbChanges).length === 0) continue;

      console.log(`📊 [APPLY] ${student.name} →`, dbChanges);
      
      // Handle payments array separately
      const extractedPayments = dbChanges._payments;
      delete dbChanges._payments;

      let targetStudent = student;

      // New Student Creation
      if (!student.id || changes.is_new) {
        const studentData = {
          ...changes,
          name: student.name,
          studentId: `STU-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`.toUpperCase(),
          status: 'active'
        };
        delete studentData.is_new;
        delete studentData._payments;

        const newId = await Student.create(studentData);
        targetStudent = await Student.findById(newId);
      } else {
        await Student.update(student.id, dbChanges);
      }

      // Apply payments if present
      if (Array.isArray(extractedPayments) && extractedPayments.length > 0) {
        // Get existing payments to avoid duplicates
        const existingPayments = await Payment.findByStudent(targetStudent.studentId);
        
        for (const p of extractedPayments) {
          const amt = typeof p.amount === 'number' ? p.amount : parseFloat(String(p.amount).replace(/[RM,\s]/g, ''));
          // Handle 'NIL' or failed parse
          if (isNaN(amt) || amt <= 0) continue;

          // Parse semester number from string (e.g. "Sem 1" -> 1)
          let semNum = parseInt(p.sem);
          if (isNaN(semNum) && typeof p.sem === 'string') {
            const match = p.sem.match(/\d+/);
            if (match) semNum = parseInt(match[0]);
          }
          if (isNaN(semNum)) semNum = 0; // Fallback

          const receiptId = p.receipt ? String(p.receipt).trim() : '';

          // 🛡️ Robust Duplicate Check
          // Priority 1: Receipt ID (if provided)
          // Priority 2: Amount, Semester, and Date within a small window
          const isDuplicate = existingPayments.some(ep => {
            // If receipt ID matches exactly, it's definitely a duplicate
            if (receiptId && ep.reference === receiptId) return true;

            // If no receipt ID, check amount and semester as fallback
            if (!receiptId && !ep.reference) {
              return ep.amount === amt && ep.semester === semNum;
            }
            return false;
          });

          if (!isDuplicate) {
            await Payment.create({
              studentId: targetStudent.studentId,
              amount: amt,
              semester: semNum,
              reference: receiptId,
              transactionType: p.transactionType || p.type || 'SEMESTER_PAYMENT',
              category: p.category || (p.transactionType === 'COMMISSION_PAYOUT' || p.type === 'COMMISSION_PAYOUT' ? 'EXPENSE' : 'REVENUE'),
              recipient: p.recipient || '',
              date: p.date ? (() => { try { if (p.date.includes('/')) { const parts = p.date.split('/'); return new Date(parts[2]?.length === 2 ? `20${parts[2]}` : parts[2], parts[1] - 1, parts[0]).toISOString(); } return new Date(p.date).toISOString(); } catch { return new Date().toISOString(); } })() : new Date().toISOString(),
              method: 'other',
              description: `Extracted: ${p.type || 'Payment'} (${p.sem || 'Sem ' + semNum})`
            });
          }
        }
      }

      successCount++;
    } catch (err) {
      console.error(`Failed to update ${student.name}:`, err);
      errorCount++;
    }
  }

  window.dispatchEvent(new CustomEvent('studentsUpdated'));
  return { successCount, errorCount };
}

/**
 * Render a text preview of the update plan.
 */
export function renderUpdatePreview(results) {
  if (results.updates.length === 0) {
    let msg = "I scanned the spreadsheet but couldn't find any updates to make.";
    if (results.unmatched.length > 0) {
      msg += `\n\nNames not found in database:\n${results.unmatched.map(n => `• ${n}`).join('\n')}`;
    }
    if (results.skipped?.length > 0) {
      msg += `\n\n${results.skipped.join('\n')}`;
    }
    return { text: msg, hasUpdates: false };
  }

  const confLabel = { high: '🟢 High', medium: '🟡 Medium', low: '🔴 Low' };
  let text = `📋 Found **${results.updates.length} student(s)** to update (Confidence: ${confLabel[results.confidence] || '🟡 Medium'}):\n\n`;

  for (const { student, changes, xlsName, matchScore, conflicts, warnings } of results.updates) {
    const changeList = Object.entries(changes)
      .filter(([f]) => !f.startsWith('_'))
      .map(([field, val]) => {
        if (field === 'commission' && typeof val === 'object') {
          const parts = [];
          if (val.recipient) parts.push(`Recipient: ${val.recipient}`);
          parts.push(`Amount: RM${val.amount}`);
          return `Commission: ${parts.join(', ')}`;
        }
        const oldVal = student[field] || '(empty)';
        const label = field === 'completionDate' ? 'Completion'
          : field === 'totalFees' ? 'Total Fees'
          : field === 'registrationFee' ? 'Reg. Fee'
          : field.charAt(0).toUpperCase() + field.slice(1);
        const displayVal = (field === 'totalFees' || field === 'registrationFee')
          ? `RM${val}` : `**${val}**`;
        return `${label}: ${oldVal} → ${displayVal}`;
      })
      .join(', ');

    const confidence = matchScore >= 90 ? '✅' : matchScore >= 70 ? '🟡' : '🔴';
    const warningFlag = (warnings?.length > 0) ? ' ⚠️' : '';
    const conflictFlag = (conflicts?.length > 0) ? ' 🔴' : '';
    text += `${confidence} **${student.name}**${warningFlag}${conflictFlag}: ${changeList}\n`;
  }

  if (results.unmatched.length > 0) {
    text += `\n⚠️ Not found: ${results.unmatched.join(', ')}`;
  }

  if (results.warnings?.length > 0) {
    text += `\n\n⚠️ **${results.warnings.length} warning(s)**: Some cells had ambiguous values. Review the staging table carefully.`;
  }

  return { text, hasUpdates: true };
}
