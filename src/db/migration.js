import { db as legacyDb, STORES as LEGACY_STORES } from './database.js';
import syncService from '../services/sync.js';

/**
 * MIGRATION UTILITY
 * Moves data from legacy IndexedDB to new RxDB collections
 */
export async function migrateToRxDB() {
  console.log('📦 Starting data migration to RxDB...');
  
  const rxDb = syncService.getDb();
  if (!rxDb) {
    throw new Error('RxDB not initialized. Cannot migrate.');
  }

  try {
    // 1. Migrate Students
    const students = await legacyDb.getAll(LEGACY_STORES.STUDENTS);
    console.log(`Migrating ${students.length} students...`);
    if (rxDb.students) {
      for (const student of students) {
        try {
          await rxDb.students.upsert({
            ...student,
            id: student.id.toString(),
            updatedAt: student.updatedAt || new Date().toISOString()
          });
        } catch (err) {
          console.error(`❌ Student migration failed for ID ${student.id}:`, err);
        }
      }
    }

    // 2. Migrate Payments
    const payments = await legacyDb.getAll(LEGACY_STORES.PAYMENTS);
    console.log(`Migrating ${payments.length} payments...`);
    if (rxDb.payments) {
      for (const payment of payments) {
        await rxDb.payments.upsert({
          ...payment,
          id: payment.id.toString(),
          updatedAt: payment.updatedAt || new Date().toISOString()
        });
      }
    }

    // 3. Migrate Receipts
    const receipts = await legacyDb.getAll(LEGACY_STORES.RECEIPTS);
    console.log(`Migrating ${receipts.length} receipts...`);
    if (rxDb.receipts) {
      for (const receipt of receipts) {
        await rxDb.receipts.upsert({
          ...receipt,
          id: receipt.id.toString(),
          updatedAt: receipt.updatedAt || new Date().toISOString()
        });
      }
    }

    // 4. Migrate Settings
    const settings = await legacyDb.getAll(LEGACY_STORES.SETTINGS);
    if (rxDb.settings) {
      for (const setting of settings) {
        await rxDb.settings.upsert({
          ...setting,
          updatedAt: new Date().toISOString()
        });
      }
    }

    // 5. Migrate Programme info
    const programmes = await legacyDb.getAll(LEGACY_STORES.PROGRAMMES);
    if (rxDb.programmes) {
      for (const prog of programmes) {
        await rxDb.programmes.upsert({
          ...prog,
          id: prog.id.toString(),
          updatedAt: new Date().toISOString()
        });
      }
    }

    // 6. Migrate File Metadata
    const fileMeta = await legacyDb.getAll(LEGACY_STORES.FILE_METADATA);
    if (rxDb.fileMetadata) {
      for (const meta of fileMeta) {
        await rxDb.fileMetadata.upsert({
          ...meta,
          id: meta.id.toString(),
          updatedAt: meta.updatedAt || new Date().toISOString()
        });
      }
    }

    console.log('✅ Migration complete!');
    return true;
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}
