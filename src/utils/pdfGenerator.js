import jsPDF from 'jspdf';
import { Icons } from './icons.js';
import { formatCurrency, formatDate } from './formatting.js';
import { db } from '../db/database.js';
import { fileSystem } from '../services/fileSystem.js';

/**
 * PDF GENERATOR UTILITY
 * Handles creation and download of professional receipt PDFs
 */

/**
 * Generate and download a receipt PDF for a specific payment
 * @param {object} student - Student object
 * @param {object} currentPayment - The payment record for this receipt
 * @param {Array} allPayments - All student payments for balance calculations
 */
export async function generateReceiptPDF(student, currentPayment, allPayments) {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4'
  });

  const currency = await db.getSetting('currency') || 'RM';
  const institutionName = "Spectrum International College of Technology (TVET)";
  const addressLine1 = "No 13G, Jalan OP 1/2, One Puchong Business Park,";
  const addressLine2 = "Puchong, Selangor, Malaysia";

  // Configuration
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 15;

  // --- HEADER SECTION ---
  
  // Draw Logo
  try {
    const isTwintech = (student.program || '').toLowerCase().includes('twintech') || 
                      (student.course || '').toLowerCase().includes('twintech');
    const logoSrc = isTwintech ? Icons.twintech : Icons.spectrum;
    
    // Vite assets are URLs. jsPDF can fetch them if they are same-origin or base64.
    doc.addImage(logoSrc, 'PNG', margin, currentY, 30, 30);
  } catch (error) {
    console.warn('Could not add logo to PDF:', error);
    doc.setFontSize(10);
    doc.text('[Logo]', margin + 10, currentY + 15);
  }

  // Institution Name & Address
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(institutionName, margin + 45, currentY + 10);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(addressLine1, margin + 45, currentY + 18);
  doc.text(addressLine2, margin + 45, currentY + 24);

  currentY += 40;

  // --- RECEIPT INFO BAR ---
  
  // Draw top border for info bar
  doc.setLineWidth(0.5);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Fee receipt', margin + 2, currentY + 6);
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Receipt No.: ${currentPayment.reference || 'N/A'}`, pageWidth / 2, currentY + 6, { align: 'center' });
  
  const paymentDate = new Date(currentPayment.date);
  doc.text(`Date: ${formatDate(paymentDate, 'malaysian')}`, pageWidth - margin - 2, currentY + 6, { align: 'right' });
  
  // Draw bottom border for info bar
  doc.line(margin, currentY + 10, pageWidth - margin, currentY + 10);
  
  currentY += 10;

  // --- STUDENT & PROGRAM INFO ---
  
  doc.setFontSize(9);
  const infoRowHeight = 6;
  const col1X = margin + 2;
  const col2X = margin + 45;
  const col3X = pageWidth / 2 + 15;
  const col4X = col3X + 45;

  // Row 1
  currentY += 8;
  doc.setFont('helvetica', 'normal');
  doc.text('Student Name', col1X, currentY);
  doc.setFont('helvetica', 'bold');
  
  // Wrap student name if too long
  const nameLines = doc.splitTextToSize((student.name || '').toUpperCase(), col3X - col2X - 5);
  doc.text(nameLines, col2X, currentY);
  
  doc.setFont('helvetica', 'normal');
  doc.text('Programme', col3X, currentY);
  doc.setFont('helvetica', 'bold');
  const progLines = doc.splitTextToSize(student.program || student.course || 'N/A', pageWidth - margin - col4X);
  doc.text(progLines, col4X, currentY);

  // Row 2 (Adjustment for name/prog height)
  const row1Extra = Math.max(nameLines.length, progLines.length) * infoRowHeight;
  currentY += row1Extra;

  doc.setFont('helvetica', 'normal');
  doc.text('Intake', col1X, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(student.intake || 'N/A', col2X, currentY);
  
  doc.setFont('helvetica', 'normal');
  doc.text('Admission No.', col3X, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(student.studentId || 'N/A', col4X, currentY);

  currentY += infoRowHeight;
  doc.setFont('helvetica', 'normal');
  doc.text('Finance fee Collection', col1X, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(`Tuition fees for ${student.course || 'the program'}`, col2X, currentY);

  currentY += 10;

  // --- PARTICULARS TABLE ---
  
  // Header
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, currentY, pageWidth - (margin * 2), 8, 'F');
  doc.line(margin, currentY, pageWidth - margin, currentY);
  doc.line(margin, currentY + 8, pageWidth - margin, currentY + 8);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Particulars', margin + 2, currentY + 6);
  doc.text(`Amount (${currency})`, pageWidth - margin - 2, currentY + 6, { align: 'right' });
  
  currentY += 8;

  // Rows (registration + tuition)
  doc.setFont('helvetica', 'normal');
  
  const regFee = student.registrationFee || 0;
  const tuitionFee = (student.totalFees || 0) - regFee;

  currentY += 6;
  doc.text('1. Registration Fee', margin + 2, currentY);
  doc.text(formatCurrencyValue(regFee), pageWidth - margin - 2, currentY, { align: 'right' });
  
  currentY += 6;
  doc.text('2. Tuition Fee', margin + 2, currentY);
  doc.text(formatCurrencyValue(tuitionFee), pageWidth - margin - 2, currentY, { align: 'right' });

  // --- SUMMARY SECTION ---
  
  currentY += 8;
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, currentY, pageWidth - (margin * 2), 8, 'F');
  doc.line(margin, currentY, pageWidth - margin, currentY);
  doc.line(margin, currentY + 8, pageWidth - margin, currentY + 8);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', margin + 2, currentY + 6);
  doc.text(`Amount (${currency})`, pageWidth - margin - 2, currentY + 6, { align: 'right' });
  
  currentY += 8;
  currentY += 6;
  doc.setFont('helvetica', 'normal');
  doc.text('1. Total Fees', margin + 2, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrencyValue(student.totalFees || 0), pageWidth - margin - 2, currentY, { align: 'right' });

  currentY += 10;

  // --- CALCULATION FOOTER ---
  
  doc.line(margin, currentY, pageWidth - margin, currentY);
  
  const calcY = currentY + 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  // Left side
  doc.text('Payment mode', col1X, calcY);
  doc.text(formatPaymentMethodLabel(currentPayment.method), col2X, calcY);
  
  doc.text('Notes', col1X, calcY + 6);
  doc.text(currentPayment.description || '-', col2X, calcY + 6);

  // Right side (Summary totals)
  const totalAmountToPay = student.totalFees || 0;
  
  // Calculate previous payments (sum of all payments before THIS one)
  const currentPaymentDate = new Date(currentPayment.date);
  const previousPayments = allPayments
    .filter(p => new Date(p.date) < currentPaymentDate && p.id !== currentPayment.id)
    .reduce((sum, p) => sum + p.amount, 0);
  
  const totalAmountPaid = previousPayments + currentPayment.amount;
  const totalDueAmount = totalAmountToPay - totalAmountPaid;

  const rightColLabelX = pageWidth / 2 + 10;
  const rightColValueX = pageWidth - margin - 2;

  doc.text('Total amount to pay', rightColLabelX, calcY);
  doc.text(formatCurrencyValue(totalAmountToPay), rightColValueX, calcY, { align: 'right' });
  
  doc.text('Previous Payments', rightColLabelX, calcY + 6);
  doc.text(formatCurrencyValue(previousPayments), rightColValueX, calcY + 6, { align: 'right' });
  
  doc.text('Total amount paid', rightColLabelX, calcY + 12);
  doc.text(formatCurrencyValue(totalAmountPaid), rightColValueX, calcY + 12, { align: 'right' });
  
  doc.text('Total due amount', rightColLabelX, calcY + 18);
  doc.text(formatCurrencyValue(totalDueAmount), rightColValueX, calcY + 18, { align: 'right' });

  currentY += 30;

  // --- FINAL HIGHLIGHT ---
  
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, currentY, pageWidth - (margin * 2), 10, 'F');
  doc.line(margin, currentY, pageWidth - margin, currentY);
  doc.line(margin, currentY + 10, pageWidth - margin, currentY + 10);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Amount paid', pageWidth - margin - 60, currentY + 7);
  doc.text(formatCurrencyValue(currentPayment.amount), pageWidth - margin - 2, currentY + 7, { align: 'right' });

  // Border boxes for the whole thing (to match mockup)
  doc.setLineWidth(0.2);
  doc.rect(margin, 55, pageWidth - (margin * 2), currentY + 10 - 55);

  currentY += 18;

  // --- FOOTER NOTE ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Thank you for your payment. This is a computer-generated receipt. All payment made is NON-REFUNDABLE.', margin, currentY);

  // Save to file system if running in desktop app
  if (fileSystem.isDesktopApp()) {
    try {
      const pdfData = doc.output('arraybuffer');
      const baseFilename = `Receipt_${currentPayment.reference || 'PAY'}_${student.name.replace(/\s+/g, '_')}`;
      const semesterLabel = currentPayment.semester ? `Semester ${currentPayment.semester}` : 'General';
      
      await fileSystem.savePDF(
        student.course || 'Other',
        student.program || 'General',
        student.name,
        semesterLabel,
        baseFilename,
        pdfData
      );
    } catch (error) {
      console.error('❌ Failed to save receipt to file system:', error);
    }
  }

  return doc;
}

/**
 * Generate and download a receipt PDF for Fee (Registration/Commission)
 * @param {object} student - Student object
 * @param {string} feeType - 'Registration Fee' or 'Commission Fee'
 * @param {number} amount - Amount paid
 * @param {string} receiptNo - Receipt number
 * @param {string} paidTo - Optional 'Paid To' info for commission
 */
export async function generateFeeReceiptPDF(student, feeType, amount, receiptNo, paidTo = null) {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4'
  });

  const currency = await db.getSetting('currency') || 'RM';
  const institutionName = "Spectrum International College of Technology (TVET)";
  const addressLine1 = "No 13G, Jalan OP 1/2, One Puchong Business Park,";
  const addressLine2 = "Puchong, Selangor, Malaysia";

  // Configuration
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 15;

  // --- HEADER SECTION ---
  try {
    const isTwintech = (student.program || '').toLowerCase().includes('twintech') || 
                      (student.course || '').toLowerCase().includes('twintech');
    const logoSrc = isTwintech ? Icons.twintech : Icons.spectrum;
    doc.addImage(logoSrc, 'PNG', margin, currentY, 30, 30);
  } catch (error) {
    console.warn('Could not add logo to PDF:', error);
    doc.setFontSize(10);
    doc.text('[Logo]', margin + 10, currentY + 15);
  }

  // Institution Name & Address
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(institutionName, margin + 45, currentY + 10);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(addressLine1, margin + 45, currentY + 18);
  doc.text(addressLine2, margin + 45, currentY + 24);

  currentY += 40;

  // --- RECEIPT INFO BAR ---
  doc.setLineWidth(0.5);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`${feeType} Receipt`, margin + 2, currentY + 6);
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Receipt No.: ${receiptNo || 'N/A'}`, pageWidth / 2, currentY + 6, { align: 'center' });
  
  // Use today's date since we don't store fee payment date
  const today = new Date();
  doc.text(`Date: ${formatDate(today, 'malaysian')}`, pageWidth - margin - 2, currentY + 6, { align: 'right' });
  
  doc.line(margin, currentY + 10, pageWidth - margin, currentY + 10);
  currentY += 10;

  // --- STUDENT INFO ---
  // Reuse similar layout to semester receipt but simplified
  doc.setFontSize(9);
  const col1X = margin + 2;
  const col2X = margin + 45;
  
  currentY += 8;
  doc.setFont('helvetica', 'normal');
  doc.text('Student Name', col1X, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text((student.name || '').toUpperCase(), col2X, currentY);
  
  currentY += 6;
  doc.setFont('helvetica', 'normal');
  doc.text('Programme', col1X, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(student.program || student.course || 'N/A', col2X, currentY);

  if (paidTo) {
    currentY += 6;
    doc.setFont('helvetica', 'normal');
    doc.text('Paid To', col1X, currentY);
    doc.setFont('helvetica', 'bold');
    doc.text(paidTo, col2X, currentY);
  }

  currentY += 10;

  // --- PARTICULARS TABLE ---
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, currentY, pageWidth - (margin * 2), 8, 'F');
  doc.line(margin, currentY, pageWidth - margin, currentY);
  doc.line(margin, currentY + 8, pageWidth - margin, currentY + 8);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Particulars', margin + 2, currentY + 6);
  doc.text(`Amount (${currency})`, pageWidth - margin - 2, currentY + 6, { align: 'right' });
  
  currentY += 14;
  doc.setFont('helvetica', 'normal');
  doc.text(`1. ${feeType}`, margin + 2, currentY);
  doc.text(formatCurrencyValue(amount), pageWidth - margin - 2, currentY, { align: 'right' });

  // --- TOTAL ---
  currentY += 10;
  doc.setLineWidth(0.2);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  
  currentY += 10;
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, currentY, pageWidth - (margin * 2), 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Total Paid', pageWidth - margin - 60, currentY + 7);
  doc.text(formatCurrencyValue(amount), pageWidth - margin - 2, currentY + 7, { align: 'right' });

  // Border
  doc.rect(margin, 55, pageWidth - (margin * 2), currentY + 10 - 55);

  currentY += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Thank you for your payment. This is a computer-generated receipt.', margin, currentY);

  // Save to file system
  if (fileSystem.isDesktopApp()) {
    try {
      const pdfData = doc.output('arraybuffer');
      const baseFilename = `${feeType.replace(/\s+/g, '_')}_Receipt_${student.name.replace(/\s+/g, '_')}`;
      
      // Pass null for semester to save in student root folder
      const result = await fileSystem.savePDF(
        student.course || 'Other',
        student.program || 'General',
        student.name,
        null, // No semester folder for fees
        baseFilename,
        pdfData
      );

      if (result.success) {
        // Notify user of success and location
        setTimeout(() => alert(`✅ Receipt saved to:\n${result.path}`), 100);
      } else {
        alert(`❌ Failed to save receipt: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Failed to save fee receipt to file system:', error);
      alert(`❌ Error saving receipt: ${error.message}`);
    }
  }

  return doc;
}

/**
 * Download PDF file
 * @param {jsPDF} doc - PDF document
 * @param {string} filename - Filename for download
 */
export function downloadPDF(doc, filename) {
  doc.save(filename);
}

/**
 * Preview PDF in a new tab without auto-printing
 * @param {jsPDF} doc - PDF document
 * @param {string} title - Optional title for the preview window
 */
export function previewPDF(doc, title) {
  if (title) {
    doc.setProperties({
      title: title
    });
  }
  const blobUrl = doc.output('bloburl');
  window.open(blobUrl, '_blank');
}

/**
 * Print PDF - Triggers print dialog
 * @param {jsPDF} doc - PDF document
 */
export function printPDF(doc) {
  doc.autoPrint();
  const blobUrl = doc.output('bloburl');
  window.open(blobUrl, '_blank');
}

/**
 * Placeholder for report generation if needed later
 */
export async function generateMonthlyReportPDF(reportData) {
    const doc = new jsPDF();
    doc.text('Monthly Report - ' + reportData.monthName, 20, 20);
    return doc;
}

/**
 * Helper to format amount for PDF without the currency symbol (added separately in headers)
 */
function formatCurrencyValue(amount) {
  return (parseFloat(amount) || 0).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Helper to match mockup method labels
 */
function formatPaymentMethodLabel(method) {
  const methods = {
    'cash': 'Cash',
    'card': 'Credit Card',
    'bank_transfer': 'Bank Transfer',
    'online': 'Online Payment',
    'other': 'Online Payment', 
    'online_payment': 'Online Payment'
  };
  return methods[method] || 'Online Payment';
}
