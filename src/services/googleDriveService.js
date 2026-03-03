/**
 * GOOGLE DRIVE SERVICE — Renderer Side
 * Wraps the Electron IPC bridge for Google Drive operations.
 * Manages connection state, token persistence, and sync operations.
 */

import { db } from '../db/database.js';

class GoogleDriveService {
  constructor() {
    this.connected = false;
    this.email = null;
    this.refreshToken = null;
    this.masterFolderId = null;
    this.lastSyncTime = null;
  }

  /**
   * Initialize — restore stored tokens on app start.
   */
  async init() {
    try {
      this.refreshToken = await db.getSetting('gdriveRefreshToken');
      this.email = await db.getSetting('gdriveEmail');
      this.masterFolderId = await db.getSetting('gdriveFolderId');
      this.lastSyncTime = await db.getSetting('gdriveLastSync');

      if (this.refreshToken) {
        // Verify token is still valid by refreshing
        const result = await window.electronAPI.googleDrive.refreshToken(this.refreshToken);
        if (result.success) {
          this.connected = true;
          console.log(`☁️ Google Drive connected as: ${this.email}`);
        } else {
          console.warn('☁️ Stored Google Drive token is invalid, needs re-auth');
          this.connected = false;
        }
      }
    } catch (err) {
      console.warn('☁️ Google Drive init (no stored connection):', err.message);
    }
    return this;
  }

  /**
   * Start OAuth flow — opens Google sign-in window.
   * On success, stores tokens and creates master folder.
   */
  async connect() {
    if (!window.electronAPI?.googleDrive) {
      throw new Error('Google Drive API not available (requires Electron desktop app)');
    }

    const result = await window.electronAPI.googleDrive.startAuth();

    if (!result.success) {
      throw new Error(result.error || 'Authentication failed');
    }

    // Store tokens securely via dual-write
    this.refreshToken = result.refreshToken;
    this.email = result.email;
    this.connected = true;

    await db.setSetting('gdriveRefreshToken', result.refreshToken);
    await db.setSetting('gdriveEmail', result.email);

    // Find or create the master sync folder
    const folderResult = await window.electronAPI.googleDrive.findOrCreateFolder(this.refreshToken);
    if (folderResult.success) {
      this.masterFolderId = folderResult.folderId;
      await db.setSetting('gdriveFolderId', folderResult.folderId);
    }

    console.log(`☁️ Google Drive connected: ${this.email}, folder: ${this.masterFolderId}`);

    return {
      email: this.email,
      folderId: this.masterFolderId
    };
  }

  /**
   * Disconnect — revoke token and clear stored data.
   */
  async disconnect() {
    if (this.refreshToken) {
      await window.electronAPI.googleDrive.revokeToken(this.refreshToken);
    }

    this.connected = false;
    this.email = null;
    this.refreshToken = null;
    this.masterFolderId = null;

    await db.deleteSetting('gdriveRefreshToken');
    await db.deleteSetting('gdriveEmail');
    await db.deleteSetting('gdriveFolderId');
    await db.deleteSetting('gdriveLastSync');

    console.log('☁️ Google Drive disconnected');
  }

  /**
   * Check if connected.
   */
  isConnected() {
    return this.connected && !!this.refreshToken;
  }

  /**
   * Get connection status for UI display.
   */
  getStatus() {
    return {
      connected: this.connected,
      email: this.email,
      folderId: this.masterFolderId,
      lastSync: this.lastSyncTime
    };
  }

  /**
   * Upload a full data snapshot to Google Drive.
   */
  async uploadSnapshot(data) {
    if (!this.isConnected()) throw new Error('Not connected to Google Drive');
    if (!this.masterFolderId) throw new Error('Master folder not initialized');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshot = {
      version: 1,
      exportedAt: new Date().toISOString(),
      device: navigator.userAgent,
      data
    };

    // Upload the main snapshot file (always named scs_data.json for easy merge)
    const result = await window.electronAPI.googleDrive.uploadFile(
      this.refreshToken,
      'scs_data.json',
      JSON.stringify(snapshot),
      this.masterFolderId
    );

    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    // Also upload a timestamped backup
    await window.electronAPI.googleDrive.uploadFile(
      this.refreshToken,
      `scs_backup_${timestamp}.json`,
      JSON.stringify(snapshot),
      this.masterFolderId
    );

    // Update last sync time
    this.lastSyncTime = new Date().toISOString();
    await db.setSetting('gdriveLastSync', this.lastSyncTime);

    console.log(`☁️ Snapshot uploaded to Drive (${result.action})`);
    return result;
  }

  /**
   * Download the latest snapshot from Google Drive.
   */
  async downloadSnapshot() {
    if (!this.isConnected()) throw new Error('Not connected to Google Drive');
    if (!this.masterFolderId) throw new Error('Master folder not initialized');

    // List files to find scs_data.json
    const listResult = await window.electronAPI.googleDrive.listFiles(
      this.refreshToken,
      this.masterFolderId
    );

    if (!listResult.success) {
      throw new Error(listResult.error || 'Failed to list Drive files');
    }

    const dataFile = listResult.files.find(f => f.name === 'scs_data.json');
    if (!dataFile) {
      return null; // No snapshot exists yet
    }

    const downloadResult = await window.electronAPI.googleDrive.downloadFile(
      this.refreshToken,
      dataFile.id
    );

    if (!downloadResult.success) {
      throw new Error(downloadResult.error || 'Download failed');
    }

    try {
      return JSON.parse(downloadResult.content);
    } catch (e) {
      throw new Error('Failed to parse Drive snapshot: ' + e.message);
    }
  }

