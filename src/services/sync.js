import { createRxDatabase } from 'rxdb';
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
      // One-time cleanup of old broken RxDB/Dexie IndexedDB databases.
      // Uses localStorage flag to ensure this only runs once.
      const CLEANUP_FLAG = 'rxdb_v7_enum_index_fix';
      if (!localStorage.getItem(CLEANUP_FLAG)) {
        try {
          if (indexedDB.databases) {
            const allDbs = await indexedDB.databases();
            const rxdbDbs = allDbs.filter(db => 
              db.name && (db.name.includes('rxdb') || db.name.includes('scs_rxdb'))
            );
            for (const dbInfo of rxdbDbs) {
              indexedDB.deleteDatabase(dbInfo.name);
              console.log(`🗑️ Deleted stale DB: ${dbInfo.name}`);
            }
            if (rxdbDbs.length > 0) {
              console.log(`🗑️ Cleaned ${rxdbDbs.length} stale RxDB database(s)`);
            }
          }
          localStorage.setItem(CLEANUP_FLAG, 'true');
        } catch (removeErr) {
          console.warn('⚠️ Could not enumerate databases for cleanup:', removeErr);
        }
      }

      // Create Database
      this.db = await createRxDatabase({
        name: 'scs_rxdb',
        storage: getRxStorageDexie()
      });

      // Add Collections
      console.log('📦 Initializing RxDB collections...');
      await this.db.addCollections({
        students: { schema: StudentSchema },
        payments: { schema: PaymentSchema },
        receipts: { schema: ReceiptSchema },
        settings: { schema: SettingSchema },
        fileMetadata: { schema: FileMetadataSchema },
        studentRemarks: { schema: StudentRemarksSchema },
        programmes: { schema: ProgrammeSchema }
      }).catch(err => {
        console.error('❌ addCollections failed:', err);
        throw err;
      });

      console.log('✅ RxDB collections initialized');

      // Setup Supabase Replication (if credentials provided)
      if (supabaseUrl && supabaseKey) {
        await this.setupReplication(supabaseUrl, supabaseKey);
        // Professional Ping: Verify connection on startup
        this.pingSupabase();
      }

      this.isInitialized = true;

      // Bridge RxDB to window for legacy code
      window.rxdb = this.db;
      console.log('🚀 RxDB Bridge Active');

      return this.db;
    } catch (err) {
      console.error('❌ Failed to initialize RxDB:', err);
      throw err;
    }
  }

  /**
   * Ping Supabase to verify connection activity
   */
  async pingSupabase() {
    if (!this.supabaseClient) return false;
    try {
      // Smallest query possible to verify authorization and connectivity
      const { error } = await this.supabaseClient.from('settings').select('key').limit(1);
      if (error) {
        // If error is just 'no rows', that's fine, it means connection works
        if (error.code === 'PGRST116' || error.message.includes('0 rows')) {
          console.log('📡 Supabase Active: Connection verified');
          return true;
        }
        throw error;
      }
      console.log('📡 Supabase Active: Connection verified');
      return true;
    } catch (err) {
      console.warn('📡 Supabase Connectivity Notice:', err.message);
      return false;
    }
  }

  /**
   * Setup Supabase Replication for all collections
   */
  async setupReplication(supabaseUrl, supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      this.supabaseClient = createClient(supabaseUrl, supabaseKey);

      const collections = ['students', 'payments', 'receipts', 'settings', 'fileMetadata', 'studentRemarks', 'programmes'];
      
      for (const collectionName of collections) {
        const collection = this.db[collectionName];
        if (!collection) continue;

        new SupabaseReplication({
          supabaseClient: this.supabaseClient,
          collection,
          replicationIdentifier: `supabase-${collectionName}`,
          pull: {},
          push: {},
        });
      }

      console.log('🔄 Supabase replication setup complete');
    } catch (err) {
      console.warn('⚠️ Supabase replication setup failed:', err.message);
    }
  }

  /**
   * Get the database instance
   */
  getDb() {
    return this.db;
  }

  /**
   * Check if initialized
   */
  isReady() {
    return this.isInitialized;
  }
}

// Singleton
const syncService = new SyncService();
export default syncService;
