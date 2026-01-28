/**
 * PDF GENERATOR
 * Creates PDF documents for receipts and reports using jsPDF
 */

import jsPDF from 'jspdf';
import { formatCurrency, formatDate, formatPaymentMethod } from './formatting.js';
import { fileSystem } from '../services/fileSystem.js';
import { db } from '../db/database.js';

/**
 * Generate a receipt PDF
 * @param {object} receiptData - Receipt information
 * @param {object} studentData - Student information
 * @param {object} paymentData - Payment information
 * @returns {jsPDF} - PDF document
 */
export async function generateReceiptPDF(receiptData, studentData, paymentData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 20;

  // Get institution name from settings
  const institutionName = await db.getSetting('institutionName') || 'NeoTrackr Payment Management';

  // Header - Institution Name
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('PAYMENT RECEIPT', pageWidth / 2, y, { align: 'center' });
  
  y += 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(institutionName, pageWidth / 2, y, { align: 'center' });
  
  // Line separator
  y += 10;
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  
  // Receipt Details
  y += 15;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Receipt Number: ${receiptData.receiptNumber}`, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${formatDate(receiptData.generatedAt, 'long')}`, pageWidth - margin, y, { align: 'right' });
  
  // Student Information Box
  y += 15;
  doc.setFillColor(249, 250, 251);
  doc.rect(margin, y, pageWidth - 2 * margin, 30, 'F');
  
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Student Information', margin + 5, y);
  
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.text(`Name: ${studentData.name}`, margin + 5, y);
  
  y += 6;
  doc.text(`Student ID: ${studentData.studentId}`, margin + 5, y);
  
  y += 6;
  doc.text(`Program: ${studentData.program}`, margin + 5, y);
  
  // Payment Details
  y += 15;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Payment Details', margin, y);
  
  y += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  // Payment table
  const paymentDetails = [
    ['Payment Date:', formatDate(paymentData.date, 'long')],
    ['Payment Method:', formatPaymentMethod(paymentData.method)],
    ['Reference Number:', paymentData.reference || 'N/A'],
    ['Description:', paymentData.description || 'Payment']
  ];
  
  paymentDetails.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + 50, y);
    y += 7;
  });
  
  // Amount Box
  y += 10;
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(1);
  doc.rect(margin, y, pageWidth - 2 * margin, 20);
  
  y += 13;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Total Amount Paid:', margin + 5, y);
  doc.setFontSize(16);
  const currency = await db.getSetting('currency') || 'RM';
  doc.text(formatCurrency(paymentData.amount, currency), pageWidth - margin - 5, y, { align: 'right' });
  
  // Footer
  y = doc.internal.pageSize.getHeight() - 40;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.text('Thank you for your payment!', pageWidth / 2, y, { align: 'center' });
  
  y += 10;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth / 2 - 10, y);
  
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text('Authorized Signature', pageWidth / 2, y, { align: 'center' });
  
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('This is a computer-generated receipt and does not require a physical signature.', pageWidth / 2, y, { align: 'center' });
  
  // Save to file system if running in desktop app
  if (fileSystem.isDesktopApp() && studentData.program && studentData.name) {
    try {
      const pdfData = doc.output('arraybuffer');
      const fileName = `Receipt-${receiptData.receiptNumber}`;
      const semester = paymentData.semester || 'Semester 1'; // Default to Semester 1 if not specified
      
      await fileSystem.savePDF(
        studentData.program,
        studentData.name,
        semester,
        fileName,
        pdfData
      );
      
      console.log('✅ Receipt saved to file system');
    } catch (error) {
      console.error('❌ Failed to save receipt to file system:', error);
      // Don't throw error - PDF generation should still succeed even if file save fails
    }
  }
  
  return doc;
}

/**
 * Generate monthly report PDF
 * @param {object} reportData - Report data
 * @returns {jsPDF} - PDF document
 */
export async function generateMonthlyReportPDF(reportData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 20;

  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Monthly Financial Statement', pageWidth / 2, y, { align: 'center' });
  
  y += 10;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(`${reportData.monthName} ${reportData.year}`, pageWidth / 2, y, { align: 'center' });
  
  // Line separator
  y += 10;
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  
  // Summary Statistics
  y += 15;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', margin, y);
  
  y += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const currency = await db.getSetting('currency') || 'RM';
  const summaryItems = [
    ['Total Payments:', `${reportData.statistics.totalPayments}`],
    ['Total Amount:', formatCurrency(reportData.statistics.totalAmount, currency)],
    ['Average Payment:', formatCurrency(reportData.statistics.totalAmount / reportData.statistics.totalPayments || 0, currency)]
  ];
  
  summaryItems.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + 60, y);
    y += 7;
  });
  
  // Payment Methods Breakdown
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Payment Methods Breakdown', margin, y);
  
  y += 10;
  doc.setFontSize(10);
  
  Object.entries(reportData.statistics.byMethod).forEach(([method, data]) => {
    if (data.count > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text(`${formatPaymentMethod(method)}:`, margin + 5, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`${data.count} payment(s) - ${formatCurrency(data.amount, currency)}`, margin + 60, y);
      y += 7;
    }
  });
  
  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 20;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated on ${formatDate(new Date(), 'long')}`, pageWidth / 2, footerY, { align: 'center' });
  
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
 * Print PDF
 * @param {jsPDF} doc - PDF document
 */
export function printPDF(doc) {
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
}
