import { cleanupOldTickets } from './support.service';
import { writeSystemLog } from './logging.service';

/**
 * Run cleanup job for old support tickets (older than 90 days)
 * This should be called via cron job or scheduled task
 */
export async function runTicketCleanup(): Promise<void> {
  try {
    const deletedCount = await cleanupOldTickets();
    
    await writeSystemLog({
      level: 'info',
      message: `Ticket cleanup completed: Deleted ${deletedCount} old tickets`,
      metadata: {
        deletedCount,
        cleanupDate: new Date().toISOString(),
      },
    });

    console.log(`[Cleanup] Deleted ${deletedCount} tickets older than 90 days`);
  } catch (error: any) {
    await writeSystemLog({
      level: 'error',
      message: `Ticket cleanup failed: ${error.message}`,
      metadata: {
        error: error.message,
        cleanupDate: new Date().toISOString(),
      },
    });

    console.error('[Cleanup] Failed to cleanup old tickets:', error);
    throw error;
  }
}

/**
 * Start cleanup scheduler (runs daily at 2 AM)
 */
export function startCleanupScheduler(): void {
  // Run cleanup immediately on startup (optional)
  // runTicketCleanup().catch(console.error);

  // Schedule daily cleanup at 2 AM
  const scheduleCleanup = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 0, 0, 0); // 2 AM

    const msUntilCleanup = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      runTicketCleanup().catch(console.error);
      
      // Schedule next cleanup (24 hours later)
      setInterval(() => {
        runTicketCleanup().catch(console.error);
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilCleanup);

    console.log(`[Cleanup] Scheduled next cleanup at ${tomorrow.toISOString()}`);
  };

  scheduleCleanup();
}

