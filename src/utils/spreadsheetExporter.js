/**
 * SPREADSHEET EXPORTER UTILITY
 * Professional Financial Reporting Module
 * Handles export of spreadsheet data to PDF and CSV formats
 * Standards: A4 Landscape (PDF), Structured Data Blocks (CSV)
 */

import { formatCurrency, formatDate, formatMonthYear } from './formatting.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { openPdfPreviewModal } from '../components/PdfPreviewModal.js';
import { Student } from '../models/Student.js';
import { Payment } from '../models/Payment.js';

// Constants for PDF Layout
const PDF_CONFIG = {
  ORIENTATION: 'landscape',
  UNIT: 'mm',
  FORMAT: 'a4',
  MARGINS: { top: 30, right: 15, bottom: 20, left: 15 },
  COLORS: {
    PRIMARY: [30, 41, 59],      // Slate 800
    SECONDARY: [71, 85, 105],   // Slate 600
    ACCENT: [37, 99, 235],      // Blue 600
    HEADER_BG: [241, 245, 249], // Slate 100
    HEADER_TEXT: [15, 23, 42],  // Slate 900
    BORDER: [203, 213, 225],    // Slate 300
    WHITE: [255, 255, 255]
  }
};

/**
 * SpreadsheetExporter Class
 */
export class SpreadsheetExporter {
  constructor(data) {
    this.data = data;
    this.currency = data.currency || 'RM';
    this.courseName = data.course || 'All_Programs';
  }

  /**
   * Generates a unique, descriptive filename
   * Format: ReportType_Program_YYYY-MM-DD_HHmm
   */
  generateFilename(extension) {
    const coursePrefix = this.courseName.toUpperCase().replace(/\s+/g, '_');
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '').substring(0, 4);
    
