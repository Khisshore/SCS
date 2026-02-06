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
   * Initialize the database and create object stores
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // Handle database upgrade (first time or version change)
      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create Students store
        if (!db.objectStoreNames.contains(STORES.STUDENTS)) {
          const studentStore = db.createObjectStore(STORES.STUDENTS, {
            keyPath: 'id',
            autoIncrement: true
          });
          studentStore.createIndex('studentId', 'studentId', { unique: true });
          studentStore.createIndex('email', 'email', { unique: false });
          studentStore.createIndex('status', 'status', { unique: false });
        }

        // Create Payments store
        if (!db.objectStoreNames.contains(STORES.PAYMENTS)) {
          const paymentStore = db.createObjectStore(STORES.PAYMENTS, {
            keyPath: 'id',
            autoIncrement: true
          });
          paymentStore.createIndex('studentId', 'studentId', { unique: false });
          paymentStore.createIndex('date', 'date', { unique: false });
          paymentStore.createIndex('method', 'method', { unique: false });
          paymentStore.createIndex('semester', 'semester', { unique: false });
        }

        // Create Receipts store
        if (!db.objectStoreNames.contains(STORES.RECEIPTS)) {
          const receiptStore = db.createObjectStore(STORES.RECEIPTS, {
            keyPath: 'id',
            autoIncrement: true
          });
          receiptStore.createIndex('paymentId', 'paymentId', { unique: true });
          receiptStore.createIndex('receiptNumber', 'receiptNumber', { unique: true });
        }

        // Create Settings store (key-value pairs)
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
        }

        // Create File Metadata store
        if (!db.objectStoreNames.contains(STORES.FILE_METADATA)) {
          const fileMetadataStore = db.createObjectStore(STORES.FILE_METADATA, {
            keyPath: 'id',
            autoIncrement: true
          });
          fileMetadataStore.createIndex('filePath', 'filePath', { unique: true });
          fileMetadataStore.createIndex('studentName', 'studentName', { unique: false });
          fileMetadataStore.createIndex('course', 'course', { unique: false });
          fileMetadataStore.createIndex('semester', 'semester', { unique: false });
        }

        // Create Student Remarks store (for spreadsheet remarks at student level)
        if (!db.objectStoreNames.contains(STORES.STUDENT_REMARKS)) {
          const remarksStore = db.createObjectStore(STORES.STUDENT_REMARKS, {
            keyPath: 'id',
            autoIncrement: true
          });
          remarksStore.createIndex('studentId', 'studentId', { unique: true });
        }

        // Create Programmes store
        if (!db.objectStoreNames.contains(STORES.PROGRAMMES)) {
          const programmeStore = db.createObjectStore(STORES.PROGRAMMES, {
            keyPath: 'id',
            autoIncrement: true
          });
          programmeStore.createIndex('course', 'course', { unique: false });
          programmeStore.createIndex('name', 'name', { unique: true });
        }

        // Add semester index to existing payments store if upgrading
        if (event.oldVersion < 3 && db.objectStoreNames.contains(STORES.PAYMENTS)) {
          const transaction = event.target.transaction;
          const paymentStore = transaction.objectStore(STORES.PAYMENTS);
          if (!paymentStore.indexNames.contains('semester')) {
            paymentStore.createIndex('semester', 'semester', { unique: false });
          }
        }

        console.log('✅ SCS database schema created successfully');
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('✅ Database initialized successfully');
        
        // Initialize default settings
        this.initializeSettings();
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('❌ Database error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Initialize default settings
   */
  async initializeSettings() {
    const defaultSettings = [
      { key: 'currency', value: 'RM' },
      { key: 'lastReceiptNumber', value: 0 },
      { key: 'institutionName', value: 'Education Institution' },
      { key: 'institutionAddress', value: '' },
      { key: 'baseFolder', value: null },
      { key: 'firstRunCompleted', value: false }
    ];

    for (const setting of defaultSettings) {
      const exists = await this.getSetting(setting.key);
      if (!exists) {
        await this.setSetting(setting.key, setting.value);
      } else if (setting.key === 'currency' && exists !== 'RM') {
        // Migration: Ensure currency is always RM
        await this.setSetting(setting.key, 'RM');
      }
    }
  }

  /**
   * Generic method to add a record to a store
   * @param {string} storeName - Name of the object store
   * @param {object} data - Data to add
   * @returns {Promise<number>} - ID of the created record
   */
  async add(storeName, data) {
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
   * Generic method to update a record in a store
   * @param {string} storeName - Name of the object store
   * @param {object} data - Data to update (must include key)
   * @returns {Promise<number>} - ID of the updated record
   */
  async update(storeName, data) {
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
   * @param {string} storeName - Name of the object store
   * @param {number} id - ID of the record
   * @returns {Promise<object>} - The record
   */
  async get(storeName, id) {
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
   * @param {string} storeName - Name of the object store
   * @returns {Promise<Array>} - Array of all records
   */
  async getAll(storeName) {
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
   * @param {string} storeName - Name of the object store
   * @param {number} id - ID of the record to delete
   * @returns {Promise<void>}
   */
  async delete(storeName, id) {
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
   * @param {string} storeName - Name of the object store
   * @param {string} indexName - Name of the index
   * @param {any} value - Value to search for
   * @returns {Promise<Array>} - Matching records
   */
  async getByIndex(storeName, indexName, value) {
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
