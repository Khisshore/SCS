/**
 * PDF PREVIEW MODAL COMPONENT
 * Unified overlay for previewing and printing PDFs
 */

import { Icons } from '../utils/icons.js';

let currentBlobUrl = null;
let currentFilename = 'document.pdf';

/**
 * Initialize the PDF Preview Modal
 */
export function initPdfPreviewModal() {
  if (document.getElementById('pdfPreviewModal')) return;

  const modalContainer = document.createElement('div');
  modalContainer.id = 'pdfPreviewModal';
  modalContainer.className = 'pdf-modal';
  modalContainer.style.display = 'none';

  modalContainer.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-header-info">
          <span class="icon">${Icons.file}</span>
          <h2 id="pdfModalTitle">Document Preview</h2>
        </div>
        <div class="modal-header-actions">
          <button class="btn btn-secondary btn-sm" id="pdfModalPrintBtn">
            <span class="icon">${Icons.printer}</span>
            <span>Print</span>
          </button>
          <button class="btn btn-primary btn-sm" id="pdfModalDownloadBtn">
            <span class="icon">${Icons.download}</span>
            <span>Download</span>
          </button>
          <button class="modal-close-btn" id="pdfModalCloseBtn" title="Close Preview">
            <span class="icon">${Icons.close}</span>
          </button>
        </div>
      </div>
      <div class="modal-body">
        <iframe id="pdfPreviewFrame" src="about:blank"></iframe>
      </div>
    </div>

    <style>
      .pdf-modal {
        position: fixed;
        inset: 0;
        z-index: 3000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        animation: pdfModalFadeIn 0.2s ease-out;
      }

      @keyframes pdfModalFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .pdf-modal .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.6);
        backdrop-filter: blur(8px);
        z-index: 1;
      }

      .pdf-modal .modal-content {
        position: relative;
        z-index: 2;
        width: 100%;
        max-width: 70rem;
        height: 95vh;
        background: var(--surface);
        border-radius: var(--radius-2xl);
        box-shadow: var(--shadow-2xl);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--border-color);
      }

      .pdf-modal .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.5rem;
        border-bottom: 1px solid var(--border-color);
        background: var(--surface);
      }

      .pdf-modal .modal-header-info {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        color: var(--text-primary);
      }

      .pdf-modal .modal-header-info h2 {
        font-size: 1.125rem;
        font-weight: 700;
        margin: 0;
      }

      .pdf-modal .modal-header-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .pdf-modal .modal-body {
        flex: 1;
        background: var(--background-secondary);
        padding: 0;
        display: flex;
      }

      .pdf-modal iframe {
        width: 100%;
        height: 100%;
        border: none;
        background: #525659; /* Standard PDF viewer gray */
      }

      .pdf-modal .modal-close-btn {
        width: 2.25rem;
        height: 2.25rem;
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

      .pdf-modal .modal-close-btn:hover {
        background: var(--danger-50);
        color: var(--danger-600);
      }
    </style>
  `;

  document.body.appendChild(modalContainer);

  // Setup Event Listeners
  const closeBtn = document.getElementById('pdfModalCloseBtn');
  const printBtn = document.getElementById('pdfModalPrintBtn');
  const downloadBtn = document.getElementById('pdfModalDownloadBtn');
  const backdrop = modalContainer.querySelector('.modal-backdrop');

  const closeModal = () => {
    modalContainer.style.display = 'none';
    document.getElementById('pdfPreviewFrame').src = 'about:blank';
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
  };

  closeBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', closeModal);

  printBtn?.addEventListener('click', () => {
    const frame = document.getElementById('pdfPreviewFrame');
    if (frame && frame.contentWindow) {
      frame.contentWindow.print();
    }
  });

  downloadBtn?.addEventListener('click', () => {
    if (currentBlobUrl) {
      const link = document.createElement('a');
      link.href = currentBlobUrl;
      link.download = currentFilename;
      link.click();
    }
  });


  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalContainer.style.display !== 'none') {
      closeModal();
    }
  });

  // Expose to window for global access
  window.closePdfPreviewModal = closeModal;
}

/**
 * Open the PDF Preview Modal
 * @param {jsPDF} doc - jsPDF instance
 * @param {string} filename - Filename for download (without .pdf)
 */
export function openPdfPreviewModal(doc, filename) {
  const modal = document.getElementById('pdfPreviewModal');
  if (!modal) {
    initPdfPreviewModal();
    return openPdfPreviewModal(doc, filename);
  }

  // Cleanup old blob if any (though closeModal does it, safe guard)
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);

  currentFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  currentBlobUrl = doc.output('bloburl');
  
  document.getElementById('pdfModalTitle').textContent = filename.replace(/_/g, ' ');
  // Hide native toolbar to prevent duplicate confusion and random naming issues
  document.getElementById('pdfPreviewFrame').src = `${currentBlobUrl}#toolbar=0&navpanes=0`;
  
  modal.style.display = 'flex';
}

// Expose globally for components not using modules
window.initPdfPreviewModal = initPdfPreviewModal;
window.openPdfPreviewModal = openPdfPreviewModal;
