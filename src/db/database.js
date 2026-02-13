/**
 * DATABASE MODULE
 * Handles all IndexedDB operations for the Payment Management System
 * Provides a clean API for storing and retrieving students, payments, and receipts
 */

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
    this.isImporting = false;
  }

  /**
   * Initialize the database and create object stores (Legacy)
   * Also initializes RxDB (New)
   * @returns {Promise<any>}
   */
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
      const { syncService } = await import('../services/sync.js');
      // Get credentials from legacy settings if they exist
      const supabaseUrl = await this.getSetting('supabaseUrl');
      const supabaseKey = await this.getSetting('supabaseKey');
      
      this.rxDb = await syncService.init(supabaseUrl, supabaseKey);
      console.log('🚀 RxDB Bridge Active');
    } catch (err) {
      console.warn('⚠️ RxDB initialization failed, falling back to legacy IndexedDB:', err);
    }

    return legacyReady;
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
      return result.id;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);
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
      return doc ? doc.toJSON() : null;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
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
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => {
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
      const index = store.index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
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
   * Set setting value
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   */
  async setSetting(key, value) {
    return this.update(STORES.SETTINGS, { key, value });
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
