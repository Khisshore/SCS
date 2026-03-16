/**
 * MAIN APPLICATION ENTRY POINT
 * Initializes the app, database, and handles routing
 */

import './styles/index.css';
import './styles/import-wizard.css';
import { db } from './db/database.js';
import { Icons } from './utils/icons.js';
import { renderDashboard, renderDashboardSkeleton } from './components/Dashboard.js';
import { renderStudents, renderStudentsSkeleton } from './components/Students.js';

import { renderReports, renderReportsSkeleton } from './components/Reports.js';
import { renderSpreadsheet, renderSpreadsheetSkeleton } from './components/Spreadsheet.js';
import { renderTransferHub, renderTransferHubSkeleton } from './components/TransferHub.js';
import { Student } from './models/Student.js';
import { exportDatabase, triggerImportDialog } from './utils/exportData.js';
import { initTheme, setTheme } from './components/ThemeToggle.js';
import { renderFirstRunSetup, initFirstRunSetup, firstRunStyles } from './components/FirstRunSetup.js';
import { renderImportWizard, initImportWizard } from './components/ImportWizard.js';
import { fileSystem } from './services/fileSystem.js';
import googleDriveService from './services/googleDriveService.js';
import syncQueue from './services/syncQueue.js';
import { autoUpdater } from './components/AutoUpdater.js';
import { initBackground } from './services/background.js';
import { mountReactIsland } from './utils/reactIsland.js';
import { initAiChat } from './components/AiChat.js';
import { formatDate } from './utils/formatting.js';


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

  // Layer 4: Request Browser Storage Persistence
  if (navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      console.log(`💾 Storage persisted: ${isPersisted}`);
    } catch (err) {
      console.warn('⚠️ Could not persist browser storage:', err);
    }
  }

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

      // Dismiss splash screen for onboarding too
      const splash = document.getElementById('splash-screen');
      if (splash) { splash.classList.add('fade-out'); setTimeout(() => splash.remove(), 700); }
      
      return; // Don't continue with normal app initialization
    }

    // Initialize file system (desktop app only)
    if (fileSystem.isDesktopApp()) {
      await fileSystem.init();
      console.log('✅ File system ready');

      // Initialize Google Drive Cloud Mirror (restore saved connection)
      try {
        await googleDriveService.init();
        console.log('☁️ Google Drive service initialized');

        // Start background sync queue worker
        syncQueue.start();
        db.onCloudSync = (store, action, data) => {
          console.log(`🔄 Sync queue: ${action} on ${store}`);
          syncQueue.markDirty();
        };
        console.log('🔄 Sync queue worker active');

        // Launch reconciliation: catch-up sync in background after app loads
        setTimeout(async () => {
          try {
            const result = await googleDriveService.performCatchUpSync();
            if (result.action === 'completed') {
              console.log(`☁️ Catch-up sync done (${result.conflicts} conflicts)`);
            }
          } catch (e) {
            console.warn('☁️ Catch-up sync failed:', e.message);
          }
        }, 3000);

        // Shutdown guard: flush sync queue before app closes
        if (window.electronAPI?.onBeforeQuit) {
          window.electronAPI.onBeforeQuit(async () => {
            // Layer 2: Immediate shutdown backup
            try {
              if (db.performShutdownBackup) await db.performShutdownBackup();
            } catch (err) {
              console.warn('⚠️ Shutdown backup failed:', err);
            }

            if (syncQueue.getStatus() !== 'idle') {
              // Show brief overlay
              const overlay = document.createElement('div');
              overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;color:white;font-size:1.1rem;font-weight:600;font-family:inherit;backdrop-filter:blur(8px);';
              overlay.innerHTML = '<div style="text-align:center"><div style="margin-bottom:0.5rem;">⏳</div>Finalizing Cloud Sync...</div>';
              document.body.appendChild(overlay);
              await syncQueue.flushBeforeQuit();
            }
          });
        }
      } catch (e) {
        console.warn('☁️ Google Drive init skipped:', e.message);
      }
      
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

      // Live-Sync Action Engine (debounced to prevent glitchy rapid-fire refreshes)
      let refreshTimer = null;
      db.onChange = () => {
        if (!db.isImporting) {
          // 1. Save local backup snapshot (for GD sync)
          fileSystem.saveSystemSnapshot();
          
          // 2. DEBOUNCED REFRESH: Wait for batch to finish before re-rendering
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            const content = document.getElementById('main-content');
            if (content) {
              content.style.opacity = '0.6';
              content.style.transition = 'opacity 0.15s ease';
            }
            
            navigateToPage(app.currentPage, true);
            
            // Fade back in after render
            requestAnimationFrame(() => {
              const c = document.getElementById('main-content');
              if (c) {
                c.style.opacity = '1';
              }
            });
          }, 300);
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

    // Load initial page
    await navigateToPage('dashboard');

    // Initialize Auto-Updater (Desktop Only)
    if (fileSystem.isDesktopApp()) {
      autoUpdater.init();
    }

    // Initialize AI Chat Assistant (hidden by default — triple-click logo to toggle)
    try {
      const aiRoot = document.getElementById('aiChatRoot');
      const aiVisible = localStorage.getItem('scs_ai_visible') === 'true';

      if (aiRoot) {
        aiRoot.style.display = aiVisible ? '' : 'none';
      }

      initAiChat();

      // ═══ TRIPLE-CLICK LOGO → TOGGLE AI OWL ═══
      const logoEl = document.querySelector('.logo-icon');
      if (logoEl) {
        let clickCount = 0;
        let clickTimer = null;

        logoEl.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          clickCount++;

          if (clickTimer) clearTimeout(clickTimer);
          clickTimer = setTimeout(() => { clickCount = 0; }, 800);

          if (clickCount >= 3) {
            clickCount = 0;
            clearTimeout(clickTimer);

            const root = document.getElementById('aiChatRoot');
            if (!root) return;

            const isNowVisible = root.style.display === 'none';
            root.style.display = isNowVisible ? '' : 'none';
            localStorage.setItem('scs_ai_visible', isNowVisible ? 'true' : 'false');

            // Subtle logo pulse feedback
            logoEl.style.transition = 'transform 0.2s ease';
            logoEl.style.transform = 'scale(1.2)';
            setTimeout(() => { logoEl.style.transform = 'scale(1)'; }, 200);
          }
        });
      }
    } catch (aiError) {
      console.error('⚠️ AI Chat initialization failed (non-fatal):', aiError);
    }

    app.initialized = true;
    console.log('✅ SCS initialized successfully');

    // ═══ SPLASH SCREEN HANDOFF ═══
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('fade-out');
      setTimeout(() => splash.remove(), 700); // Remove from DOM after fade
    }


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
async function navigateToPage(page, force = false) {
  if (!force && app.currentPage === page && app.initialized) {
    return; // Already on this page
  }

  // Show page-specific skeleton INSTANTLY (no spinner)
  switch (page) {
    case 'dashboard':  renderDashboardSkeleton(); break;
    case 'students':   renderStudentsSkeleton(); break;
    case 'spreadsheet': renderSpreadsheetSkeleton(); break;
    case 'reports':    renderReportsSkeleton(); break;
    case 'settings':   renderSettingsSkeleton(); break;
    case 'transfer':   renderTransferHubSkeleton(); break;
    default:           showLoading(true); break; // Fallback for pages without skeletons
  }

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
  showSettingsModal({
    title: 'Error',
    message: `❌ ${message}`,
    type: 'alert'
  });
}

