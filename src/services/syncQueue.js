/**
 * SYNC QUEUE SERVICE — Background Cloud Sync Worker
 * 
 * Implements a resilient, offline-first sync strategy:
 * - Debounced: waits 30s of idle time after last change before syncing
 * - Persistent: tracks dirty state in localStorage so pending syncs survive restarts
 * - Background: monitors navigator.onLine and auto-syncs when connectivity returns
 * - Exponential Backoff: retries failed syncs with increasing delays (1s → 2s → 4s → max 30s)
 * - Non-blocking: never makes the UI wait for cloud operations
 */

import { db } from '../db/database.js';
import googleDriveService from './googleDriveService.js';

const SYNC_DEBOUNCE_MS = 30000;  // 30 seconds idle before sync
const MIN_RETRY_MS = 1000;       // 1 second
const MAX_RETRY_MS = 30000;      // 30 seconds
const DIRTY_FLAG_KEY = 'scs_sync_dirty';

class SyncQueue {
  constructor() {
    this.debounceTimer = null;
    this.retryTimer = null;
    this.retryDelay = MIN_RETRY_MS;
    this.isSyncing = false;
    this.isRunning = false;
    this.onStatusChange = null; // Callback for UI updates
  }

  /**
   * Start the background sync worker.
   * Call this once on app startup.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Listen for online/offline events
    window.addEventListener('online', () => {
      console.log('🌐 Back online — checking sync queue');
      this._attemptSync();
    });

    window.addEventListener('offline', () => {
      console.log('📴 Went offline — pausing sync');
      this._clearRetry();
    });

    // Check if there's a pending sync from a previous session
    if (this._isDirty()) {
      console.log('📋 Found pending sync from previous session');
      // Small delay to let the app finish initializing
      setTimeout(() => this._attemptSync(), 5000);
    }

    console.log('🔄 Sync queue worker started');
  }

  /**
   * Stop the background worker.
   */
  stop() {
    this.isRunning = false;
    this._clearDebounce();
    this._clearRetry();
    console.log('🔄 Sync queue worker stopped');
  }

  /**
   * Mark data as changed — starts the debounce countdown.
   * Called by database hooks after every add/update/delete.
   */
  markDirty() {
    // Persist dirty flag so it survives app restarts
    localStorage.setItem(DIRTY_FLAG_KEY, Date.now().toString());

    // Reset the debounce timer
    this._clearDebounce();
    this.debounceTimer = setTimeout(() => {
      this._attemptSync();
    }, SYNC_DEBOUNCE_MS);

    this._notifyStatus('pending');
  }

  /**
   * Force an immediate sync (bypasses debounce).
   * Used by "Sync Now" button.
   */
  async syncNow() {
    this._clearDebounce();
    return this._attemptSync();
  }

  /**
   * Get the current sync status.
   */
  getStatus() {
    if (this.isSyncing) return 'syncing';
    if (this._isDirty()) return 'pending';
    return 'idle';
  }

  /**
   * Get pending item count (for UI badge).
   */
  getPendingCount() {
    return this._isDirty() ? 1 : 0;
  }

  // ==================== Internal Methods ====================

  /**
   * Attempt to sync data to Google Drive.
   */
  async _attemptSync() {
    // Guard: don't sync if not connected, offline, or already syncing
    if (!googleDriveService.isConnected()) {
      return false;
    }
    if (!navigator.onLine) {
      console.log('📴 Offline — will sync when connection returns');
      return false;
    }
    if (this.isSyncing) {
      return false;
    }

    this.isSyncing = true;
    this._notifyStatus('syncing');

    try {
      // Export all data from local database
      const data = await db.exportData();

      // Upload snapshot to Google Drive
      await googleDriveService.uploadSnapshot(data);

      // Success — clear dirty flag and reset retry delay
      this._clearDirty();
      this.retryDelay = MIN_RETRY_MS;
      this.isSyncing = false;
      this._notifyStatus('idle');

      console.log('✅ Cloud sync complete');
      return true;
    } catch (err) {
      console.error('❌ Cloud sync failed:', err.message);
      this.isSyncing = false;
      this._notifyStatus('error');

      // Schedule retry with exponential backoff
      this._scheduleRetry();
      return false;
    }
  }

  /**
   * Schedule a retry with exponential backoff.
   */
  _scheduleRetry() {
    if (!navigator.onLine || !this.isRunning) return;

    this._clearRetry();
    console.log(`🔄 Retrying sync in ${this.retryDelay / 1000}s...`);

    this.retryTimer = setTimeout(() => {
      this._attemptSync();
    }, this.retryDelay);

    // Exponential backoff: double delay each time, cap at max
    this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS);
  }

  /**
   * Check if there are unsaved changes.
   */
  _isDirty() {
    return !!localStorage.getItem(DIRTY_FLAG_KEY);
  }

  /**
   * Clear the dirty flag.
   */
  _clearDirty() {
    localStorage.removeItem(DIRTY_FLAG_KEY);
  }

  /**
   * Clear the debounce timer.
   */
  _clearDebounce() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Clear the retry timer.
   */
  _clearRetry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Notify UI of status change.
   */
  _notifyStatus(status) {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  /**
   * Attempt to flush the queue before app shutdown.
   * Returns a promise that resolves in max 3 seconds.
   */
  async flushBeforeQuit() {
    if (!this._isDirty() || !navigator.onLine || !googleDriveService.isConnected()) {
      return;
    }

    console.log('⏳ Finalizing cloud sync before quit...');

    return Promise.race([
      this._attemptSync(),
      new Promise(resolve => setTimeout(resolve, 3000)) // Max 3 second wait
    ]);
  }
}

// Singleton
const syncQueue = new SyncQueue();
export default syncQueue;
