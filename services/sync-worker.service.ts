import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

// Flag to prevent concurrent syncs
let isSyncing = false;

/**
 * Run Knowlarity sync script
 */
async function syncKnowlarity() {
  if (isSyncing) {
    console.log('[Sync Worker] Knowlarity sync already in progress, skipping...');
    return;
  }

  try {
    isSyncing = true;
    const scriptPath = path.join(__dirname, '..', 'knowlarity_sync.py');
    const { stdout, stderr } = await execAsync(`python ${scriptPath}`);
    
    if (stdout) {
      console.log('[Sync Worker] Knowlarity sync output:', stdout);
    }
    if (stderr) {
      console.error('[Sync Worker] Knowlarity sync errors:', stderr);
    }
    
    console.log('[Sync Worker] Knowlarity sync completed successfully');
  } catch (error: any) {
    console.error('[Sync Worker] Knowlarity sync failed:', error.message);
    // Don't throw - allow next sync to retry
  } finally {
    isSyncing = false;
  }
}

/**
 * Run Meta sync script
 */
async function syncMeta() {
  if (isSyncing) {
    console.log('[Sync Worker] Meta sync already in progress, skipping...');
    return;
  }

  try {
    isSyncing = true;
    const scriptPath = path.join(__dirname, '..', 'meta_sync.py');
    const { stdout, stderr } = await execAsync(`python ${scriptPath}`);
    
    if (stdout) {
      console.log('[Sync Worker] Meta sync output:', stdout);
    }
    if (stderr) {
      console.error('[Sync Worker] Meta sync errors:', stderr);
    }
    
    console.log('[Sync Worker] Meta sync completed successfully');
  } catch (error: any) {
    console.error('[Sync Worker] Meta sync failed:', error.message);
    // Don't throw - allow next sync to retry
  } finally {
    isSyncing = false;
  }
}

/**
 * Start the sync worker
 * Polls Knowlarity every 30 seconds, Meta every 5 minutes
 */
export function startSyncWorker() {
  console.log('[Sync Worker] Starting sync worker...');
  console.log('[Sync Worker] Knowlarity: every 30 seconds');
  console.log('[Sync Worker] Meta: every 5 minutes');

  // Sync Knowlarity every 30 seconds
  setInterval(() => {
    syncKnowlarity().catch(err => {
      console.error('[Sync Worker] Unhandled error in Knowlarity sync:', err);
    });
  }, 30 * 1000); // 30 seconds

  // Sync Meta every 5 minutes
  setInterval(() => {
    syncMeta().catch(err => {
      console.error('[Sync Worker] Unhandled error in Meta sync:', err);
    });
  }, 5 * 60 * 1000); // 5 minutes

  // Run initial sync immediately
  syncKnowlarity().catch(err => {
    console.error('[Sync Worker] Initial Knowlarity sync failed:', err);
  });
  
  // Run initial Meta sync after 10 seconds (to avoid overlap)
  setTimeout(() => {
    syncMeta().catch(err => {
      console.error('[Sync Worker] Initial Meta sync failed:', err);
    });
  }, 10 * 1000);

  console.log('[Sync Worker] Sync worker started successfully');
}