/**
 * Custom Settings Modal for premium UI
 */
async function showSettingsModal(options) {
  return new Promise((resolve) => {
    const { title, message, type = 'confirm', confirmText = 'OK', cancelText = 'Cancel', icon = Icons.info } = options;
    
    // Theme awareness for elegant presentation
    const isError = title.toLowerCase().includes('error') || title.toLowerCase().includes('failed');
    const isSuccess = type === 'success' || title.toLowerCase().includes('success') || title.toLowerCase().includes('complete') || title.toLowerCase().includes('active');
    
    let iconColor = 'var(--primary-600)';
    let iconBg = 'var(--primary-50)';
    let btnClass = 'btn-primary';

    if (isError) {
      iconColor = 'var(--error-600, #DC2626)';
      iconBg = 'var(--error-50, #FEF2F2)';
      btnClass = 'btn-danger';
    } else if (isSuccess) {
      iconColor = 'var(--success-600, #059669)';
      iconBg = 'var(--success-50, #ECFDF5)';
      btnClass = 'btn-success';
    }

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    // Deep blur for the backdrop
    modal.style.cssText = 'z-index: 10000; position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); animation: fadeIn 0.3s ease forwards;';
    
    // Premium Glassmorphism Card
    modal.innerHTML = `
      <div class="scs-modal-card">
        
        <div class="scs-modal-body">
          <div class="scs-modal-icon-wrap" style="background: ${iconBg}; color: ${iconColor};">
            <div style="width: 24px; height: 24px;">${icon || Icons.sparkles}</div>
          </div>
          <h3 class="scs-modal-title">${title}</h3>
          <p class="scs-modal-message">${message}</p>
        </div>
        
        <div class="scs-modal-footer">
          ${type === 'confirm' ? `
            <button class="btn btn-secondary scs-modal-btn" id="modal-cancel-btn">${cancelText}</button>
          ` : ''}
          <button class="btn ${btnClass} scs-modal-btn" id="modal-confirm-btn">${confirmText}</button>
        </div>
      </div>
      
      <style>
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalScaleUp { from { transform: scale(0.95) translateY(12px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        
        .scs-modal-card {
          max-width: 460px;
          width: 90%;
          animation: modalScaleUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          box-shadow: 0 32px 64px -16px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255,255,255,0.08) inset;
          border: 1px solid rgba(200, 200, 200, 0.12);
          border-radius: 24px;
          overflow: hidden;
          background: var(--surface);
          backdrop-filter: blur(32px) saturate(200%);
          -webkit-backdrop-filter: blur(32px) saturate(200%);
        }
        .scs-modal-body {
          padding: 2.5rem 2.25rem 2rem 2.25rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 1rem;
        }
        .scs-modal-icon-wrap {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-bottom: 0.25rem;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
        }
        .scs-modal-title {
          margin: 0;
          font-size: 1.3rem;
          font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.02em;
          line-height: 1.25;
        }
        .scs-modal-message {
          color: var(--text-secondary);
          line-height: 1.65;
          font-size: 0.95rem;
          margin: 0;
          max-width: 340px;
        }
        .scs-modal-footer {
          display: flex;
          justify-content: center;
          gap: 0.85rem;
          padding: 1.5rem 2.25rem;
          background: rgba(128, 128, 128, 0.06);
          border-top: 1px solid rgba(128, 128, 128, 0.1);
        }
        .scs-modal-btn {
          min-width: 120px;
          font-weight: 600;
          border-radius: 12px;
          padding: 0.65rem 1.5rem;
          transition: all 0.2s ease;
        }
        .btn-success {
          background: var(--success-600, #059669);
          color: white;
          border: none;
        }
        .btn-success:hover { background: var(--success-500, #10b981); transform: translateY(-1px); }
        .btn-danger {
          background: var(--danger-600, #dc2626);
          color: white;
          border: none;
        }
        .btn-danger:hover { background: var(--danger-500, #ef4444); transform: translateY(-1px); }
      </style>
    `;

    document.body.appendChild(modal);

    const closeModal = (result) => {
      modal.style.opacity = '0';
      modal.style.transition = 'opacity 0.2s ease';
      setTimeout(() => {
        modal.remove();
        resolve(result);
      }, 200);
    };

    modal.querySelector('#modal-confirm-btn').addEventListener('click', () => closeModal(true));
    if (type === 'confirm') {
      modal.querySelector('#modal-cancel-btn').addEventListener('click', () => closeModal(false));
    }
  });
}

