import { createRxDatabase, addRxPlugin } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { SupabaseReplication } from 'rxdb-supabase';
import { 
  StudentSchema, 
  PaymentSchema, 
  ReceiptSchema, 
  SettingSchema, 
  FileMetadataSchema, 
  StudentRemarksSchema, 
  ProgrammeSchema 
} from '../db/schemas.js';



// Add plugins
// No plugin needs to be added for rxdb-supabase as it's a standalone class

class SyncService {
  constructor() {
    this.db = null;
    this.supabaseClient = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the Reactive Database
   */
  async init(supabaseUrl, supabaseKey) {
    if (this.isInitialized) return this.db;

    try {
      // Create Database
      this.db = await createRxDatabase({
        name: 'scs_rxdb',
        storage: getRxStorageDexie()
      });

      // Add Collections
      await this.db.addCollections({
        students: { schema: StudentSchema },
        payments: { schema: PaymentSchema },
        receipts: { schema: ReceiptSchema },
        settings: { schema: SettingSchema },
        fileMetadata: { schema: FileMetadataSchema },
        studentRemarks: { schema: StudentRemarksSchema },
        programmes: { schema: ProgrammeSchema }
      });

      console.log('✅ RxDB collections initialized');

      // Initialize Supabase client (only if credentials provided)
      if (supabaseUrl && supabaseKey) {
        const { createClient } = await import('@supabase/supabase-js');
        this.supabaseClient = createClient(supabaseUrl, supabaseKey);
        await this.setupReplication();
      }

      this.isInitialized = true;
      return this.db;
    } catch (error) {
      console.error('❌ Failed to initialize RxDB:', error);
      throw error;
    }
  }

  /**
   * Setup Real-Time Replication with Supabase
   */
  async setupReplication() {
    if (!this.db || !this.supabaseClient) return;

    const collections = [
      'students', 
      'payments', 
      'receipts', 
      'settings', 
      'fileMetadata', 
      'studentRemarks', 
      'programmes'
    ];

    for (const collectionName of collections) {
      if (this.db[collectionName]) {
        new SupabaseReplication({
          replicationIdentifier: `scs-sync-${collectionName}`,
          collection: this.db[collectionName],
          supabaseClient: this.supabaseClient,
          table: collectionName,
          pull: {}, // Pull settings (defaults are fine)
          push: {}  // Push settings (defaults are fine)
        });
      }
    }

    console.log('🔄 Supabase replication service started for all collections');
  }

  /**
   * Get the database instance
   */
  getDb() {
    return this.db;
  }
}

export const syncService = new SyncService();
