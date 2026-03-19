/**
 * TRANSFER HUB COMPONENT
 * Central command center for data migration, cloud sync, and portable library management
 */

import { Icons } from '../utils/icons.js';
import { db } from '../db/database.js';
import { fileSystem } from '../services/fileSystem.js';
import { formatDate } from '../utils/formatting.js';
import { registerActions } from '../actions.js';

export function renderTransferHubSkeleton() {
  const container = document.getElementById('app-content');
  if (!container) return;
  
  container.innerHTML = `
    <div class="skeleton-page transfer-hub-page">
      <div class="mb-2xl">
        <div class="skeleton skeleton-heading" style="width:240px"></div>
        <div class="skeleton skeleton-text medium"></div>
      </div>
      
      <div class="grid grid-2 gap-xl">
        <!-- Export/Backup Card Skeleton -->
        <div class="skeleton-card" style="height:320px">
          <div class="skeleton skeleton-heading" style="width:160px; margin-bottom:1.5rem;"></div>
          <div class="skeleton skeleton-text full"></div>
          <div class="skeleton skeleton-text medium" style="margin-bottom:2rem;"></div>
          
          <div class="skeleton" style="height:60px; border-radius:var(--radius-md); margin-bottom:1rem;"></div>
          <div class="skeleton" style="height:60px; border-radius:var(--radius-md);"></div>
        </div>
        
        <!-- Import Card Skeleton -->
        <div class="skeleton-card" style="height:320px">
          <div class="skeleton skeleton-heading" style="width:180px; margin-bottom:1.5rem;"></div>
          <div class="skeleton skeleton-text full"></div>
          <div class="skeleton skeleton-text medium" style="margin-bottom:2rem;"></div>
          
          <div class="skeleton" style="height:120px; border-radius:var(--radius-md); border: 2px dashed var(--skeleton-border);"></div>
        </div>
      </div>
      
      <!-- Database Tools Card Skeleton -->
      <div class="skeleton-card mt-xl" style="height:180px;">
        <div class="skeleton skeleton-heading" style="width:200px; margin-bottom:1.5rem;"></div>
        <div class="flex gap-md">
           <div class="skeleton" style="width:200px; height:45px; border-radius:var(--radius-md);"></div>
           <div class="skeleton" style="width:200px; height:45px; border-radius:var(--radius-md);"></div>
        </div>
      </div>
    </div>
  `;
}

