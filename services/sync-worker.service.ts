import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

// Flag to prevent concurrent syncs
let isSyncing = false;

/**
 * Check if Python is available and has required dependencies
 */
async function checkPythonAvailable(): Promise<boolean> {
  try {
    // Check if python/python3 command exists
    await execAsync('python --version || python3 --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the correct path to Python scripts
 * In production, scripts are in project root, not relative to compiled code
 */
function getScriptPath(scriptName: string): string | null {
  // Try multiple possible locations
  const possiblePaths = [
    path.join(process.cwd(), scriptName), // Project root (production)
    path.join(process.cwd(), '..', scriptName), // One level up
    path.join(__dirname, '..', '..', scriptName), // From dist folder
    path.join(__dirname, '..', scriptName), // From services folder (dev)
  ];

  for (const scriptPath of possiblePaths) {
    if (existsSync(scriptPath)) {
      return scriptPath;
    }
  }

  return null;
}

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
    const scriptPath = getScriptPath('knowlarity_sync.py');
    
    if (!scriptPath) {
      console.warn('[Sync Worker] Knowlarity sync script not found, skipping...');
      return;
    }

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
    const scriptPath = getScriptPath('meta_sync.py');
    
    if (!scriptPath) {
      console.warn('[Sync Worker] Meta sync script not found, skipping...');
      return;
    }

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
 * Note: This is a backup method. Webhooks are the primary sync method.
 */
export async function startSyncWorker() {
  console.log('[Sync Worker] Starting sync worker...');
  
  // Check if Python is available
  const pythonAvailable = await checkPythonAvailable();
  if (!pythonAvailable) {
    console.warn('[Sync Worker] Python not available - sync worker disabled');
    console.warn('[Sync Worker] Using webhooks as primary sync method (recommended)');
    console.warn('[Sync Worker] To enable sync worker, install Python and dependencies on server');
    return;
  }

  // Check if scripts exist
  const knowlarityScript = getScriptPath('knowlarity_sync.py');
  const metaScript = getScriptPath('meta_sync.py');
  
  if (!knowlarityScript && !metaScript) {
    console.warn('[Sync Worker] Python scripts not found - sync worker disabled');
    console.warn('[Sync Worker] Using webhooks as primary sync method (recommended)');
    return;
  }

  console.log('[Sync Worker] Knowlarity: every 30 seconds');
  console.log('[Sync Worker] Meta: every 5 minutes');
  console.log('[Sync Worker] Note: Webhooks are primary sync method, this is backup only');

  // Sync Knowlarity every 30 seconds (only if script exists)
  if (knowlarityScript) {
    setInterval(() => {
      syncKnowlarity().catch(err => {
        console.error('[Sync Worker] Unhandled error in Knowlarity sync:', err);
      });
    }, 30 * 1000); // 30 seconds

    // Run initial sync immediately
    syncKnowlarity().catch(err => {
      console.error('[Sync Worker] Initial Knowlarity sync failed:', err);
    });
  } else {
    console.warn('[Sync Worker] Knowlarity script not found - skipping');
  }

  // Sync Meta every 5 minutes (only if script exists)
  if (metaScript) {
    setInterval(() => {
      syncMeta().catch(err => {
        console.error('[Sync Worker] Unhandled error in Meta sync:', err);
      });
    }, 5 * 60 * 1000); // 5 minutes

    // Run initial Meta sync after 10 seconds (to avoid overlap)
    setTimeout(() => {
      syncMeta().catch(err => {
        console.error('[Sync Worker] Initial Meta sync failed:', err);
      });
    }, 10 * 1000);
  } else {
    console.warn('[Sync Worker] Meta script not found - skipping');
  }

  console.log('[Sync Worker] Sync worker started successfully');
}

