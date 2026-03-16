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
    const modalBody = modalContainer.querySelector('.modal-body');
    if (modalBody) modalBody.innerHTML = ''; // Clear object to stop rendering
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
  };

  closeBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', closeModal);

  printBtn?.addEventListener('click', () => {
    const frame = document.getElementById('pdfPreviewFrame');
    const embed = document.getElementById('pdfPreviewEmbed');
    
    // For iframes, we can try direct print
    if (frame && frame.contentWindow) {
      try {
        return frame.contentWindow.print();
      } catch (e) { console.warn('Iframe print failed'); }
    }

    // For embeds or if frame print failed, the most robust way in Electron is a new window with the blob
    if (currentBlobUrl) {
      const printWin = window.open(currentBlobUrl, '_blank');
      if (printWin) {
        printWin.onload = () => {
          printWin.print();
          // Optional: close after print
          // printWin.onafterprint = () => printWin.close();
        };
      }
    } else {
      alert('Could not prepare document for printing. Please try downloading instead.');
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
 * @param {object} saveResult - Result from fileSystem.savePDF { success, path, error }
 */
export function openPdfPreviewModal(doc, filename, saveResult = null) {
  const modal = document.getElementById('pdfPreviewModal');
  if (!modal) {
    initPdfPreviewModal();
    return openPdfPreviewModal(doc, filename, saveResult);
  }

  // Sanitize filename to remove characters that break URI headers or Windows filesystems (like slashes)
  const sanitizedFilename = filename.replace(/[\/\\?%*:|"<>]/g, '-');
  const displayTitle = sanitizedFilename.replace(/_/g, ' ');
  
  // Clean up old blob and create a new one
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
  const pdfBlob = doc.output('blob');
  currentBlobUrl = URL.createObjectURL(pdfBlob);
  currentFilename = displayTitle.endsWith('.pdf') ? displayTitle : `${displayTitle}.pdf`;


  document.getElementById('pdfModalTitle').textContent = displayTitle;
  
  const modalBody = document.querySelector('.pdf-modal .modal-body');
  
  // Define fallback target: prefer the actual saved file path, then the blob URL
  const fallbackPath = saveResult?.success ? saveResult.path : currentBlobUrl;
  const isNativeFallback = !!(saveResult?.success && window.electronAPI);
  const fallbackAction = isNativeFallback 
    ? `window.electronAPI.openFile('${saveResult.path.replace(/\\/g, '\\\\')}')`
    : `window.open('${currentBlobUrl}', '_blank')`;

  // Using iframe with the BLOB URL (shorter, safer than DataURI for long documents)
  // Removing #fragments as they can sometimes interfere with initial plugin load on Windows
  modalBody.innerHTML = `
    <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-tertiary); pointer-events: none; z-index: 0; background: #525659;">
      <div class="loader-spinner" style="width: 2rem; height: 2rem; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 1rem;"></div>
      <p>Rendering Receipt...</p>
      <small style="margin-top: 0.5rem; opacity: 0.7;">If it remains blank, please use the button below.</small>
    </div>
    <iframe 
      id="pdfPreviewFrame"
      src="${currentBlobUrl}" 
      width="100%" 
      height="100%"
      style="position: relative; z-index: 1; border:none; background: transparent;"
      onload="this.style.background='#525659'"
    ></iframe>
    <div style="position: absolute; bottom: 1.5rem; left: 0; right: 0; display: flex; justify-content: center; z-index: 10; pointer-events: none;">
      <button class="btn btn-secondary btn-sm" style="pointer-events: auto; background: var(--surface); box-shadow: var(--shadow-xl); border: 1px solid var(--border-color); padding: 0.75rem 1.25rem;" onclick="${fallbackAction}">
        <span class="icon" style="margin-right: 0.5rem;">${Icons.external || Icons.fileText}</span>
        <span>Trouble viewing? Open in System Viewer</span>
      </button>
    </div>
    <style>
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  `;
  
  modal.style.display = 'flex';
}

// Expose globally for components not using modules
window.initPdfPreviewModal = initPdfPreviewModal;
window.openPdfPreviewModal = openPdfPreviewModal;