/**
 * Render Settings Page Skeleton
 */
function renderSettingsSkeleton() {
  const container = document.getElementById('app-content');
  container.innerHTML = `
    <div class="skeleton-page settings-page">
      <div class="flex justify-between items-center mb-2xl">
        <div>
          <div class="skeleton skeleton-heading" style="width:140px"></div>
          <div class="skeleton skeleton-text medium"></div>
        </div>
        <div class="skeleton skeleton-circle" style="width:40px;height:40px"></div>
      </div>

      <!-- Update Status Card -->
      <div class="skeleton-card mb-xl">
        <div class="skeleton skeleton-heading" style="width:180px; margin-bottom: 1.5rem;"></div>
        <div class="skeleton skeleton-text full"></div>
        <div class="flex justify-between items-center mt-md">
          <div class="skeleton skeleton-text short"></div>
          <div class="skeleton" style="width:140px; height:36px; border-radius:var(--radius-md)"></div>
        </div>
      </div>

      <!-- Theme Selector Card -->
      <div class="skeleton-card mb-xl" style="height:250px;">
        <div class="skeleton skeleton-heading" style="width:200px; margin-bottom:2rem;"></div>
        <div class="grid grid-3 gap-md">
          <div class="skeleton" style="height:140px; border-radius:var(--radius-lg)"></div>
          <div class="skeleton" style="height:140px; border-radius:var(--radius-lg)"></div>
          <div class="skeleton" style="height:140px; border-radius:var(--radius-lg)"></div>
        </div>
      </div>

      <!-- Advanced Mode Card -->
      <div class="skeleton-card" style="height:80px;">
        <div class="skeleton skeleton-heading" style="width:250px; margin:0;"></div>
      </div>
    </div>
  `;
}

/**
 * Render Settings page
 */
