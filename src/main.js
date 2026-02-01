/**
 * MAIN APPLICATION ENTRY POINT
 * Initializes the app, database, and handles routing
 */

import './styles/index.css';
import './styles/import-wizard.css';
import { db } from './db/database.js';
import { Icons } from './utils/icons.js';
import { renderDashboard } from './components/Dashboard.js';
import { renderStudents } from './components/Students.js';

import { renderReports } from './components/Reports.js';
import { renderSpreadsheet } from './components/Spreadsheet.js';
import { Student } from './models/Student.js';
import { exportDatabase, triggerImportDialog } from './utils/exportData.js';
import { createThemeToggle, initTheme, setupThemeToggle } from './components/ThemeToggle.js';
import { setupPacmanEasterEgg } from './components/PacmanEasterEgg.js';
import { renderFirstRunSetup, initFirstRunSetup, firstRunStyles } from './components/FirstRunSetup.js';
import { renderImportWizard, initImportWizard } from './components/ImportWizard.js';
import { fileSystem } from './services/fileSystem.js';

// Application state
const app = {
  currentPage: 'dashboard',
  initialized: false
};

/**
 * Initialize the application
 */
async function init() {
  console.log('🚀 Initializing NeoTrackr...');

  // Initialize theme first (before showing anything)
  initTheme();

  // Show loading overlay
  showLoading(true);

  try {
    // Initialize database
    await db.init();
    console.log('✅ Database ready');

    // Check if first run setup is needed
    const firstRunCompleted = await db.getSetting('firstRunCompleted');
    
    if (!firstRunCompleted && fileSystem.isDesktopApp()) {
      // Show first run setup
      showLoading(false);
      
      // Inject first run styles
      const styleTag = document.createElement('style');
      styleTag.textContent = firstRunStyles;
      document.head.appendChild(styleTag);
      
      // Render first run setup
      const container = document.getElementById('app-content');
      container.innerHTML = renderFirstRunSetup();
      initFirstRunSetup();
      
      return; // Don't continue with normal app initialization
    }

    // Initialize file system (desktop app only)
    if (fileSystem.isDesktopApp()) {
      await fileSystem.init();
      console.log('✅ File system ready');
    }

    // Auto-sync student statuses based on completion dates
    await Student.syncStatusWithCompletionDate();

    // Setup theme toggle
    const toggleContainer = document.getElementById('theme-toggle-container');
    if (toggleContainer) {
      toggleContainer.innerHTML = createThemeToggle();
      setupThemeToggle();
    }

    // Setup navigation
    setupNavigation();

    // Setup quick action buttons
    setupQuickActions();

    // Setup Pac-Man Easter egg (5 clicks on logo)
    setupPacmanEasterEgg();

    // Load initial page
    await navigateToPage('dashboard');

    app.initialized = true;
    console.log('✅ NeoTrackr initialized successfully');

  } catch (error) {
    console.error('❌ Initialization error:', error);
    alert('Failed to initialize the application. Please refresh the page.');
  } finally {
    showLoading(false);
  }
}

/**
 * Setup navigation system
 */
