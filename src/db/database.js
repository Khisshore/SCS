// Dual-write database layer: Legacy IndexedDB is the primary store (written to disk via Portable Library),
// RxDB provides reactive queries and optional Supabase replication.
// All mutations write to both stores; Legacy is the master backup for disaster recovery.

const DB_NAME = 'SCSDB';
const DB_VERSION = 4;

// Object store names
const STORES = {
  STUDENTS: 'students',
  PAYMENTS: 'payments',
  RECEIPTS: 'receipts',
  SETTINGS: 'settings',
  FILE_METADATA: 'fileMetadata',
  STUDENT_REMARKS: 'studentRemarks',
  PROGRAMMES: 'programmes'
};

class Database {
  constructor() {
    this.db = null;
    this.onChange = null;
    this.onCloudSync = null; // Callback for cloud sync queue (called on data mutations)
    this.isImporting = false;
  }

  // Dual init: Legacy IndexedDB first (required for Portable Library export), then RxDB overlay
  async init() {
    // 1. Initialize Legacy IndexedDB (Required for migration)
    const legacyReady = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        Object.values(STORES).forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
          }
        });
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(true);
      };
      request.onerror = (e) => reject(e.target.error);
    });

    // 2. Initialize RxDB via SyncService
    try {
      const syncModule = await import('../services/sync.js');
      const syncService = syncModule.default;
      // Get credentials from legacy settings if they exist
      const supabaseUrl = await this.getSetting('supabaseUrl');
      const supabaseKey = await this.getSetting('supabaseKey');
      
      this.rxDb = await syncService.init(supabaseUrl, supabaseKey);
      console.log('🚀 RxDB Bridge Active');

      // Recover settings that exist in Legacy but are missing from RxDB (e.g., after a failed migration or app crash)
      const legacySettings = await new Promise((resolve) => {
        const transaction = this.db.transaction([STORES.SETTINGS], 'readonly');
        const store = transaction.objectStore(STORES.SETTINGS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });

      if (this.rxDb.settings && legacySettings.length > 0) {
        let healCount = 0;
        for (const legSetting of legacySettings) {
          const rxSetting = await this.rxDb.settings.findOne(legSetting.key).exec();
          
          let shouldUpsert = false;
          if (!rxSetting) {
            shouldUpsert = true;
          } else {
            const legTime = new Date(legSetting.updatedAt || 0).getTime();
            const rxTime = new Date(rxSetting.updatedAt || 0).getTime();
            if (legTime >= rxTime) {
              shouldUpsert = true;
            }
          }

          if (shouldUpsert) {
            await this.rxDb.settings.upsert({
              ...legSetting,
              updatedAt: legSetting.updatedAt || new Date().toISOString()
            });
            healCount++;
          }
        }
        if (healCount > 0) console.log(`🛠️ Self-healed ${healCount} configuration settings (Legacy Master Logic)`);
      }
    } catch (err) {
      console.warn('⚠️ RxDB initialization failed, falling back to legacy IndexedDB:', err);
    }

    // Layer 3: Startup Integrity Check + Auto-Recovery
    await this.performIntegrityCheck();

    // Layer 1: Start Auto-Backup
    this.initAutoBackup();

    return legacyReady;
  }

  /**
   * Layer 3: Check if DB is empty but backups exist in Base Folder
   */
  async performIntegrityCheck() {
    if (!window.electronAPI) return;
    try {
      const students = await this.getAll(STORES.STUDENTS);
      const payments = await this.getAll(STORES.PAYMENTS);
      
      if (students.length === 0 && payments.length === 0) {
        const baseFolder = await this.getSetting('baseFolder');
        if (!baseFolder) return;

        const files = await window.electronAPI.listFiles(baseFolder);
        if (!Array.isArray(files)) return; // listFiles returned non-array, skip check
        const backups = files.filter(f => f.name.startsWith('SCS_AutoBackup_') || f.name === 'SCS_ShutdownBackup.json');
        
        if (backups.length > 0) {
          // Find the most recently modified backup
          backups.sort((a, b) => b.mtimeMs - a.mtimeMs);
          const latestBackup = backups[0];
          
          if (window.confirm(`Your database appears empty but we found a recent backup (${latestBackup.name}). Would you like to restore it now?`)) {
            const separator = baseFolder.includes('\\') ? '\\' : '/';
            const backupPath = `${baseFolder}${separator}${latestBackup.name}`;
            const fileContent = await window.electronAPI.readFile(backupPath);
            if (fileContent) {
              const data = JSON.parse(fileContent);
              await this.importData(data);
              alert('✅ Database recovered successfully from backup.');
            }
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ Integrity check failed:', err);
    }
  }

  /**
   * Layer 1: Auto-Backup to Base Folder (every 15 min)
   */
  initAutoBackup() {
    if (!window.electronAPI) return;
    let index = 0;
    
    // Run every 15 minutes (900000 ms)
    setInterval(async () => {
      try {
        const baseFolder = await this.getSetting('baseFolder');
        if (!baseFolder) return;

        const data = await this.exportData();
        const separator = baseFolder.includes('\\\\') ? '\\\\' : '/';
        const backupPath = `${baseFolder}${separator}SCS_AutoBackup_${index}.json`;
        
        await window.electronAPI.writeFile(backupPath, JSON.stringify(data, null, 2));
        console.log(`🛡️ Auto-backup saved to ${backupPath}`);
        
        index = (index + 1) % 5;
      } catch (err) {
        console.error('❌ Auto-backup failed:', err);
      }
    }, 15 * 60 * 1000);
  }

  /**
   * Layer 2: Shutdown Backup
   */
  async performShutdownBackup() {
    if (!window.electronAPI) return;
    try {
      const baseFolder = await this.getSetting('baseFolder');
      if (!baseFolder) return;
      
      const data = await this.exportData();
      const separator = baseFolder.includes('\\\\') ? '\\\\' : '/';
      const backupPath = `${baseFolder}${separator}SCS_ShutdownBackup.json`;
      
      await window.electronAPI.writeFile(backupPath, JSON.stringify(data, null, 2));
      console.log(`🛡️ Shutdown backup saved to ${backupPath}`);
    } catch (err) {
      console.error('❌ Shutdown backup failed:', err);
    }
  }

  /**
   * Health check for Supabase connection
   */
  async checkSupabaseConnection() {
    try {
      const syncModule = await import('../services/sync.js');
      const syncService = syncModule.default;
      return await syncService.pingSupabase();
    } catch (err) {
      return false;
    }
  }

  /**
   * Helper to get RxDB collection by store name
   */
  getCollection(storeName) {
    if (!this.rxDb) return null;
    const mapping = {
      [STORES.STUDENTS]: 'students',
      [STORES.PAYMENTS]: 'payments',
      [STORES.RECEIPTS]: 'receipts',
      [STORES.SETTINGS]: 'settings',
      [STORES.FILE_METADATA]: 'fileMetadata',
      [STORES.STUDENT_REMARKS]: 'studentRemarks',
      [STORES.PROGRAMMES]: 'programmes'
    };
    return this.rxDb[mapping[storeName]];
  }

  /**
   * Generic method to add a record
   */
  async add(storeName, data) {
    const collection = this.getCollection(storeName);
    if (collection) {
      // Ensure data has a string ID for RxDB
      const doc = { 
        ...data, 
        id: data.id ? data.id.toString() : Math.random().toString(36).substring(7),
        updatedAt: new Date().toISOString()
      };
      const result = await collection.insert(doc);
      if (this.onChange && !this.isImporting) this.onChange();
      if (this.onCloudSync && !this.isImporting && storeName !== 'settings') this.onCloudSync(storeName, 'add', doc);
      return result.id;
    }

    // Fallback to legacy
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add(data);
      request.onsuccess = () => {
        resolve(request.result);
        if (this.onChange && !this.isImporting) this.onChange();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic method to update a record
   */
  async update(storeName, data) {
    const collection = this.getCollection(storeName);
    if (collection) {
      const doc = { ...data, updatedAt: new Date().toISOString() };
      const result = await collection.upsert(doc);
      if (this.onChange && !this.isImporting) this.onChange();
      if (this.onCloudSync && !this.isImporting && storeName !== 'settings') this.onCloudSync(storeName, 'update', doc);
      return result.id;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      // Coerce to number if possible for IndexedDB (which often uses numeric keys)
      const numericId = Number(data.id);
      const prioritizedData = (!isNaN(numericId) && data.id !== undefined) ? { ...data, id: numericId } : data;
      
      const request = store.put(prioritizedData);
      request.onsuccess = () => {
        resolve(request.result);
        if (this.onChange && !this.isImporting) this.onChange();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic method to get a record by ID
   */
  async get(storeName, id) {
    const collection = this.getCollection(storeName);
    if (collection) {
      const doc = await collection.findOne(id.toString()).exec();
      if (doc) return doc.toJSON();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      
      // Try string ID first
      const request = store.get(id);
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result);
        } else {
          // If string ID fails, try numeric ID
          const numericId = Number(id);
          if (!isNaN(numericId)) {
            const numRequest = store.get(numericId);
            numRequest.onsuccess = () => resolve(numRequest.result);
            numRequest.onerror = () => reject(numRequest.error);
          } else {
            resolve(null);
          }
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic method to get all records from a store
   */
  async getAll(storeName) {
    const collection = this.getCollection(storeName);
    if (collection) {
      const docs = await collection.find().exec();
      return docs.map(d => d.toJSON());
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic method to delete a record
   */
  async delete(storeName, id) {
    const collection = this.getCollection(storeName);
    if (collection) {
      const doc = await collection.findOne(id.toString()).exec();
      if (doc) await doc.remove();
      if (this.onChange && !this.isImporting) this.onChange();
      if (this.onCloudSync && !this.isImporting && storeName !== 'settings') this.onCloudSync(storeName, 'delete', { id });
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      // Try original ID first
      const request = store.delete(id);
      request.onsuccess = () => {
        // Unfortunately request.result is undefined for delete, so we can't easily check 'success'
        // But we can try numeric ID if it might have failed (no-op doesn't error in IndexedDB)
        const numericId = Number(id);
        if (!isNaN(numericId) && id !== numericId) {
          store.delete(numericId);
        }
        resolve();
        if (this.onChange && !this.isImporting) this.onChange();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get records by index
   */
  async getByIndex(storeName, indexName, value) {
    const collection = this.getCollection(storeName);
    if (collection) {
      // RxDB uses mango queries or chains
      const query = {};
      query[indexName] = value;
      const docs = await collection.find({ selector: query }).exec();
      return docs.map(d => d.toJSON());
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      
      try {
        const index = store.index(indexName);
        const request = index.getAll(value);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (err) {
        // Fallback for missing indexes in legacy IndexedDB
        console.warn(`Fallback: index ${indexName} missing on ${storeName}, performing full scan.`);
        const request = store.getAll();
        request.onsuccess = () => {
          const results = (request.result || []).filter(item => item[indexName] === value);
          resolve(results);
        };
        request.onerror = () => reject(request.error);
      }
    });
  }

  /**
   * Get setting value
   * @param {string} key - Setting key
   * @returns {Promise<any>} - Setting value
   */
  async getSetting(key) {
    const setting = await this.get(STORES.SETTINGS, key);
    return setting ? setting.value : null;
  }

  /**
   * Set setting value - Redundant storage for security
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   */
  async setSetting(key, value) {
    const updatedAt = new Date().toISOString();
    
    // 1. Always write to Legacy IndexedDB (Primary Source of Truth for Config)
    const legacyPromise = new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.SETTINGS], 'readwrite');
      const store = transaction.objectStore(STORES.SETTINGS);
      const request = store.put({ key, value, updatedAt });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // 2. Always attempt to write to RxDB (Reactive Layer)
    const rxDbPromise = (async () => {
      const collection = this.getCollection(STORES.SETTINGS);
      if (collection) {
        return await collection.upsert({ key, value, updatedAt });
      }
      return null;
    })();

    const [result] = await Promise.all([legacyPromise, rxDbPromise]);
    
    if (this.onChange && !this.isImporting) this.onChange();
    return result;
  }

  /**
   * Delete a setting
   * @param {string} key - Setting key to delete
   * @returns {Promise<void>}
   */
  async deleteSetting(key) {
    return this.delete(STORES.SETTINGS, key);
  }

  /**
   * Export all data as JSON for backup
   * @returns {Promise<object>} - All database data
   */
  async exportData() {
    const data = {
      version: DB_VERSION,
      exportDate: new Date().toISOString(),
      students: await this.getAll(STORES.STUDENTS),
      payments: await this.getAll(STORES.PAYMENTS),
      receipts: await this.getAll(STORES.RECEIPTS),
      settings: await this.getAll(STORES.SETTINGS),
      studentRemarks: await this.getAll(STORES.STUDENT_REMARKS),
      programmes: await this.getAll(STORES.PROGRAMMES),
      fileMetadata: await this.getAll(STORES.FILE_METADATA)
    };
    return data;
  }

  /**
   * Validate backup data structure
   * @param {object} data - Data to validate
   * @returns {boolean}
   */
  validateData(data) {
    if (!data || typeof data !== 'object') return false;
    
    // Check for required stores
    const requiredStores = ['students', 'payments', 'settings'];
    for (const store of requiredStores) {
      if (!Array.isArray(data[store])) {
        console.error(`❌ Validation failed: Missing or invalid store "${store}"`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Import data from backup
   * @param {object} data - Backup data
   * @returns {Promise<void>}
   */
  async importData(data) {
    this.isImporting = true; // Set flag to prevent onChange calls during import
    try {
      // Validate first
      if (!this.validateData(data)) {
        throw new Error('Invalid backup file format');
      }

      // Clear existing data
      await this.clearAllData();

      // Import students
      for (const student of data.students || []) {
        await this.add(STORES.STUDENTS, student);
      }

      // Import payments
      for (const payment of data.payments || []) {
        await this.add(STORES.PAYMENTS, payment);
      }

      // Import receipts
      for (const receipt of data.receipts || []) {
        await this.add(STORES.RECEIPTS, receipt);
      }

      // Import settings
      for (const setting of data.settings || []) {
        await this.update(STORES.SETTINGS, setting);
      }

      // Import student remarks
      for (const remark of data.studentRemarks || []) {
        await this.add(STORES.STUDENT_REMARKS, remark);
      }

      // Import programmes
      for (const programme of data.programmes || []) {
        await this.add(STORES.PROGRAMMES, programme);
      }

      // Import file metadata
      for (const meta of data.fileMetadata || []) {
        await this.add(STORES.FILE_METADATA, meta);
      }

      console.log('✅ Data imported successfully');
      if (this.onChange) this.onChange(); // Trigger onChange once after import
    } catch (error) {
      console.error('❌ Error importing data:', error);
      throw error;
    } finally {
      this.isImporting = false; // Reset flag
    }
  }

  /**
   * Clear all data from the database
   */
  async clearAllData() {
    const storeNames = Object.values(STORES);
    
    for (const storeName of storeNames) {
      await new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }
}

// Create and export a singleton instance
const db = new Database();

export { db, STORES };