async function renderSettings() {
  const container = document.getElementById('app-content');
  const baseFolder = await db.getSetting('baseFolder');
  const syncTwoWayDeletion = (await db.getSetting('syncTwoWayDeletion')) !== false; 
  const autoMirrorFiles = (await db.getSetting('autoMirrorFiles')) !== false;
  const isDesktop = fileSystem.isDesktopApp();
  
  // Google Drive Cloud Mirror status
  const gdriveStatus = googleDriveService.getStatus();
  const isCloudConfigured = gdriveStatus.connected;
  const cloudFolderHealthy = gdriveStatus.connected;
  const gdriveEmail = gdriveStatus.email || '';
  const gdriveLastSync = gdriveStatus.lastSync;

  const formattedLastSync = gdriveLastSync ? formatDate(gdriveLastSync, 'time') : '';
  
  // Initial Health Check
  let folderHealthy = false;
  let supabaseHealthy = false;
  
  if (isDesktop && baseFolder) {
    folderHealthy = await fileSystem.isFolderHealthy(baseFolder);
    supabaseHealthy = await db.checkSupabaseConnection();
  }

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

      <!-- 1. Software Updates (TOP) -->
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
            <button class="btn btn-secondary btn-animated" id="manualUpdateCheckBtn">
              Check for Updates
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Theme Selection (MIDDLE) -->
      <div id="theme-selector-container" class="mb-xl"></div>

      <!-- 3. Developer Mode (BOTTOM / COLLAPSIBLE) -->
      <details class="card developer-card" style="margin-bottom: 3rem;">
        <summary class="card-header" style="cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; margin-bottom: 0; border-bottom: none; transition: all 0.2s ease;">
          <h3 class="card-title" style="margin: 0; display: flex; align-items: center; font-size: var(--font-size-xl); color: var(--text-primary); font-weight: 700;">
             <span class="icon" style="margin-right: 0.75rem; color: var(--primary-500); width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center;">${Icons.edit}</span> 
             Advanced Developer Mode
          </h3>
          <span class="chevron" style="color: var(--primary-500); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);">${Icons.chevronDown}</span>
        </summary>
        
        <div style="padding: 2.5rem; border-top: 1px solid var(--border-color); background: var(--surface);">
          
          <!-- Teams: Multi-Admin Sync (Redesigned) -->
          <div class="sync-card">
            <div class="sync-card-header">
              <div class="sync-icon-wrapper">
                <span class="icon" style="width: 24px; height: 24px; color: white;">${Icons.refresh}</span>
              </div>
              <div class="sync-header-content">
                <h4 class="sync-card-title">Teams: Multi-Admin Sync</h4>
                <p class="sync-card-desc">Real-time database sync via Supabase for team collaboration.</p>
              </div>
              ${supabaseHealthy ? `
                <div class="storage-status active">
                  <span class="status-dot-live"></span>
                  <span class="status-text">Live</span>
                </div>
              ` : ''}
            </div>
            
            <div class="sync-inputs-grid">
              <div class="form-group">
                <label class="form-label-clean">Supabase URL</label>
                <input type="text" id="supabaseUrlInput" class="form-input form-input-clean" placeholder="https://xyz.supabase.co">
              </div>
              <div class="form-group">
                <label class="form-label-clean">Supabase Anon Key</label>
                <input type="password" id="supabaseKeyInput" class="form-input form-input-clean" placeholder="Your API key">
              </div>
            </div>
            
            <div class="sync-actions">
              <button class="btn ${supabaseHealthy ? 'btn-success' : 'btn-primary'} btn-animated" id="saveSyncBtn" style="${supabaseHealthy ? 'background: var(--success-600, #059669);' : ''}">
                <span class="icon">${supabaseHealthy ? Icons.check : Icons.check}</span>
                ${supabaseHealthy ? 'Connected' : 'Save & Connect'}
              </button>
            </div>
          </div>

          ${isDesktop ? `
            <div style="margin-top: 3rem;">
              <h4 style="font-size: 0.75rem; color: var(--text-tertiary); font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 2rem; text-align: center; opacity: 0.7;">Storage Architecture</h4>
              
              <div class="storage-hub-grid">
                <!-- Cloud Mirror Column -->
                <div class="storage-card">
                  <div class="storage-card-header">
                    <div class="storage-icon-wrapper cloud-gradient">
                      <span class="icon" style="width: 24px; height: 24px; color: white;">${Icons.cloud}</span>
                    </div>
                    <h5 class="storage-card-title">Google Drive Backup</h5>
                  </div>
                  
                  <p class="storage-card-desc">Sync your data to Google Drive for automatic team backups.</p>
                  
                  <div class="storage-card-actions">
                    ${isCloudConfigured ? `
                      <div class="storage-status active">
                        <span class="status-dot-live"></span>
                        <span class="status-text">Connected: ${gdriveEmail}</span>
                      </div>
                      ${gdriveLastSync ? `<span style="font-size: 0.72rem; color: var(--text-tertiary); margin-top: 0.25rem;">Last synced: ${formatDate(gdriveLastSync, 'time')}</span>` : ''}
                      <button class="btn btn-secondary w-full" id="linkCloudBtn" style="margin-top: 0.5rem;">
                        <span class="icon" style="margin-right: 0.5rem;">${Icons.cloud}</span>
                        Manage Connection
                      </button>
                    ` : `
                      <button class="btn btn-primary w-full btn-animated" id="linkCloudBtn">
                        <span class="icon" style="margin-right: 0.5rem;">${Icons.cloud}</span>
                        Connect Google Drive
                      </button>
                      <div class="storage-status inactive">
                        <span class="status-dot"></span>
                        <span class="status-text">Not Connected</span>
                      </div>
                    `}
                  </div>
                </div>

                <!-- Local Vault Column -->
                <div class="storage-card">
                  <div class="storage-card-header">
                    <div class="storage-icon-wrapper folder-gradient">
                      <span class="icon" style="width: 24px; height: 24px; color: white;">${Icons.folder}</span>
                    </div>
                    <h5 class="storage-card-title">Local Vault</h5>
                  </div>
                  
                  <p class="storage-card-desc">Your local workspace for fast, offline-first student data management.</p>
                  
                  <div class="vault-info-box">
                    <div class="vault-info-header">
                      <span class="vault-label">Workspace</span>
                      <div class="vault-status ${folderHealthy ? 'connected' : 'disconnected'}">
                        <span class="pulse-dot"></span>
                        ${folderHealthy ? 'Connected' : 'Disconnected'}
                      </div>
                    </div>
                    <div class="vault-path-display">${baseFolder || 'Not configured'}</div>
                  </div>
                  
                  <!-- Local Vault Actions -->
                  <div class="vault-actions">
                    <button class="btn btn-secondary btn-animated" id="changeFolderBtn">
                      <span class="icon">${Icons.folder}</span>
                      Change Local Vault
                    </button>
                    ${baseFolder ? `
                      <button class="btn btn-secondary btn-animated" id="openFolderBtn">
                        <span class="icon">${Icons.folderOpen}</span>
                        Open Vault Folder
                      </button>
                      <button class="btn btn-secondary btn-animated" id="reScanLibraryBtn">
                        <span class="icon">${Icons.refresh}</span>
                        Manual Re-Scan
                      </button>
                    ` : ''}
                  </div>
                </div>
              </div>

              <!-- Sync Settings Bridge (Between Cards) -->
              <div class="sync-bridge">
                <div class="sync-bridge-header">
                  <span class="icon" style="width: 20px; height: 20px; color: var(--primary-500);">${Icons.refresh}</span>
                  <span class="sync-bridge-title">Sync Settings</span>
                </div>
                <div class="sync-bridge-toggles">
                  <label class="storage-toggle">
                    <input type="checkbox" id="syncTwoWayDeletionToggle" ${syncTwoWayDeletion ? 'checked' : ''}>
                    <span class="toggle-switch"></span>
                    <span class="toggle-text">Sync Deletions</span>
                  </label>
                  <label class="storage-toggle">
                    <input type="checkbox" id="autoMirrorFilesToggle" ${autoMirrorFiles ? 'checked' : ''}>
                    <span class="toggle-switch"></span>
                    <span class="toggle-text">Auto-Mirror Files</span>
                  </label>
                </div>
                <p class="sync-bridge-desc">These settings control how data flows between your local vault and cloud storage.</p>
              </div>
            </div>
          ` : ''}
        </div>
      </details>
    </div>

    <style>
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .developer-card {
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border: 1px solid var(--border-color);
        background: var(--surface-primary);
      }
      .developer-card:hover, .card:not(.developer-card):hover {
        border-color: var(--primary-400);
        box-shadow: 0 8px 24px rgba(59, 130, 246, 0.12);
      }
      .developer-card summary:hover {
        background: var(--surface-subtle);
      }
      .developer-card summary:hover .chevron { transform: translateY(2px); }
      details[open].developer-card {
        border-color: var(--primary-500);
        box-shadow: 0 4px 30px rgba(59, 130, 246, 0.12);
      }
      details[open].developer-card summary { border-bottom: 1px solid var(--border-color); background: var(--surface-subtle); padding: 1.25rem 0; }
      details[open].developer-card summary .chevron { transform: rotate(180deg); }
      
      /* Storage Hub - Clean Grid Layout */
      .storage-hub-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2rem;
        margin-bottom: 2.5rem;
      }
      
      .storage-card {
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 2rem;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      .storage-card:hover {
        border-color: var(--primary-400);
        box-shadow: 0 8px 24px rgba(59, 130, 246, 0.15);
        transform: translateY(-2px);
      }
      
      .storage-card-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.25rem;
      }
      
      .storage-icon-wrapper {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      
      .cloud-gradient {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
      }
      
      .folder-gradient {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
      }
      
      .storage-card-title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--text-primary);
        letter-spacing: -0.02em;
      }
      
      .storage-card-desc {
        font-size: 0.9rem;
        line-height: 1.6;
        color: var(--text-secondary);
        margin: 0 0 1.5rem 0;
      }
      
      .storage-card-actions {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-top: auto;
      }
      
      .storage-status {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        border-radius: 10px;
        font-size: 0.85rem;
        font-weight: 600;
        border: 1px solid;
      }
      
      .storage-status.active {
        background: linear-gradient(135deg, rgba(5, 150, 105, 0.08), rgba(16, 185, 129, 0.15));
        border-color: rgba(16, 185, 129, 0.3);
        color: var(--success-700, #047857);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        padding: 0.5rem 1.15rem;
        border-radius: 100px;
        gap: 0.5rem;
        display: inline-flex;
        align-items: center;
      }
      
      .storage-status.inactive {
        background: var(--surface-subtle);
        border-color: var(--border-color);
        color: var(--text-tertiary);
      }
      
      .status-dot-live {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--success-500, #10b981);
        box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
        animation: pulseGlow 2s ease-in-out infinite;
      }
      
      @keyframes pulseGlow {
        0%, 100% { box-shadow: 0 0 4px rgba(16, 185, 129, 0.4); transform: scale(1); }
        50% { box-shadow: 0 0 12px rgba(16, 185, 129, 0.8); transform: scale(1.15); }
      }
      
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
      
      .status-text {
        font-weight: 600;
        letter-spacing: 0.02em;
      }
      
      /* Vault Info Box */
      .vault-info-box {
        background: var(--surface-subtle);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 1rem;
        margin-bottom: 1.5rem;
      }
      
      .vault-info-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
      }
      
      .vault-label {
        font-size: 0.7rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--text-tertiary);
      }
      
      .vault-status {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      
      .vault-status.connected {
        color: var(--success-600);
      }
      
      .vault-status.disconnected {
        color: var(--error-600);
      }
      
      .pulse-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
      
      .vault-path-display {
        font-family: 'Courier New', monospace;
        font-size: 0.75rem;
        color: var(--text-secondary);
        word-break: break-all;
        line-height: 1.5;
        padding: 0.5rem;
        background: var(--surface);
        border-radius: 6px;
      }
      
      /* Storage Toggles */
      .storage-toggles {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
      }
      
      .storage-toggle {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        background: var(--surface-subtle);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      .storage-toggle:hover {
        background: var(--surface);
        border-color: var(--primary-400);
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
      }
      
      .storage-toggle input[type="checkbox"] {
        display: none;
      }
      
      .toggle-switch {
        position: relative;
        width: 36px;
        height: 20px;
        background: var(--border-color);
        border-radius: 10px;
        transition: all 0.3s ease;
        flex-shrink: 0;
      }
      
      .toggle-switch::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        background: white;
        border-radius: 50%;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }
      
      .storage-toggle input[type="checkbox"]:checked + .toggle-switch {
        background: var(--primary-500);
      }
      
      .storage-toggle input[type="checkbox"]:checked + .toggle-switch::after {
        left: 18px;
      }
      
      .toggle-text {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text-primary);
        transition: color 0.2s ease;
      }
      
      /* Sync Card Styles */
      .sync-card {
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 2rem;
        margin-bottom: 3rem;
        transition: all 0.3s ease;
      }
      
      .sync-card:hover {
        border-color: var(--primary-400);
        box-shadow: 0 8px 24px rgba(59, 130, 246, 0.15);
      }
      
      .sync-card-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      
      .sync-icon-wrapper {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      
      .sync-header-content {
        flex: 1;
      }
      
      .sync-card-title {
        margin: 0 0 0.25rem 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--text-primary);
      }
      
      .sync-card-desc {
        margin: 0;
        font-size: 0.9rem;
        color: var(--text-secondary);
      }
      
      .sync-inputs-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5rem;
        margin-bottom: 1.5rem;
      }
      
      .sync-actions {
        display: flex;
        justify-content: flex-end;
      }
      
      /* Sync Bridge Styles */
      .sync-bridge {
        background: var(--surface-subtle);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 1.5rem 2rem;
        margin: -1rem 0 2rem 0;
        position: relative;
      }
      
      .sync-bridge-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }
      
      .sync-bridge-title {
        font-size: 0.85rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--text-secondary);
      }
      
      .sync-bridge-toggles {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      
      .sync-bridge-desc {
        margin: 0;
        font-size: 0.8rem;
        color: var(--text-tertiary);
        text-align: center;
        font-style: italic;
      }
      
      /* Cloud Credentials Display */
      .cloud-credentials-box {
        background: var(--surface-subtle);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 1rem;
      }
      
      .cloud-credentials-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
      }
      
      .cloud-credentials-label {
        font-size: 0.7rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--text-tertiary);
      }
      
      .cloud-credentials-item {
        font-size: 0.8rem;
        color: var(--text-secondary);
        margin-bottom: 0.5rem;
        display: flex;
        gap: 0.5rem;
      }
      
      .cloud-credentials-item strong {
        color: var(--text-primary);
        min-width: 80px;
      }
      
      /* Vault Actions */
      .vault-actions {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 0.85rem;
        margin-top: 1.75rem;
      }
      
      .vault-actions .btn {
        font-size: 0.82rem;
        padding: 0.75rem 0.5rem;
        font-weight: 600;
        background: var(--surface-subtle);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        border-radius: 12px;
        min-height: 80px;
        transition: all 0.2s ease;
      }
      
      .vault-actions .btn:hover {
        background: var(--primary-50);
        border-color: var(--primary-400);
        color: var(--primary-600);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.12);
      }
      
      .vault-actions .btn .icon {
        width: 20px;
        height: 20px;
        margin: 0;
      }
      
      /* Storage Actions (Deprecated - kept for compatibility) */
      .storage-actions {
        display: flex;
        justify-content: center;
        gap: 1rem;
        padding-top: 2rem;
        border-top: 1px solid var(--border-color);
        flex-wrap: wrap;
      }
      
      .storage-actions .btn {
        min-width: 140px;
      }
      
      /* Button Animations */
      .btn-animated {
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
      }
      .btn-animated:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 15px rgba(0,0,0,0.1);
      }
      .btn-animated:active { transform: translateY(0); scale: 0.98; }
      
      .form-label-clean {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--text-tertiary);
        font-weight: 700;
        margin-bottom: 0.5rem;
        display: block;
      }
      .form-input-clean {
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 0.8rem 1.25rem;
        transition: all 0.2s ease;
        width: 100%;
      }
      .form-input-clean:focus { border-color: var(--primary-500); background: var(--surface-primary); outline: none; box-shadow: 0 0 0 3px var(--primary-50); }
      
      .pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; display: inline-block; }
      @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
    </style>
  `;

  
  // Google Drive Connection Modal
  async function showGoogleDriveModal() {
    const isConnected = googleDriveService.isConnected();
    const status = googleDriveService.getStatus();

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'z-index: 10000; position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); animation: gdfIn 0.3s ease forwards;';

    modal.innerHTML = `
      <div class="gd-modal">
        <button class="gd-close" id="gd-close-x" title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="gd-header">
          <div class="gd-icon-ring">
            <div style="width:36px; height:36px; display:flex; align-items:center; justify-content:center;">${Icons.google}</div>
          </div>
          <h3 class="gd-title">${isConnected ? 'Google Drive Connected' : 'Connect Google Drive'}</h3>
          <p class="gd-subtitle">${isConnected 
            ? `Signed in as <strong>${status.email}</strong>` 
            : 'One-click sign in to sync your SCS data to Google Drive automatically.'}</p>
        </div>
        <div class="gd-body">
          ${isConnected ? `
            <div class="gd-status-card gd-status-connected">
              <div class="gd-status-row">
                <span class="gd-status-dot"></span>
                <div class="google-drive-info">
            <span class="gd-email">${status.email}</span>
            ${status.lastSync ? `<span class="gd-last-sync">Last synced: ${formatDate(status.lastSync, 'time')}</span>` : ''}
          </div>    <span class="gd-folder-label">Folder: SCS_Master_Sync</span>
            </div>
            <div class="gd-actions">
              <button class="gd-btn gd-btn-sync" id="gd-sync-now">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                Sync Now
              </button>
              <button class="gd-btn gd-btn-danger" id="gd-disconnect">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64A9 9 0 0 1 20.77 15"/><path d="M6.16 6.16a9 9 0 1 0 12.68 12.68"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                Disconnect
              </button>
            </div>
          ` : `
            <button class="gd-connect-btn" id="gd-connect">
              <div style="width:18px; height:18px; display:flex; align-items:center; justify-content:center;">${Icons.google}</div>
              Sign in with Google
            </button>
            <div class="gd-info">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <span>Creates a secure <strong>SCS_Master_Sync</strong> folder in your Google Drive. Only this app can access its own files.</span>
            </div>
          `}
        </div>
      </div>
      <style>
        @keyframes gdfIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gdSlide { from { transform: scale(0.95) translateY(14px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        .gd-modal {
          position: relative; max-width: 420px; width: 88%;
          animation: gdSlide 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          border-radius: 24px; overflow: hidden;
          background: var(--surface);
          backdrop-filter: blur(32px) saturate(200%);
          -webkit-backdrop-filter: blur(32px) saturate(200%);
          border: 1px solid var(--border-color, rgba(128,128,128,0.12));
          box-shadow: 0 32px 64px -16px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255,255,255,0.08) inset;
        }
        .gd-close {
          position: absolute; top: 1rem; right: 1rem; z-index: 2;
          width: 32px; height: 32px; border-radius: 50%; border: none;
          background: rgba(128,128,128,0.08); color: var(--text-tertiary);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.2s;
        }
        .gd-close:hover { background: rgba(128,128,128,0.18); color: var(--text-primary); transform: rotate(90deg); }
        .gd-header { padding: 2.25rem 2.25rem 0; text-align: center; }
        .gd-icon-ring {
          width: 68px; height: 68px; margin: 0 auto 1.25rem;
          border-radius: 50%; display: flex; align-items: center; justify-content: center;
          background: #ffffff;
          box-shadow: 0 2px 16px rgba(66,133,244,0.2), 0 0 0 1px rgba(66,133,244,0.1);
        }
        .gd-title { margin: 0 0 0.5rem; font-size: 1.25rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; }
        .gd-subtitle { color: var(--text-tertiary); font-size: 0.85rem; line-height: 1.5; margin: 0; }
        .gd-subtitle strong { color: var(--text-secondary); }
        .gd-body { padding: 1.75rem 2.25rem 2.25rem; }
        .gd-connect-btn {
          width: 100%; padding: 0.9rem 1.5rem;
          display: flex; align-items: center; justify-content: center; gap: 0.875rem;
          border: 1px solid #dadce0;
          border-radius: 4px;
          background: #ffffff;
          color: #3c4043; font-size: 0.9375rem; font-weight: 500;
          cursor: pointer; transition: all 0.2s ease;
          font-family: 'Roboto', inherit;
          box-shadow: 0 1px 2px rgba(0,0,0,0.08);
          letter-spacing: 0.01em;
        }
        .gd-connect-btn:hover { 
          background: #f8f9fa;
          border-color: #a8c7fa;
          box-shadow: 0 2px 8px rgba(66,133,244,0.2);
        }
        .gd-info {
          display: flex; gap: 0.75rem; align-items: flex-start;
          margin-top: 1.25rem; padding: 0.85rem 1rem;
          background: rgba(66,133,244,0.05); border-radius: 12px;
          font-size: 0.75rem; color: var(--text-tertiary); line-height: 1.5;
          border: 1px solid rgba(66,133,244,0.1);
        }
        .gd-info svg { flex-shrink: 0; color: var(--primary-500); margin-top: 2px; }
        .gd-info strong { color: var(--text-secondary); }
        .gd-status-card {
          padding: 1rem 1.25rem; border-radius: 14px;
          border: 1px solid var(--border-color, rgba(128,128,128,0.12));
          background: rgba(16, 185, 129, 0.05);
        }
        .gd-status-row {
          display: flex; align-items: center; gap: 0.6rem;
          font-size: 1rem; font-weight: 700; color: var(--text-primary);
        }
        .gd-status-dot {
          width: 10px; height: 10px; border-radius: 50%;
          background: #10b981; box-shadow: 0 0 8px rgba(16,185,129,0.5);
          animation: gdPulse 2s infinite;
        }
        @keyframes gdPulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        .gd-last-sync { display: block; font-size: 0.75rem; color: var(--text-tertiary); margin-top: 0.4rem; }
        .gd-folder-label { display: block; font-size: 0.72rem; color: var(--text-tertiary); margin-top: 0.25rem; font-family: 'JetBrains Mono', monospace; opacity: 0.8; }
        .gd-actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
        .gd-btn {
          flex: 1; padding: 0.75rem; border: none; border-radius: 12px;
          font-size: 0.9rem; font-weight: 700; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 0.5rem;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); font-family: inherit;
        }
        .gd-btn-sync { background: var(--primary-600); color: white; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2); }
        .gd-btn-sync:hover { background: var(--primary-500); transform: translateY(-2px); box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3); }
        .gd-btn-danger { 
          background: rgba(239,68,68,0.08); 
          color: var(--danger-600, #ef4444); 
          border: 1px solid rgba(239,68,68,0.15); 
        }
        .gd-btn-danger:hover { background: rgba(239,68,68,0.15); transform: translateY(-2px); }
      </style>
    `;

    document.body.appendChild(modal);

    const closeModal = () => {
      modal.style.opacity = '0';
      modal.style.transition = 'opacity 0.2s ease';
      setTimeout(() => modal.remove(), 200);
    };

    modal.querySelector('#gd-close-x').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    if (isConnected) {
      // Sync Now
      modal.querySelector('#gd-sync-now').addEventListener('click', async () => {
        const btn = modal.querySelector('#gd-sync-now');
        btn.textContent = 'Syncing...';
        btn.disabled = true;
        try {
          await syncQueue.syncNow();
          await showSettingsModal({ title: 'Sync Complete', message: 'Data uploaded to Google Drive successfully.', type: 'alert', icon: Icons.check });
          closeModal();
          await renderSettings();
        } catch (err) {
          await showSettingsModal({ title: 'Sync Failed', message: err.message, type: 'alert', icon: Icons.info });
          btn.textContent = 'Sync Now';
          btn.disabled = false;
        }
      });

      // Disconnect
      modal.querySelector('#gd-disconnect').addEventListener('click', async () => {
        const confirmed = await showSettingsModal({
          title: 'Disconnect Google Drive',
          message: 'This will remove the connection. Your data in Google Drive will remain, but new changes won\'t sync.',
          icon: Icons.info
        });
        if (!confirmed) return;
        try {
          await googleDriveService.disconnect();
          closeModal();
          await renderSettings();
        } catch (err) {
          await showSettingsModal({ title: 'Error', message: err.message, type: 'alert' });
        }
      });
    } else {
      // Connect
      modal.querySelector('#gd-connect').addEventListener('click', async () => {
        const btn = modal.querySelector('#gd-connect');
        btn.textContent = 'Connecting...';
        btn.disabled = true;
        btn.style.opacity = '0.6';
        try {
          await googleDriveService.connect();
          await showSettingsModal({ title: 'Connected', message: 'Google Drive connected successfully. Your data will sync automatically.', type: 'alert', icon: Icons.check });
          closeModal();
          await renderSettings();
        } catch (err) {
          if (err.message.includes('closed by user')) {
            btn.textContent = 'Sign in with Google';
            btn.disabled = false;
            btn.style.opacity = '1';
            return;
          }
          await showSettingsModal({ title: 'Connection Failed', message: err.message, type: 'alert', icon: Icons.info });
          btn.textContent = 'Sign in with Google';
          btn.disabled = false;
          btn.style.opacity = '1';
        }
      });
    }
  }

  // SECTION: Cloud Storage Actions (Google Drive OAuth)
  const linkCloudBtn = document.getElementById('linkCloudBtn');
  if (linkCloudBtn) {
    linkCloudBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await showGoogleDriveModal();
    });
  }

  // SECTION: Local Folder Actions
  const changeFolderBtn = document.getElementById('changeFolderBtn');
  if (changeFolderBtn) {
    changeFolderBtn.addEventListener('click', async () => {
      const confirmed = await showSettingsModal({
        title: 'Change Vault Location',
        message: 'This will update where your student files are stored on this computer.',
        icon: Icons.folder
      });
      if (!confirmed) return;
      
      try {
        const newFolder = await fileSystem.selectBaseFolder();
        if (newFolder) {
          await showSettingsModal({
            title: 'Success',
            message: '✅ Vault location changed!',
            type: 'alert'
          });
          await renderSettings();
        }
      } catch (error) {
        showError('Failed to change folder: ' + error.message);
      }
    });
  }

  const syncTwoWayDeletionToggle = document.getElementById('syncTwoWayDeletionToggle');
  if (syncTwoWayDeletionToggle) {
    syncTwoWayDeletionToggle.addEventListener('change', async (e) => {
      const confirmed = await showSettingsModal({
        title: 'Toggle Two-Way Deletion',
        message: 'Enabling this means deleting files in SCS will permanently delete them from your local folder too.',
        icon: Icons.trash
      });
      if (!confirmed) {
        e.target.checked = !e.target.checked; // Revert
        return;
      }
      await db.setSetting('syncTwoWayDeletion', e.target.checked);
    });
  }

  const autoMirrorFilesToggle = document.getElementById('autoMirrorFilesToggle');
  if (autoMirrorFilesToggle) {
    autoMirrorFilesToggle.addEventListener('change', async (e) => {
      const confirmed = await showSettingsModal({
        title: 'Toggle Automatic Mirroring',
        message: 'When enabled, every new receipt will automatically be copied to your cloud filing cabinet.',
        icon: Icons.refresh
      });
      if (!confirmed) {
        e.target.checked = !e.target.checked; // Revert
        return;
      }
      await db.setSetting('autoMirrorFiles', e.target.checked);
    });
  }

  const reScanLibraryBtn = document.getElementById('reScanLibraryBtn');
  if (reScanLibraryBtn) {
    reScanLibraryBtn.addEventListener('click', async () => {
      const confirmed = await showSettingsModal({
        title: 'Full Library Scan',
        message: 'This will check your local folder for existing PDFs and try to sync them with your database.',
        icon: Icons.search
      });
      if (!confirmed) return;
      
      reScanLibraryBtn.disabled = true;
      const originalHTML = reScanLibraryBtn.innerHTML;
      reScanLibraryBtn.innerHTML = `<span class="icon spin">${Icons.refresh}</span> Scanning...`;
      
      try {
        const result = await fileSystem.scanLibrary();
        await showSettingsModal({
          title: 'Scan Complete',
          message: `✅ Found ${result.found} existing PDFs.\nImported ${result.imported} new records.`,
          type: 'alert'
        });
      } catch (err) {
        showError('Scan failed: ' + err.message);
      } finally {
        reScanLibraryBtn.disabled = false;
        reScanLibraryBtn.innerHTML = originalHTML;
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
        showError('Failed to open folder: ' + error.message);
      }
    });
  }

  const saveSyncBtn = document.getElementById('saveSyncBtn');
  if (saveSyncBtn) {
    // Populate values from saved settings
    const urlInput = document.getElementById('supabaseUrlInput');
    const keyInput = document.getElementById('supabaseKeyInput');
    
    db.getSetting('supabaseUrl').then(val => { if (val) urlInput.value = val; });
    db.getSetting('supabaseKey').then(val => { if (val) keyInput.value = val; });

    saveSyncBtn.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      const key = keyInput.value.trim();

      // 1. Validate fields are filled BEFORE showing any confirmation
      if (!url || !key) {
        await showSettingsModal({
          title: 'Missing Fields',
          message: 'Please enter both a Supabase URL and an Anon Key before saving.',
          type: 'alert',
          icon: Icons.info,
          confirmText: 'Got it'
        });
        return;
      }

      // 2. Confirm intent
      const confirmed = await showSettingsModal({
        title: 'Update Sync Configuration',
        message: 'This will restart the sync engine with the new credentials. Your existing local data is safe.',
        icon: Icons.refresh
      });
      if (!confirmed) return;

      // 3. Save, then test live connection
      try {
        await db.setSetting('supabaseUrl', url);
        await db.setSetting('supabaseKey', key);

        // Show loading state on button
        const originalHTML = saveSyncBtn.innerHTML;
        saveSyncBtn.disabled = true;
        saveSyncBtn.innerHTML = `<span class="icon spin">${Icons.refresh}</span> Connecting...`;

        // Ping Supabase to verify credentials
        let connected = false;
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const testClient = createClient(url, key);
          const { error } = await testClient.from('settings').select('key').limit(1);
          connected = !error;
        } catch (pingErr) {
          console.warn('Supabase ping failed:', pingErr);
          connected = false;
        }

        saveSyncBtn.disabled = false;
        saveSyncBtn.innerHTML = originalHTML;

        if (connected) {
          // Update button to show connected state
          saveSyncBtn.innerHTML = `<span class="icon">${Icons.check}</span> Connected`;
          saveSyncBtn.style.background = 'var(--success-600, #059669)';
          setTimeout(() => {
            saveSyncBtn.innerHTML = originalHTML;
            saveSyncBtn.style.background = '';
          }, 3000);

          await showSettingsModal({
            title: 'Live Sync Active',
            message: 'Successfully connected to Supabase. Your database is now syncing in real-time.',
            type: 'success',
            icon: Icons.check,
            confirmText: 'Great!'
          });
          // Soft re-render settings page without a full app reload
          await renderSettings();
        } else {
          showError('Could not reach Supabase with those credentials. Please double-check your URL and Anon Key.');
        }
      } catch (err) {
        showError('Error saving configuration: ' + err.message);
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
  const confirmed = await showSettingsModal({
    title: 'Existing Data Detected!',
    message: 'We found an existing sync_data.json in your library folder. Would you like to restore your students and payments from this folder?',
    icon: Icons.folderOpen,
    confirmText: 'Yes, restore everything',
    cancelText: 'No, start fresh'
  });

  if (!confirmed) return;

  try {
    showLoading(true);
    const data = await fileSystem.loadSystemSnapshot();
    if (data) {
      const backupPath = await fileSystem.createLocalEmergencyBackup();
      console.log('🛡️ Emergency backup created before restoration:', backupPath);

      db.isImporting = true;
      await db.importData(data);
      db.isImporting = false;
      
      await showSettingsModal({
        title: 'Restored',
        message: `🎉 Data restored successfully!\n\nSafety backup created at:\n${backupPath || 'Library/backups/'}`,
        type: 'alert'
      });
      window.location.reload();
    }
  } catch (error) {
    console.error('Restoration failed:', error);
    showError('Failed to restore data. The file might be corrupted or incompatible.');
  } finally {
    showLoading(false);
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Export for global access
window.app = app;
