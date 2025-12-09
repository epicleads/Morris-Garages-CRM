import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

// Flag to prevent concurrent syncs
let isSyncing = false;

/**
 * Check if Python is available
 */
async function checkPythonAvailable(): Promise<{ available: boolean; version?: string }> {
  try {
    const { stdout } = await execAsync('python --version 2>&1 || python3 --version 2>&1');
    const version = stdout.trim();
    console.log(`[Sync Worker] Python found: ${version}`);
    return { available: true, version };
  } catch (error: any) {
    console.log('[Sync Worker] Python not available:', error.message);
    return { available: false };
  }
}

/**
 * Check if required Python packages are installed
 */
async function checkPythonDependencies(): Promise<{ installed: boolean; missing?: string[] }> {
  const requiredPackages = ['requests', 'supabase', 'python-dotenv'];
  const missing: string[] = [];

  for (const pkg of requiredPackages) {
    try {
      await execAsync(`python -c "import ${pkg}" 2>&1 || python3 -c "import ${pkg}" 2>&1`);
      console.log(`[Sync Worker] ✓ Python package '${pkg}' is installed`);
    } catch {
      console.log(`[Sync Worker] ✗ Python package '${pkg}' is missing`);
      missing.push(pkg);
    }
  }

  if (missing.length > 0) {
    console.log(`[Sync Worker] Missing Python packages: ${missing.join(', ')}`);
    console.log(`[Sync Worker] To install: pip install ${missing.join(' ')}`);
    return { installed: false, missing };
  }

  return { installed: true };
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
    console.log('[Sync Worker] Starting Knowlarity sync...');
    
    const scriptPath = getScriptPath('knowlarity_sync.py');
    
    if (!scriptPath) {
      console.warn('[Sync Worker] Knowlarity sync script not found, skipping...');
      console.warn('[Sync Worker] Searched paths:', [
        path.join(process.cwd(), 'knowlarity_sync.py'),
        path.join(process.cwd(), '..', 'knowlarity_sync.py'),
        path.join(__dirname, '..', '..', 'knowlarity_sync.py'),
        path.join(__dirname, '..', 'knowlarity_sync.py'),
      ]);
      return;
    }

    console.log(`[Sync Worker] Found script at: ${scriptPath}`);
    console.log(`[Sync Worker] Executing: python ${scriptPath}`);

    const { stdout, stderr } = await execAsync(`python ${scriptPath} 2>&1`);
    
    if (stdout) {
      console.log('[Sync Worker] Knowlarity sync output:', stdout);
    }
    if (stderr && !stdout) {
      console.error('[Sync Worker] Knowlarity sync errors:', stderr);
    }
    
    console.log('[Sync Worker] ✓ Knowlarity sync completed successfully');
  } catch (error: any) {
    console.error('[Sync Worker] ✗ Knowlarity sync failed');
    console.error('[Sync Worker] Error details:', {
      message: error.message,
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr,
    });
    
    // Check if it's a missing dependency error
    if (error.stderr && error.stderr.includes('ModuleNotFoundError')) {
      console.error('[Sync Worker] Python dependencies are missing!');
      console.error('[Sync Worker] This is expected if Python packages are not installed on the server.');
      console.error('[Sync Worker] Recommendation: Use webhooks as primary sync method (already configured).');
      console.error('[Sync Worker] To fix: Install Python packages or disable sync worker (SYNC_WORKER_ENABLED=false)');
    }
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
    console.log('[Sync Worker] Starting Meta sync...');
    
    const scriptPath = getScriptPath('meta_sync.py');
    
    if (!scriptPath) {
      console.warn('[Sync Worker] Meta sync script not found, skipping...');
      console.warn('[Sync Worker] Searched paths:', [
        path.join(process.cwd(), 'meta_sync.py'),
        path.join(process.cwd(), '..', 'meta_sync.py'),
        path.join(__dirname, '..', '..', 'meta_sync.py'),
        path.join(__dirname, '..', 'meta_sync.py'),
      ]);
      return;
    }

    console.log(`[Sync Worker] Found script at: ${scriptPath}`);
    console.log(`[Sync Worker] Executing: python ${scriptPath}`);

    const { stdout, stderr } = await execAsync(`python ${scriptPath} 2>&1`);
    
    if (stdout) {
      console.log('[Sync Worker] Meta sync output:', stdout);
    }
    if (stderr && !stdout) {
      console.error('[Sync Worker] Meta sync errors:', stderr);
    }
    
    console.log('[Sync Worker] ✓ Meta sync completed successfully');
  } catch (error: any) {
    console.error('[Sync Worker] ✗ Meta sync failed');
    console.error('[Sync Worker] Error details:', {
      message: error.message,
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr,
    });
    
    // Check if it's a missing dependency error
    if (error.stderr && error.stderr.includes('ModuleNotFoundError')) {
      console.error('[Sync Worker] Python dependencies are missing!');
      console.error('[Sync Worker] This is expected if Python packages are not installed on the server.');
      console.error('[Sync Worker] Recommendation: Use webhooks as primary sync method (already configured).');
      console.error('[Sync Worker] To fix: Install Python packages or disable sync worker (SYNC_WORKER_ENABLED=false)');
    }
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
  console.log('[Sync Worker] ==========================================');
  console.log('[Sync Worker] Starting sync worker initialization...');
  console.log('[Sync Worker] ==========================================');
  
  // Check if Python is available
  console.log('[Sync Worker] Step 1: Checking Python availability...');
  const pythonCheck = await checkPythonAvailable();
  if (!pythonCheck.available) {
    console.warn('[Sync Worker] ✗ Python not available - sync worker disabled');
    console.warn('[Sync Worker] Using webhooks as primary sync method (recommended)');
    console.warn('[Sync Worker] To enable sync worker, install Python on server');
    return;
  }
  console.log(`[Sync Worker] ✓ Python available: ${pythonCheck.version}`);

  // Check if Python dependencies are installed
  console.log('[Sync Worker] Step 2: Checking Python dependencies...');
  const depsCheck = await checkPythonDependencies();
  if (!depsCheck.installed) {
    console.error('[Sync Worker] ==========================================');
    console.error('[Sync Worker] ✗ Python dependencies missing!');
    console.error('[Sync Worker] Missing packages:', depsCheck.missing?.join(', '));
    console.error('[Sync Worker] ==========================================');
    console.error('[Sync Worker] Sync worker CANNOT run without Python packages.');
    console.error('[Sync Worker] Options:');
    console.error('[Sync Worker] 1. Disable sync worker: Set SYNC_WORKER_ENABLED=false (recommended)');
    console.error('[Sync Worker] 2. Install packages: pip install ' + depsCheck.missing?.join(' '));
    console.error('[Sync Worker] ==========================================');
    console.error('[Sync Worker] Using webhooks as primary sync method (already configured)');
    console.error('[Sync Worker] GitHub Actions as backup (1-minute sync)');
    console.error('[Sync Worker] ==========================================');
    // Don't continue - stop here to prevent repeated failures
    return;
  } else {
    console.log('[Sync Worker] ✓ All Python dependencies installed');
  }

  // Check if scripts exist
  console.log('[Sync Worker] Step 3: Checking for Python scripts...');
  const knowlarityScript = getScriptPath('knowlarity_sync.py');
  const metaScript = getScriptPath('meta_sync.py');
  
  if (knowlarityScript) {
    console.log(`[Sync Worker] ✓ Knowlarity script found: ${knowlarityScript}`);
  } else {
    console.warn('[Sync Worker] ✗ Knowlarity script not found');
  }
  
  if (metaScript) {
    console.log(`[Sync Worker] ✓ Meta script found: ${metaScript}`);
  } else {
    console.warn('[Sync Worker] ✗ Meta script not found');
  }
  
  if (!knowlarityScript && !metaScript) {
    console.warn('[Sync Worker] No Python scripts found - sync worker disabled');
    console.warn('[Sync Worker] Using webhooks as primary sync method (recommended)');
    return;
  }

  console.log('[Sync Worker] ==========================================');
  console.log('[Sync Worker] Sync worker configuration:');
  console.log('[Sync Worker] - Knowlarity: every 30 seconds' + (knowlarityScript ? ' ✓' : ' ✗ (script missing)'));
  console.log('[Sync Worker] - Meta: every 5 minutes' + (metaScript ? ' ✓' : ' ✗ (script missing)'));
  console.log('[Sync Worker] - Note: Webhooks are primary sync method, this is backup only');
  console.log('[Sync Worker] ==========================================');

  // Sync Knowlarity every 30 seconds (only if script exists)
  if (knowlarityScript) {
    setInterval(() => {
      syncKnowlarity().catch(err => {
        console.error('[Sync Worker] Unhandled error in Knowlarity sync:', err);
      });
    }, 30 * 1000); // 30 seconds

    // Run initial sync after 5 seconds (to let server fully start)
    setTimeout(() => {
      syncKnowlarity().catch(err => {
        console.error('[Sync Worker] Initial Knowlarity sync failed:', err);
      });
    }, 5 * 1000);
  } else {
    console.warn('[Sync Worker] Knowlarity script not found - skipping Knowlarity sync');
  }

  // Sync Meta every 5 minutes (only if script exists)
  if (metaScript) {
    setInterval(() => {
      syncMeta().catch(err => {
        console.error('[Sync Worker] Unhandled error in Meta sync:', err);
      });
    }, 5 * 60 * 1000); // 5 minutes

    // Run initial Meta sync after 15 seconds (to avoid overlap)
    setTimeout(() => {
      syncMeta().catch(err => {
        console.error('[Sync Worker] Initial Meta sync failed:', err);
      });
    }, 15 * 1000);
  } else {
    console.warn('[Sync Worker] Meta script not found - skipping Meta sync');
  }

  console.log('[Sync Worker] ==========================================');
  console.log('[Sync Worker] ✓ Sync worker started successfully');
  console.log('[Sync Worker] ==========================================');
}