  /**
   * List all files in the master sync folder.
   */
  async listCloudFiles() {
    if (!this.isConnected()) throw new Error('Not connected to Google Drive');
    if (!this.masterFolderId) throw new Error('Master folder not initialized');

    const result = await window.electronAPI.googleDrive.listFiles(
      this.refreshToken,
      this.masterFolderId
    );

    if (!result.success) throw new Error(result.error);
    return result.files;
  }

  /**
   * Launch Reconciliation — "Catch-up Sync"
   * Called on every app launch when connected and online.
   * 1. PULL: Download latest cloud snapshot, merge newer records into local
   * 2. PUSH: Upload any locally pending changes 
   */
  async performCatchUpSync() {
    if (!this.isConnected() || !navigator.onLine) {
      console.log('☁️ Catch-up sync skipped (not connected or offline)');
      return { action: 'skipped' };
    }

    console.log('☁️ Starting catch-up sync...');
    const conflicts = [];

    try {
      // === PULL: Get latest from cloud ===
      const cloudSnapshot = await this.downloadSnapshot();

      if (cloudSnapshot && cloudSnapshot.data) {
        const cloudExportedAt = new Date(cloudSnapshot.exportedAt || 0).getTime();
        const localLastSync = this.lastSyncTime ? new Date(this.lastSyncTime).getTime() : 0;

        // Only merge if cloud data is newer than our last sync
        if (cloudExportedAt > localLastSync) {
          console.log('☁️ Cloud has newer data — merging...');
          const mergeResult = await this._mergeFromCloud(cloudSnapshot.data);
          conflicts.push(...mergeResult.conflicts);
          console.log(`☁️ Merged: ${mergeResult.updated} records updated, ${mergeResult.conflicts.length} conflicts`);
        } else {
          console.log('☁️ Local data is up-to-date with cloud');
        }
      } else {
        console.log('☁️ No cloud snapshot found — will push local data');
      }

      // === PUSH: Upload current local state ===
      const localData = await db.exportData();
      await this.uploadSnapshot(localData);

      // Log conflicts for admin review
      if (conflicts.length > 0) {
        await db.setSetting('syncConflicts', JSON.stringify(conflicts));
        console.warn(`⚠️ ${conflicts.length} sync conflict(s) detected — most recent version kept`);
      }

      return {
        action: 'completed',
        conflicts: conflicts.length,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      console.error('❌ Catch-up sync failed:', err.message);
      return { action: 'failed', error: err.message };
    }
  }

  /**
   * Merge cloud data into local database.
   * Uses "last modified wins" strategy.
   * Returns { updated, conflicts[] }
   */
  async _mergeFromCloud(cloudData) {
    let updated = 0;
    const conflicts = [];
    const collections = ['students', 'payments', 'receipts', 'studentRemarks', 'programmes'];

    for (const collectionName of collections) {
      const cloudRecords = cloudData[collectionName] || [];
      if (!cloudRecords.length) continue;

      for (const cloudRecord of cloudRecords) {
        try {
          const localRecord = await db.get(collectionName, cloudRecord.id);

          if (!localRecord) {
            // New record from cloud — add locally
            await db.add(collectionName, cloudRecord);
            updated++;
            continue;
          }

          // Compare timestamps
          const cloudTime = new Date(cloudRecord.updatedAt || 0).getTime();
          const localTime = new Date(localRecord.updatedAt || 0).getTime();

          if (cloudTime > localTime) {
            // Cloud is newer — update local
            await db.update(collectionName, cloudRecord);
            updated++;

            // Check if both were modified since last sync (conflict)
            const lastSync = this.lastSyncTime ? new Date(this.lastSyncTime).getTime() : 0;
            if (localTime > lastSync) {
              conflicts.push({
                collection: collectionName,
                recordId: cloudRecord.id,
                cloudTime: cloudRecord.updatedAt,
                localTime: localRecord.updatedAt,
                resolution: 'cloud_wins',
                timestamp: new Date().toISOString()
              });
            }
          } else if (localTime > cloudTime) {
            // Local is newer — will be pushed in the PUSH phase
            const lastSync = this.lastSyncTime ? new Date(this.lastSyncTime).getTime() : 0;
            if (cloudTime > lastSync) {
              conflicts.push({
                collection: collectionName,
                recordId: cloudRecord.id,
                cloudTime: cloudRecord.updatedAt,
                localTime: localRecord.updatedAt,
                resolution: 'local_wins',
                timestamp: new Date().toISOString()
              });
            }
          }
          // Equal timestamps — no action needed
        } catch (err) {
          console.warn(`Merge error for ${collectionName}/${cloudRecord.id}:`, err.message);
        }
      }
    }

    return { updated, conflicts };
  }
}

// Singleton
const googleDriveService = new GoogleDriveService();
export default googleDriveService;