function setupNavigation() {
  // Handle navigation clicks
  const navLinks = document.querySelectorAll('.nav-link');
  
  navLinks.forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      
      // Update URL hash
      window.location.hash = `#${page}`;
      
      // Navigate to page
      await navigateToPage(page);
      
      // Update active state
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  // Handle browser back/forward
  window.addEventListener('hashchange', async () => {
    const page = window.location.hash.replace('#', '') || 'dashboard';
    await navigateToPage(page);
    
    // Update active nav link
    navLinks.forEach(link => {
      if (link.dataset.page === page) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  });
}

/**
 * Navigate to a specific page
 * @param {string} page - Page name
 */
async function navigateToPage(page) {
  if (app.currentPage === page && app.initialized) {
    return; // Already on this page
  }

  showLoading(true);
  app.currentPage = page;

  try {
    switch (page) {
      case 'dashboard':
        await renderDashboard();
        break;
      
      case 'students':
        await renderStudents();
        break;
      
      
      case 'reports':
        await renderReports();
        break;
      case 'spreadsheet':
        await renderSpreadsheet();
        break;
      
      case 'settings':
        await renderSettings();
        break;
      
      default:
        await renderDashboard();
    }
  } catch (error) {
    console.error(`Error loading ${page}:`, error);
    showError(`Failed to load ${page} page`);
  } finally {
    showLoading(false);
  }
}

/**
 * Setup quick action buttons in sidebar
 */
function setupQuickActions() {
  const saveBtn = document.getElementById('sidebarSaveBtn');
  const importBtn = document.getElementById('sidebarImportBtn');

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const textSpan = document.getElementById('saveButtonText');
      const originalText = textSpan.textContent;
      
      try {
        // Show loading state
        saveBtn.disabled = true;
        textSpan.textContent = 'Checking...';
        
        // Count records
        const receipts = await db.getAll('receipts');
        const isDesktop = typeof window.electronAPI !== 'undefined';
        
        // Simulate brief check
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Check if files have paths
        const filesWithPaths = receipts.filter(r => r.filePath && r.filePath.length > 0);
        const allSaved = filesWithPaths.length === receipts.length;
        
        // Show success state
        if (allSaved || receipts.length === 0) {
          textSpan.textContent = receipts.length === 0 ? 'No files yet' : 'All saved ✓';
        } else {
          textSpan.textContent = `${filesWithPaths.length}/${receipts.length} saved`;
        }
        
        // Reset after 3 seconds
        setTimeout(() => {
          textSpan.textContent = originalText;
          saveBtn.disabled = false;
        }, 3000);
        
      } catch (error) {
        textSpan.textContent = 'Error';
        setTimeout(() => {
          textSpan.textContent = originalText;
          saveBtn.disabled = false;
        }, 2000);
      }
    });
  }

  if (importBtn) {
    importBtn.addEventListener('click', () => {
      // Show Import Wizard
      const wizardHTML = renderImportWizard();
      document.body.insertAdjacentHTML('beforeend', wizardHTML);
      initImportWizard();
    });
  }
}

/**
 * Show/hide loading overlay
 * @param {boolean} show - Whether to show loading
 */
function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    if (show) {
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  }
}

/**
 * Show error message
 * @param {string} message - Error message
 */
function showError(message) {
  alert(`❌ Error: ${message}`);
}

/**
 * Render Settings page (placeholder)
 */
