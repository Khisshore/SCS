import { createRxDatabase } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { replicateRxCollection } from 'rxdb/plugins/replication';
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
    this.replications = [];
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
   * Uses RxDB's built-in replicateRxCollection plugin (rxdb/plugins/replication)
   * instead of the removed rxdb-supabase third-party wrapper.
   */
  async setupReplication(supabaseUrl, supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      this.supabaseClient = createClient(supabaseUrl, supabaseKey);

      const collections = ['students', 'payments', 'receipts', 'settings', 'fileMetadata', 'studentRemarks', 'programmes'];
      
      for (const collectionName of collections) {
        const collection = this.db[collectionName];
        if (!collection) continue;

        const replication = replicateRxCollection({
          collection,
          replicationIdentifier: `supabase-${collectionName}`,
          live: true,
          retryTime: 5000,

          pull: {
            handler: async (lastCheckpoint) => {
              try {
                const since = lastCheckpoint?.updatedAt || '1970-01-01T00:00:00Z';
                const { data, error } = await this.supabaseClient
                  .from(collectionName)
                  .select('*')
                  .gt('updatedAt', since)
                  .order('updatedAt', { ascending: true })
                  .limit(100);

                if (error) {
                  console.warn(`Pull error [${collectionName}]:`, error.message, error.code);
                  throw error;
                }

                return {
                  documents: data || [],
                  checkpoint: data?.length
                    ? { updatedAt: data[data.length - 1].updatedAt }
                    : lastCheckpoint
                };
              } catch (err) {
                console.error(`❌ Replication Pull Failed [${collectionName}]:`, err);
                throw err;
              }
            }
          },

          push: {
            handler: async (docs) => {
              try {
                for (const doc of docs) {
                  const row = { ...doc.newDocumentState };
                  
                  // Strip RxDB internal fields that might not exist in Supabase
                  // especially the '_deleted' field which causes 400 errors if missing in schema
                  delete row._deleted;
                  delete row._rev;
                  delete row._attachments;
                  delete row._meta;
                  delete row.createdAt; // Not all Supabase tables have this column

                  // Strip non-existent Supabase columns
                  delete row.registrationFeeMethod;
                  delete row.commissionMethod;

                  const { error } = await this.supabaseClient
                    .from(collectionName)
                    .upsert(row, { onConflict: 'id' });

                  if (error) {
                    console.warn(`Push error [${collectionName}]:`, error.message, error.code);
                  }
                }
              } catch (err) {
                console.error(`❌ Replication Push Failed [${collectionName}]:`, err);
              }
              return [];
            }
          }
        });

        this.replications.push(replication);
      }

      console.log('🔄 Supabase replication setup complete (native RxDB plugin)');
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
