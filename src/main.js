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
import { renderTransferHub } from './components/TransferHub.js';
import { Student } from './models/Student.js';
import { exportDatabase, triggerImportDialog } from './utils/exportData.js';
import { initTheme, setTheme } from './components/ThemeToggle.js';
import { setupPacmanEasterEgg } from './components/PacmanEasterEgg.js';
import { renderFirstRunSetup, initFirstRunSetup, firstRunStyles } from './components/FirstRunSetup.js';
import { renderImportWizard, initImportWizard } from './components/ImportWizard.js';
import { fileSystem } from './services/fileSystem.js';
import { autoUpdater } from './components/AutoUpdater.js';
import { initBackground } from './services/background.js';
import { mountReactIsland } from './utils/reactIsland.js';


// Application state
const app = {
  currentPage: 'dashboard',
  initialized: false
};

/**
 * Initialize the application
 */
async function init() {
  console.log('🚀 Initializing SCS...');

  // Initialize theme first (before showing anything)
  initTheme();
  console.log('🎨 Theme initialized');
  // Show loading overlay
  showLoading(true);

  try {
    // Initialize database
    await db.init();
    console.log('✅ Database ready');

    // Initialize background AFTER DB is ready
    initBackground();
    console.log('🌌 Background service initialized');

    // Check if first run setup is needed
    const firstRunCompleted = await db.getSetting('firstRunCompleted');
    
    if (!firstRunCompleted && fileSystem.isDesktopApp()) {
      // Show first run setup
      showLoading(false);
      
      // Add onboarding class to body for CSS overrides
      document.body.classList.add('onboarding-active');

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
      
      // Professional Migration Logic
      const migrationCompleted = await db.getSetting('rxdb_migration_done');
      if (!migrationCompleted) {
        try {
          const { migrateToRxDB } = await import('./db/migration.js');
          await migrateToRxDB();
          await db.setSetting('rxdb_migration_done', true);
        } catch (mErr) {
          console.error('Migration failed:', mErr);
        }
      }

      // Auto-Sync Logic: Update local snapshots for GD backup
      db.onChange = () => {
        if (!db.isImporting) {
          fileSystem.saveSystemSnapshot();
        }
      };
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

    // Setup Pac-Man Easter egg (5 clicks on logo)
    setupPacmanEasterEgg();

    // Load initial page
    await navigateToPage('dashboard');

    // Initialize Auto-Updater (Desktop Only)
    if (fileSystem.isDesktopApp()) {
      autoUpdater.init();
    }

    app.initialized = true;
    console.log('✅ SCS initialized successfully');


  } catch (error) {
    console.error('❌ Initialization error:', error);
    alert('Failed to initialize the application. Please refresh the page.\n\nError: ' + error.message);
  } finally {
    showLoading(false);
  }
}

/**
 * Setup navigation system
 */
function setupNavigation() {
  const sidebar = document.getElementById('sidebar');
  
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
      
      case 'transfer':
        await renderTransferHub();
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
      <div class="flex justify-between items-center mb-2xl">
        <div>
          <h1 style="margin-bottom: 0.5rem;">Settings</h1>
          <p style="margin: 0; color: var(--text-secondary);">Manage your preferences and system configuration.</p>
        </div>
        <div id="settings-theme-toggle"></div>
      </div>



      <div class="card mb-xl">
        <div class="card-header">
          <h3 class="card-title">
            <span class="icon" style="margin-right: 0.5rem;">${Icons.refresh}</span>
            Live Sync Configuration
          </h3>
        </div>
        <div class="card-body">
          <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">
            Connect your professional real-time backend (Supabase) to enable instant syncing across all admin devices.
          </p>
          
          <div class="form-group mb-lg">
            <label class="form-label" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary);">Supabase URL</label>
            <input type="text" id="supabaseUrlInput" class="form-input" placeholder="https://xyz.supabase.co" style="background: rgba(0,0,0,0.05);">
          </div>
          
          <div class="form-group mb-xl">
            <label class="form-label" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary);">Supabase Anon Key</label>
            <input type="password" id="supabaseKeyInput" class="form-input" placeholder="Your anonymous API key" style="background: rgba(0,0,0,0.05);">
          </div>
          
          <div class="flex justify-between items-center">
            <button class="btn btn-primary" id="saveSyncBtn">
               <span class="icon">${Icons.check}</span> Save & Connect
            </button>
            <a href="https://supabase.com" target="_blank" style="font-size: 0.8rem; color: var(--primary-500); text-decoration: none; font-weight: 600;">Create Free Account →</a>
          </div>
        </div>
      </div>

      ${isDesktop ? `
        <div class="card mb-xl">
          <div class="card-header">
            <h3 class="card-title">
              <span class="icon" style="margin-right: 0.5rem;">${Icons.folder}</span>
              Filing Cabinet (Local Storage)
            </h3>
          </div>
          <div class="card-body">
            <p style="margin-bottom: 1rem; color: var(--text-secondary);">
              This folder stores your PDFs and receipts. Syncing this folder via Google Drive provides 15GB of free cloud backup for large files.
            </p>
            
            ${baseFolder ? `
              <div style="padding: 1rem; background: var(--primary-50); border: 2px solid var(--primary-200); border-radius: var(--radius-md); margin-bottom: 1rem;">
                <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Active Vault Path:</div>
                <div style="font-family: 'Courier New', monospace; font-weight: 600; color: var(--primary-600); word-break: break-all;">
                  ${baseFolder}
                </div>
              </div>
            ` : `
              <div style="padding: 1rem; background: var(--warning-50); border: 2px solid var(--warning-200); border-radius: var(--radius-md); margin-bottom: 1rem;">
                <strong>⚠️ No vault selected</strong>
                <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary);">Select a folder inside your Google Drive/OneDrive to enable cloud file sync.</p>
              </div>
            `}
            
            <div class="flex gap-md" style="flex-wrap: wrap;">
              <button class="btn btn-primary" id="changeFolderBtn">
                <span class="icon">${Icons.folder}</span>
                ${baseFolder ? 'Change' : 'Select'} Vault
              </button>
              ${baseFolder ? `
                <button class="btn btn-secondary" id="openFolderBtn">
                  <span class="icon">${Icons.folderOpen}</span>
                  Open in Explorer
                </button>
              ` : ''}
              <button class="btn btn-secondary" id="resetOnboardingBtn" style="margin-left: auto;">
                <span class="icon">${Icons.refresh}</span>
                Reset Onboarding
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="card mb-xl">
        <div class="card-header">
          <h3 class="card-title">
            <span class="icon" style="margin-right: 0.5rem;">🚀</span>
            Software Updates
          </h3>
        </div>
        <div class="card-body">
          <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">
            Ensuring your software is up to date keeps your data secure and gives you access to the latest professional features.
          </p>
          <div class="flex justify-between items-center">
            <div>
              <span style="font-size: 0.8rem; color: var(--text-tertiary);">Current Version:</span>
              <span id="currentVersionText" style="font-weight: 600; color: var(--primary-600);">...</span>
            </div>
            <button class="btn btn-secondary" id="manualUpdateCheckBtn">
              Check for Updates
            </button>
          </div>
        </div>
      </div>

      <div id="theme-selector-container"></div>
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

  const saveSyncBtn = document.getElementById('saveSyncBtn');
  if (saveSyncBtn) {
    // Populate values
    const urlInput = document.getElementById('supabaseUrlInput');
    const keyInput = document.getElementById('supabaseKeyInput');
    
    db.getSetting('supabaseUrl').then(val => urlInput.value = val || '');
    db.getSetting('supabaseKey').then(val => keyInput.value = val || '');

    saveSyncBtn.addEventListener('click', async () => {
      try {
        const url = urlInput.value.trim();
        const key = keyInput.value.trim();
        
        await db.setSetting('supabaseUrl', url);
        await db.setSetting('supabaseKey', key);
        
        alert('✅ Sync configuration saved! Restarting sync engine...');
        window.location.reload();
      } catch (err) {
        alert('❌ Error saving configuration: ' + err.message);
      }
    });
  }

  const manualUpdateCheckBtn = document.getElementById('manualUpdateCheckBtn');
  if (manualUpdateCheckBtn) {
    const versionText = document.getElementById('currentVersionText');
    window.electronAPI.getAppVersion().then(v => versionText.textContent = `v${v}`);

    manualUpdateCheckBtn.addEventListener('click', async () => {
      autoUpdater.handleCheckForUpdates();
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




  // Setup theme toggle for Settings page (SkyToggle)
  const toggleContainer = document.getElementById('settings-theme-toggle');
  if (toggleContainer) {
    import('./components/ui/SkyToggle.jsx').then(module => {
      const SkyToggle = module.default;
      mountReactIsland('settings-theme-toggle', SkyToggle, {
        initialTheme: document.documentElement.getAttribute('data-theme') || 'light',
        onToggle: (theme) => {
          setTheme(theme);
        }
      });
    });
  }

  // Mount Theme Selector
  const themeSelectorContainer = document.getElementById('theme-selector-container');
  if (themeSelectorContainer) {
    import('./components/ui/ThemeSelector.jsx').then(module => {
      const ThemeSelector = module.default;
      mountReactIsland('theme-selector-container', ThemeSelector);
    });
  }
}

/**
 * Show a prompt to restore data from a detected snapshot
 */
async function showRestorationPrompt() {
  const modal = document.createElement('div');
  modal.id = 'restoration-modal';
  modal.innerHTML = `
    <div class="modal-backdrop" style="z-index: 9999;">
      <div class="modal" style="max-width: 500px; text-align: center; padding: 2rem;">
        <div style="font-size: 3.5rem; margin-bottom: 1.5rem; color: var(--primary-600);">
          <span class="icon">${Icons.folderOpen}</span>
        </div>
        <h2 style="margin-bottom: 1rem;">Existing Data Detected!</h2>
        <p style="color: var(--text-secondary); margin-bottom: 2rem; line-height: 1.6;">
          We found an existing <b>sync_data.json</b> in your library folder. Would you like to restore your students and payments from this folder?
        </p>
        <div class="flex gap-md justify-center">
          <button class="btn btn-secondary" onclick="document.getElementById('restoration-modal').remove()">
            No, start fresh
          </button>
          <button class="btn btn-primary" id="restoreSnapshotBtn">
            Yes, restore everything
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('restoreSnapshotBtn').addEventListener('click', async () => {
    try {
      showLoading(true);
      const data = await fileSystem.loadSystemSnapshot();
      if (data) {
        // [New Safety Step] Create emergency backup of current (empty or stale) DB just in case
        const backupPath = await fileSystem.createLocalEmergencyBackup();
        console.log('🛡️ Emergency backup created before restoration:', backupPath);

        db.isImporting = true;
        await db.importData(data);
        db.isImporting = false;
        
        document.getElementById('restoration-modal').remove();
        alert(`🎉 Data restored successfully!\n\nSafety backup created at:\n${backupPath || 'Library/backups/'}`);
        window.location.reload(); // Reload to refresh everything
      }
    } catch (error) {
      console.error('Restoration failed:', error);
      alert('Failed to restore data. The file might be corrupted or incompatible.');
    } finally {
      showLoading(false);
    }
  });
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Export for global access
window.app = app;