async function renderSettings() {
  const container = document.getElementById('app-content');
  const currency = await db.getSetting('currency') || 'RM';
  const institutionName = await db.getSetting('institutionName') || 'Education Institution';
  const baseFolder = await db.getSetting('baseFolder');
  const isDesktop = fileSystem.isDesktopApp();
  
  container.innerHTML = `
    <div style="animation: fadeIn 0.5s ease-in-out;">
      <!-- Page Header with Theme Toggle -->
      <div class="flex justify-between items-center mb-xl">
        <h1 style="margin: 0;">Settings</h1>
        <div id="settings-theme-toggle"></div>
      </div>

      <div class="card mb-xl">
        <div class="card-header">
          <h3 class="card-title">General Settings</h3>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Institution Name</label>
            <input type="text" id="institutionName" class="form-input" value="${institutionName}" />
          </div>



          <button class="btn btn-success" id="saveSettingsBtn">
            <span class="icon">${Icons.checkCircle}</span>
            Save Settings
          </button>
        </div>
      </div>

      ${isDesktop ? `
        <div class="card mb-xl">
          <div class="card-header">
            <h3 class="card-title">
              <span class="icon" style="margin-right: 0.5rem;">${Icons.folder}</span>
              File Storage Location
            </h3>
          </div>
          <div class="card-body">
            <p style="margin-bottom: 1rem; color: var(--text-secondary);">
              All payment receipts, proofs, and statements are stored in this folder.
            </p>
            
            ${baseFolder ? `
              <div style="padding: 1rem; background: var(--primary-50); border: 2px solid var(--primary-200); border-radius: var(--radius-md); margin-bottom: 1rem;">
                <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Current Folder:</div>
                <div style="font-family: 'Courier New', monospace; font-weight: 600; color: var(--primary-600); word-break: break-all;">
                  ${baseFolder}
                </div>
              </div>
            ` : `
              <div style="padding: 1rem; background: var(--warning-50); border: 2px solid var(--warning-200); border-radius: var(--radius-md); margin-bottom: 1rem;">
                <strong>⚠️ No folder selected</strong>
                <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary);">Please select a folder to enable file storage.</p>
              </div>
            `}
            
            <div class="flex gap-md" style="flex-wrap: wrap;">
              <button class="btn btn-primary" id="changeFolderBtn">
                <span class="icon">${Icons.folder}</span>
                ${baseFolder ? 'Change' : 'Select'} Folder
              </button>
              ${baseFolder ? `
                <button class="btn btn-secondary" id="openFolderBtn">
                  <span class="icon">${Icons.folderOpen}</span>
                  Open in Explorer
                </button>
                <button class="btn btn-secondary" id="resetOnboardingBtn" style="margin-left: auto;">
                  <span class="icon">${Icons.refresh}</span>
                  Reset Onboarding
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      ` : ''}

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Data Management</h3>
        </div>
        <div class="card-body">
          <p style="margin-bottom: 1rem; color: var(--text-secondary);">
            All data and files are automatically saved as you work. ${isDesktop ? 'Receipt PDFs are stored in your NeoTrackr folder. ' : 'All data is stored locally in your browser. '}Use the sidebar Save button to check file sync status.
          </p>
          <div style="padding: 1rem; background: var(--success-50); border-left: 4px solid var(--success-500); border-radius: var(--radius-md);">
            <div style="display: flex; align-items: center; gap: 0.75rem; color: var(--success-700);">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; flex-shrink: 0;">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <div>
                <strong>Auto-save enabled</strong>
                <div style="font-size: var(--font-size-sm); margin-top: 0.25rem; opacity: 0.9;">All changes are saved automatically. No manual backup needed.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <style>
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
  `;

  // Folder management buttons (desktop only)
  const changeFolderBtn = document.getElementById('changeFolderBtn');
  if (changeFolderBtn) {
    changeFolderBtn.addEventListener('click', async () => {
      try {
        const newFolder = await fileSystem.selectBaseFolder();
        if (newFolder) {
          alert('✅ Folder changed successfully!');
          await renderSettings(); // Refresh settings page
        }
      } catch (error) {
        console.error('Error changing folder:', error);
        alert('❌ Failed to change folder: ' + error.message);
      }
    });
  }

  const openFolderBtn = document.getElementById('openFolderBtn');
  if (openFolderBtn) {
    openFolderBtn.addEventListener('click', async () => {
      try {
        await window.electronAPI.openFolderInExplorer(baseFolder);
      } catch (error) {
        console.error('Error opening folder:', error);
        alert('Failed to open folder: ' + error.message);
      }
    });
  }

  const resetOnboardingBtn = document.getElementById('resetOnboardingBtn');
  if (resetOnboardingBtn) {
    resetOnboardingBtn.addEventListener('click', async () => {
      const confirmed = confirm('Are you sure you want to reset the onboarding wizard? This will allow you to see the first-run setup again.');
      if (confirmed) {
        await db.deleteSetting('firstRunCompleted');
        alert('Onboarding has been reset! Reload the app to see the setup wizard again.');
      }
    });
  }

  document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    const newInstitutionName = document.getElementById('institutionName').value;
    
    await db.setSetting('institutionName', newInstitutionName);
    await db.setSetting('currency', 'RM');
    
    alert('Settings saved successfully!');
  });
  
  // Setup theme toggle for Settings page  
  const toggleContainer = document.getElementById('settings-theme-toggle');
  if (toggleContainer) {
    toggleContainer.innerHTML = createThemeToggle();
    setupThemeToggle();
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Export for global access
window.app = app;