export async function renderTransferHub() {
  const container = document.getElementById('app-content');
  const baseFolder = fileSystem.getBaseFolder();
  const snapshot = await fileSystem.checkSnapshot();
  const isDesktop = fileSystem.isDesktopApp();

  container.innerHTML = `
    <div style="animation: fadeIn 0.4s ease-out;">
      <!-- Page Header -->
      <div class="flex justify-between items-center mb-2xl">
        <div>
          <h1 style="margin-bottom: 0.5rem;">Data Transfer Hub</h1>
          <p style="margin: 0; color: var(--text-secondary);">Manage your portable library and sync across devices.</p>
        </div>
        <button class="btn btn-secondary" data-action="navigate-hash" data-hash="#dashboard">
          ${Icons.arrowLeft} Back to Dashboard
        </button>
      </div>

      <!-- Status Hero Visualization -->
      <div class="hub-hero">
        <div style="text-align: center; margin-bottom: 2rem;">
          <h2>Portable Library Status</h2>
          <div class="badge" style="font-size: 0.75rem; font-weight: 700; padding: 0.4rem 1rem; background: ${baseFolder ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; border: 1.5px solid rgba(255,255,255,0.4); color: white; letter-spacing: 0.05em; border-radius: 999px;">
            ${baseFolder ? '● SYSTEM CONNECTED' : '● SYSTEM DISCONNECTED'}
          </div>
        </div>

        <div class="hub-connection-map">
          <div class="hub-node">
            <div class="hub-node-icon">
              ${Icons.chartBar}
            </div>
            <div class="hub-node-label">Local App</div>
          </div>

          <div class="hub-connection-line">
            ${baseFolder ? '<div class="hub-connection-active"></div>' : ''}
          </div>

          <div class="hub-node">
            <div class="hub-node-icon">
              ${Icons.folderOpen}
            </div>
            <div class="hub-node-label">Library Folder</div>
          </div>
        </div>

        <div style="margin-top: 3.5rem; background: rgba(0,0,0,0.3); padding: 1.25rem 2rem; border-radius: var(--radius-xl); border: 1px solid rgba(255,255,255,0.15); backdrop-filter: blur(8px);">
          <div class="flex justify-between items-center gap-xl" style="width: 100%;">
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 0.65rem; color: rgba(255,255,255,0.5); text-transform: uppercase; font-weight: 800; margin-bottom: 0.3rem; letter-spacing: 0.12em;">Mirror Location</div>
              <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.825rem; color: #FFFFFF; word-break: break-all; opacity: 0.9; line-height: 1.4;">
                ${baseFolder || 'Search in Settings to connect...'}
              </div>
            </div>
            <div class="flex gap-md items-center" style="flex-shrink: 0;">
               <button class="btn" id="forceSyncBtn" ${!baseFolder ? 'disabled' : ''} style="background: white; color: var(--primary-700); font-weight: 700; border: none; padding: 0.65rem 1.75rem; border-radius: 0.75rem; box-shadow: 0 4px 15px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 0.5rem; height: 42px;">
                <span class="icon" style="width: 18px; height: 18px;">${Icons.refresh}</span> Force Sync
              </button>
              <button class="btn btn-secondary" id="openLibraryBtn" ${!baseFolder ? 'disabled' : ''} style="background: rgba(255,255,255,0.12); color: white; border: 1.2px solid rgba(255,255,255,0.25); padding: 0.65rem 1.75rem; border-radius: 0.75rem; display: flex; align-items: center; gap: 0.5rem; height: 42px;">
                 <span class="icon" style="width: 18px; height: 18px;">${Icons.folderOpen}</span> View
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-2 gap-xl items-start">
        <!-- Migration Timeline -->
        <div class="card" style="height: 100%; display: flex; flex-direction: column;">
          <div class="card-header">
            <h3 class="card-title">How to Transfer Data</h3>
          </div>
          <div class="card-body" style="flex-grow: 1;">
            <div class="hub-timeline">
              <div class="hub-step ${baseFolder ? 'active' : ''}">
                <div class="hub-step-num">1</div>
                <div>
                  <div style="font-weight: 700; font-size: 1rem; margin-bottom: 0.25rem; color: var(--text-primary);">Connect to Cloud (Optional)</div>
                  <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
                    Move your <b>SCS</b> folder to <b>Google Drive</b> or <b>OneDrive</b>. Your data will now sync across computers automatically.
                  </p>
                </div>
              </div>

              <div class="hub-step active">
                <div class="hub-step-num">2</div>
                <div>
                  <div style="font-weight: 700; font-size: 1rem; margin-bottom: 0.25rem; color: var(--text-primary);">Move to New Device</div>
                  <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
                    Copy the folder to a USB or another drive. On the new device, install SCS.
                  </p>
                </div>
              </div>

              <div class="hub-step active">
                <div class="hub-step-num">3</div>
                <div>
                  <div style="font-weight: 700; font-size: 1rem; margin-bottom: 0.25rem; color: var(--text-primary);">Select & Restore</div>
                  <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
                    Select the folder in Settings on your new device. It will automatically detect <b>sync_data.json</b> and restore everything.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Safety & Backup Column -->
        <div style="display: flex; flex-direction: column; gap: var(--space-xl); height: 100%;">
          <!-- Sync Health -->
          <div class="card hub-health-card" style="flex: 1;">
            <div class="card-header">
              <h3 class="card-title">Sync Integrity</h3>
            </div>
            <div class="card-body">
              <div class="flex items-center gap-md mb-xl">
                <div class="icon-circle" style="background: var(--success-500); color: white; width: 42px; height: 42px; font-size: 1.25rem;">
                  ${Icons.shield}
                </div>
                <div>
                  <div style="font-weight: 800; font-size: 1.05rem; color: var(--text-primary);">Data Safety: ACTIVE</div>
                  <p style="margin: 0; font-size: 0.8rem; color: var(--text-secondary);">Your library uses atomic snapshots to prevent data loss.</p>
                </div>
              </div>
              
              <div class="grid grid-2 gap-md pt-lg border-t">
                <div>
                  <div style="font-size: 0.65rem; color: var(--text-tertiary); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Last Update</div>
                  <div style="font-weight: 700; font-size: 1.15rem; color: var(--text-primary);">${snapshot ? formatDate(snapshot.modified, 'short') : '--/--/----'}</div>
                </div>
                <div>
                  <div style="font-size: 0.65rem; color: var(--text-tertiary); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Library Size</div>
                  <div style="font-weight: 700; font-size: 1.15rem; color: var(--text-primary);">${snapshot ? (snapshot.size / 1024).toFixed(1) + ' KB' : '0.0 KB'}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Emergency Backup -->
          <div class="card" style="flex: 1;">
            <div class="card-header">
              <h3 class="card-title">Standalone Backup</h3>
            </div>
            <div class="card-body" style="display: flex; flex-direction: column; justify-content: space-between;">
              <p style="margin-bottom: 1.5rem; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
                Create a standalone JSON backup of your records. This is a separate safety measure from the mirror sync.
              </p>
              <button class="btn btn-success" id="downloadBackupBtn" style="width: 100%; padding: 0.75rem; border-radius: 0.75rem; font-weight: 700;">
                <span class="icon">${Icons.download}</span>
                Download Standalone Backup
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <style>
      .border-t { border-top: 1px solid var(--border-color); }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    </style>
  `;

  // Attach Listeners
  const forceSyncBtn = document.getElementById('forceSyncBtn');
  if (forceSyncBtn) {
    forceSyncBtn.addEventListener('click', async () => {
      const originalContent = forceSyncBtn.innerHTML;
      try {
        forceSyncBtn.disabled = true;
        forceSyncBtn.innerHTML = `<span class="icon spin">${Icons.refresh}</span> Syncing...`;
        
        const result = await fileSystem.saveSystemSnapshot();
        
        if (result.success) {
          forceSyncBtn.innerHTML = `<span class="icon">✓</span> Synced`;
          setTimeout(() => renderTransferHub(), 1500);
        } else if (result.reason === 'conflict') {
          const confirmed = confirm(`⚠️ Sync Conflict Detected!\n\nThe version on your USB/Cloud is newer.\n\nOverwriting the library will lose those external changes. Continue anyway?`);
          
          if (confirmed) {
             const forceResult = await fileSystem.saveSystemSnapshot(true);
             if (forceResult.success) {
                forceSyncBtn.innerHTML = `<span class="icon">✓</span> Forced Sync Success`;
                setTimeout(() => renderTransferHub(), 1500);
                return;
             }
          }
          forceSyncBtn.innerHTML = `<span class="icon">⚠️</span> Aborted`;
          setTimeout(() => { 
            forceSyncBtn.disabled = false; 
            forceSyncBtn.innerHTML = originalContent; 
          }, 2000);
        } else {
          throw new Error('Sync failed');
        }
      } catch (e) {
        forceSyncBtn.innerHTML = `<span class="icon">❌</span> Failed`;
        setTimeout(() => { 
          forceSyncBtn.disabled = false; 
          forceSyncBtn.innerHTML = originalContent; 
        }, 2000);
      }
    });
  }

  document.getElementById('openLibraryBtn')?.addEventListener('click', async () => {
    if (baseFolder) await window.electronAPI.openFolderInExplorer(baseFolder);
  });

  document.getElementById('downloadBackupBtn')?.addEventListener('click', async () => {
    const { exportDatabase } = await import('../utils/exportData.js');
    await exportDatabase();
  });

  registerActions({
    'navigate-hash': (target) => {
      window.location.hash = target.dataset.hash || '#dashboard';
    }
  });
}