    return `${coursePrefix}_Payment_Report_${dateStr}_${timeStr}.${extension}`;
  }

  /**
   * Formats currency for CSV (raw number for Excel math)
   */
  formatCurrencyForCSV(val) {
    if (val === null || val === undefined || val === '') return '0.00';
    return parseFloat(val).toFixed(2);
  }

  /**
   * Export to professional XLSX format with Styling
   * Uses ExcelJS for colors, borders, and auto-sizing
   */
  async exportToXLSX() {
    const { title, rows } = this.data;
    
    // Dynamic import of ExcelJS from CDN
    const ExcelJS = await import('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/+esm').then(m => m.default);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Payment Report');

    // --- 1. Styles Configuration ---
    const styles = {
      header: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }, // Slate 800
        font: { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 },
        alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
        border: {
          top: { style: 'thin', color: { argb: 'FF475569' } },
          bottom: { style: 'thin', color: { argb: 'FF475569' } },
          left: { style: 'thin', color: { argb: 'FF475569' } },
          right: { style: 'thin', color: { argb: 'FF475569' } }
        }
      },
      programHeader: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }, // Slate 100
        font: { color: { argb: 'FF2563EB' }, bold: true, size: 12 },
        alignment: { vertical: 'middle' }
      },
      dataCell: {
        font: { size: 10 },
        alignment: { vertical: 'middle' },
        border: {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },   // Slate 400 (Darker)
          bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
          left: { style: 'thin', color: { argb: 'FF94A3B8' } },
          right: { style: 'thin', color: { argb: 'FF94A3B8' } }
        }
      },
      money: {
        numFmt: '"RM "#,##0.00',
        alignment: { horizontal: 'right' }
      }
    };

    // --- 2. Report Title ---
    worksheet.mergeCells('A1:G1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = title.toUpperCase();
    titleCell.font = { size: 16, bold: true, color: { argb: 'FF1E293B' } };
    
    worksheet.mergeCells('A2:G2');
    const dateCell = worksheet.getCell('A2');
    dateCell.value = `Generated on: ${formatDate(new Date(), 'time')}`;
    dateCell.font = { size: 10, italic: true, color: { argb: 'FF64748B' } };
    
    worksheet.addRow([]); // Spacer

    const headers = [
      'No', 'Student Name', 'Student ID', 'Intake', 'Completion', 
      'Inst. Cost', 'Reg. Fee', 'Reg. Receipt', 'Comm. Fee', 'Comm. Receipt',
      'Paid To', 'Current Sem', 
      'S1 Paid', 'S1 Details', 'S2 Paid', 'S2 Details', 
      'S3 Paid', 'S3 Details', 'S4 Paid', 'S4 Details', 
      'S5 Paid', 'S5 Details', 'S6 Paid', 'S6 Details', 
      'Total Fees', 'Total Paid', 'Balance'
    ];

    // --- 3. Process Data by Program ---
    let globalNo = 1;
    let currentRowIdx = 5;
    
    const studentsByProgram = {};
    allStudents.forEach(s => {
      const p = s.program || 'Unassigned';
      if (!studentsByProgram[p]) studentsByProgram[p] = [];
      studentsByProgram[p].push(s);
    });

    for (const [programName, students] of Object.entries(studentsByProgram)) {
      const visibleNames = new Set(rows.map(r => r.student.name));
      const blockStudents = students.filter(s => visibleNames.has(s.name));
      if (blockStudents.length === 0) continue;

      // Program Section Header
      const progRow = worksheet.addRow([`PROGRAM: ${programName}`]);
      progRow.getCell(1).style = styles.programHeader;
      worksheet.mergeCells(`A${currentRowIdx}:G${currentRowIdx}`);
      currentRowIdx++;

      // Column Headers
      const headRow = worksheet.addRow(headers);
      headRow.eachCell((cell) => {
        cell.style = styles.header;
      });
      currentRowIdx++;

      for (const student of blockStudents) {
        const payments = await Payment.findByStudent(student.id);
        const { grouped: semesterPayments } = await Payment.getStudentPaymentsBySemester(student.id);
        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const balance = (student.totalFees || 0) - totalPaid;

        const semData = [];
        let maxPaymentsInAnySem = 1;

        for(let i=1; i<=6; i++) {
          const sem = semesterPayments[i];
          if (sem) {
            semData.push(sem.totalAmount);
            
            // Build detailed multi-line string
            const detailLines = sem.payments.map(p => {
              const date = formatDate(p.date, 'short');
              const ref = p.reference ? `Ref: ${p.reference}` : 'No Ref';
              const desc = p.description ? ` (${p.description})` : '';
              return `[${date}] RM ${p.amount.toFixed(2)} - ${ref}${desc}`;
            });
            
            semData.push(detailLines.join('\n'));
            if (sem.payments.length > maxPaymentsInAnySem) {
              maxPaymentsInAnySem = sem.payments.length;
            }
          } else {
            semData.push(0);
            semData.push('-');
          }
        }

        const dataRow = worksheet.addRow([
          globalNo++,
          student.name,
          student.studentId || '-',
          student.intake || '-',
          student.completionDate || '-',
          student.institutionalCost || 0,
          student.registrationFee || 0,
          student.registrationFeeReceipt || '-',
          student.commission || 0,
          student.commissionReceipt || '-',
          student.commissionPaidTo || '-',
          student.currentSemester || student.totalSemesters || 1, // Clarified use
          ...semData,
          student.totalFees || 0,
          totalPaid,
          balance
        ]);

        // True Adaptive Row Height: generous spacing for multi-line content
        // Base height 25pt + 18pt per payment line ensures full visibility
        dataRow.height = maxPaymentsInAnySem === 1 ? 25 : (maxPaymentsInAnySem * 18) + 10;

        dataRow.eachCell((cell, colIdx) => {
          cell.style = { 
            ...styles.dataCell,
            alignment: { ...styles.dataCell.alignment, vertical: 'top', wrapText: true }
          };
          
          // Column Specific Alignments
          const centerCols = [1, 3, 4, 5, 12]; // No, ID, Intake, Comp, Sems
          const moneyCols = [6, 7, 9, 13, 15, 17, 19, 21, 23, 25, 26, 27];
          const detailCols = [14, 16, 18, 20, 22, 24];
          
          if (centerCols.includes(colIdx)) {
            cell.alignment = { ...cell.alignment, horizontal: 'center' };
          } else if (moneyCols.includes(colIdx)) {
            cell.numFmt = styles.money.numFmt;
            cell.alignment = { ...cell.alignment, horizontal: 'right' };
          } else if (detailCols.includes(colIdx)) {
            cell.alignment = { ...cell.alignment, horizontal: 'left', font: { size: 9 } };
          } else {
            cell.alignment = { ...cell.alignment, horizontal: 'left' };
          }

          // Conditional formatting for balance
          if (colIdx === 27 && cell.value > 0.01) {
            cell.font = { color: { argb: 'FFEF4444' }, bold: true }; // Red
          } else if (colIdx === 26 || (colIdx === 27 && cell.value <= 1e-9)) {
             cell.font = { color: { argb: 'FF059669' }, bold: true }; // Emerald 600
          }
        });
        currentRowIdx++;
      }
      worksheet.addRow([]); // Spacer
      currentRowIdx++;
    }

    // --- 4. True Adaptive Column Sizing ---
    // Instead of total string length, we measure the length of the LONGEST SINGLE LINE
    worksheet.columns.forEach((column, colIndex) => {
      let maxLineLen = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        if (!cell.value) return;
        const stringVal = cell.value.toString();
        const lines = stringVal.split('\n');
        lines.forEach(line => {
          if (line.length > maxLineLen) maxLineLen = line.length;
        });
      });
      
      // Money columns need extra width to prevent ######
      // Column indices: 6,7,9,13,15,17,19,21,23,25,26,27 (1-indexed)
      const moneyColIndices = [5, 6, 8, 12, 14, 16, 18, 20, 22, 24, 25, 26]; // 0-indexed
      const isMoney = moneyColIndices.includes(colIndex);
      
      // Set minimum widths
      let minWidth = isMoney ? 16 : 10;
      
      // Calculate final width with buffer
      const buffer = isMoney ? 3 : 2;
      const calculatedWidth = maxLineLen + buffer;
      const width = Math.max(minWidth, Math.min(calculatedWidth, 65));
      
      column.width = width;
    });

    // --- 5. Summary Statistics ---
    worksheet.addRow([]); // Spacer
    const sumTitle = worksheet.addRow(['SUMMARY STATISTICS']);
    sumTitle.font = { bold: true, size: 12 };
    
    let totalCol = 0, totalOut = 0;
    rows.forEach(r => {
      totalCol += r.totalPaid || 0;
      totalOut += r.balance || 0;
    });

    const sumRows = [
      worksheet.addRow(['Total Records', rows.length]),
      worksheet.addRow(['Total Collected', totalCol]),
      worksheet.addRow(['Total Outstanding', totalOut])
    ];

    sumRows.forEach((row, idx) => {
      row.eachCell((cell, colIdx) => {
        cell.border = styles.dataCell.border;
        if (colIdx === 2 && idx > 0) { // Currency cells for totals
          cell.numFmt = styles.money.numFmt;
          cell.alignment = { horizontal: 'right' };
        }
      });
    });

    // --- 6. Save File ---
    const buffer = await workbook.xlsx.writeBuffer();
    this.downloadFile(buffer, this.generateFilename('xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  /**
   * Export to PDF format with Professional Full-Width Layout
   */
  /**
   * Internal helper to generate the jsPDF document instance
   * Shared by exportToPDF and printSpreadsheet
   */
  _generatePDFDoc() {
    const { title, subtitle, rows, summary } = this.data;
    const doc = new jsPDF({
      orientation: PDF_CONFIG.ORIENTATION,
      unit: PDF_CONFIG.UNIT,
      format: PDF_CONFIG.FORMAT
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - PDF_CONFIG.MARGINS.left - PDF_CONFIG.MARGINS.right;

    // --- 1. Main Report Header ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...PDF_CONFIG.COLORS.PRIMARY);
    doc.text(title.toUpperCase(), PDF_CONFIG.MARGINS.left, PDF_CONFIG.MARGINS.top - 10);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...PDF_CONFIG.COLORS.SECONDARY);
    doc.text(subtitle || `Generated: ${formatDate(new Date(), 'time')}`, PDF_CONFIG.MARGINS.left, PDF_CONFIG.MARGINS.top - 4);

    // --- 2. Table Layout Reference ---
    const COL_DEFS = {
      no:        { header: '#',      width: 5,  align: 'center' },
      name:      { header: 'STUDENT NAME', width: 25, align: 'left' },
      intake:    { header: 'INTAKE', width: 10, align: 'left' },
      comp:      { header: 'COMPLETION', width: 12, align: 'left' },
      cost:      { header: 'INST. COST', width: 12, align: 'right' },
      fees:      { header: 'TOTAL FEES', width: 12, align: 'right' },
      paid:      { header: 'TOTAL PAID', width: 12, align: 'right' },
      balance:   { header: 'BALANCE',    width: 12, align: 'right' }
    };

    // --- 3. Modular Rendering Logic ---
    let currentY = PDF_CONFIG.MARGINS.top;
    const showCourseHeaders = this.courseName.toUpperCase() === 'ALL PROGRAMS';

    // Group rows into hierarchical structure
    const courseSections = [];
    let activeCourse = null;
    let activeProgram = null;

    rows.forEach(row => {
      if (row.type === 'course_header') {
        activeCourse = { title: row.course, programs: [] };
        courseSections.push(activeCourse);
        activeProgram = null;
      } else if (row.type === 'header') {
        if (!activeCourse) {
          activeCourse = { title: this.courseName, programs: [] };
          courseSections.push(activeCourse);
        }
        activeProgram = { title: row.program, rows: [], subTotal: null };
        activeCourse.programs.push(activeProgram);
      } else if (row.type === 'data') {
        if (activeProgram) activeProgram.rows.push(row);
      } else if (row.type === 'summary') {
        if (activeProgram) activeProgram.subTotal = row;
      }
    });

    courseSections.forEach((course, sIdx) => {
      // Conditional Course Header
      if (showCourseHeaders) {
        if (sIdx > 0) currentY += 15;
        
        if (currentY + 20 > pageHeight - PDF_CONFIG.MARGINS.bottom) {
          doc.addPage();
          currentY = PDF_CONFIG.MARGINS.top;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(...PDF_CONFIG.COLORS.HEADER_TEXT);
        doc.text(course.title.toUpperCase(), PDF_CONFIG.MARGINS.left, currentY);
        
        doc.setDrawColor(...PDF_CONFIG.COLORS.ACCENT);
        doc.setLineWidth(0.5);
        doc.line(PDF_CONFIG.MARGINS.left, currentY + 2, pageWidth - PDF_CONFIG.MARGINS.right, currentY + 2);
        
        currentY += 10;
      }

      course.programs.forEach((program, pIdx) => {
        // Spacing between programs OR after course header
        if (pIdx > 0 || (!showCourseHeaders && sIdx > 0)) {
            currentY += 12;
        } else if (pIdx === 0 && !showCourseHeaders && sIdx === 0) {
            // First program of first course if no course header shown
            currentY += 5; 
        }

        if (currentY + 25 > pageHeight - PDF_CONFIG.MARGINS.bottom) {
          doc.addPage();
          currentY = PDF_CONFIG.MARGINS.top;
        }

        // Program Label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...PDF_CONFIG.COLORS.SECONDARY);
        doc.text(program.title.toUpperCase(), PDF_CONFIG.MARGINS.left, currentY);
        currentY += 4;

        const tableData = program.rows.map(r => [
          r.no,
          r.studentName,
          r.intake || '-',
          r.completion || '-',
          formatCurrency(r.cost, this.currency),
          formatCurrency(r.totalFees, this.currency),
          formatCurrency(r.totalPaid, this.currency),
          formatCurrency(r.balance, this.currency)
        ]);

        if (program.subTotal) {
          tableData.push([{ 
            content: `Sub-Total (${program.title}):`, 
            colSpan: 4, 
            styles: { 
              halign: 'right', 
              fontStyle: 'bold',
              textColor: PDF_CONFIG.COLORS.PRIMARY,
              fillColor: [248, 250, 252]
            }
          }, {
            content: formatCurrency(program.subTotal.subTotalCost, this.currency),
            styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 250, 252] }
          }, {
            content: formatCurrency(program.subTotal.subTotalFees, this.currency),
            styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 250, 252] }
          }, {
            content: formatCurrency(program.subTotal.subTotalPaid, this.currency),
            styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 250, 252], textColor: [22, 163, 74] }
          }, {
            content: formatCurrency(program.subTotal.subTotalBalance, this.currency),
            styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 250, 252], textColor: program.subTotal.subTotalBalance > 0 ? [220, 38, 38] : [22, 163, 74] }
          }]);
        }

        autoTable(doc, {
          startY: currentY,
          head: [[
            COL_DEFS.no.header,
            COL_DEFS.name.header,
            COL_DEFS.intake.header,
            COL_DEFS.comp.header,
            COL_DEFS.cost.header,
            COL_DEFS.fees.header,
            COL_DEFS.paid.header,
            COL_DEFS.balance.header
          ]],
          body: tableData,
          theme: 'grid',
          headStyles: {
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            fontSize: 8,
            fontStyle: 'bold',
            halign: 'center',
            cellPadding: 3
          },
          columnStyles: {
            0: { cellWidth: (contentWidth * COL_DEFS.no.width) / 100, halign: 'center' },
            1: { cellWidth: (contentWidth * COL_DEFS.name.width) / 100, fontStyle: 'bold', textColor: PDF_CONFIG.COLORS.PRIMARY },
            2: { cellWidth: (contentWidth * COL_DEFS.intake.width) / 100 },
            3: { cellWidth: (contentWidth * COL_DEFS.comp.width) / 100 },
            4: { cellWidth: (contentWidth * COL_DEFS.cost.width) / 100, halign: 'right' },
            5: { cellWidth: (contentWidth * COL_DEFS.fees.width) / 100, halign: 'right' },
            6: { cellWidth: (contentWidth * COL_DEFS.paid.width) / 100, halign: 'right', textColor: [22, 163, 74] },
            7: { cellWidth: (contentWidth * COL_DEFS.balance.width) / 100, halign: 'right', fontStyle: 'bold' }
          },
          styles: {
            fontSize: 8,
            cellPadding: 2,
            lineColor: PDF_CONFIG.COLORS.BORDER,
            lineWidth: 0.1
          },
          margin: PDF_CONFIG.MARGINS,
          didParseCell: (data) => {
            if (data.column.index === 7 && data.section === 'body') {
               const rawStr = data.cell.raw;
               if (typeof rawStr === 'string') {
                  const val = parseFloat(rawStr.replace(/[^0-9.-]+/g,""));
                  if (val > 0) {
                     data.cell.styles.textColor = [220, 38, 38];
                  }
               }
            }
          }
        });

        currentY = doc.lastAutoTable.finalY;
      });
    });

    if (summary) {
      if (currentY + 50 > pageHeight - PDF_CONFIG.MARGINS.bottom) {
        doc.addPage();
        currentY = PDF_CONFIG.MARGINS.top;
      } else {
        currentY += 15;
      }

      autoTable(doc, {
        startY: currentY,
        head: [['METRIC', 'TOTAL VALUE']],
        body: [
          ['Total Students', summary.totalStudents.toString()],
          ['Total Collected', formatCurrency(summary.totalCollected, this.currency)],
          ['Total Outstanding', formatCurrency(summary.totalOutstanding, this.currency)]
        ],
        theme: 'grid',
        tableWidth: 80,
        margin: { left: pageWidth - PDF_CONFIG.MARGINS.right - 80 },
        styles: { fontSize: 10, cellPadding: 4, lineColor: PDF_CONFIG.COLORS.BORDER, lineWidth: 0.1 },
        headStyles: { 
          fillColor: PDF_CONFIG.COLORS.HEADER_BG, 
          textColor: PDF_CONFIG.COLORS.PRIMARY, 
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 }, 1: { halign: 'right', cellWidth: 35 } }
      });
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }

    return doc;
  }

  /**
   * Export to PDF format with Professional Full-Width Layout
   */
  async exportToPDF() {
    const doc = this._generatePDFDoc();
    doc.save(this.generateFilename('pdf'));
  }

  /**
   * Open Print Preview for the Spreadsheet
   */
  async printSpreadsheet() {
    const doc = this._generatePDFDoc();
    const filename = this.generateFilename(''); // Filename without extension for the modal
    openPdfPreviewModal(doc, filename);
  }


  /**
   * Helper: Download file
   */
  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
