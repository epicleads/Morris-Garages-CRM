import { supabaseAdmin } from '../config/supabase';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface SystemLog {
  level: LogLevel;
  message: string;
  metadata?: Record<string, any>;
  user_id?: number;
}

/**
 * Write a system log to the database
 */
export async function writeSystemLog(log: SystemLog): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('system_logs').insert({
      level: log.level,
      message: log.message,
      metadata: log.metadata || null,
      user_id: log.user_id || null,
      created_at: new Date().toISOString(),
    });

    if (error) {
      // Don't throw - logging failures shouldn't break the app
      console.error('[Logging Service] Failed to write log:', error);
    }
  } catch (error) {
    // Silent fail - logging should never break the app
    console.error('[Logging Service] Error writing log:', error);
  }
}

/**
 * Get system logs with filters
 */
export async function getSystemLogs(options: {
  level?: LogLevel;
  userId?: number;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
}) {
  const {
    level,
    userId,
    limit = 100,
    offset = 0,
    startDate,
    endDate,
    search,
  } = options;

  let query = supabaseAdmin
    .from('system_logs')
    .select('*, users(user_id, full_name, username)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (level) {
    query = query.eq('level', level);
  }

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (startDate) {
    query = query.gte('created_at', startDate);
  }

  if (endDate) {
    query = query.lte('created_at', endDate);
  }

  if (search) {
    query = query.ilike('message', `%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch system logs: ${error.message}`);
  }

  return {
    logs: data || [],
    total: count || 0,
    limit,
    offset,
  };
}

/**
 * Get error logs only (for errors page)
 */
export async function getErrorLogs(options: {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
}) {
  return getSystemLogs({
    ...options,
    level: 'error',
  });
}

/**
 * Get log statistics
 */
export async function getLogStatistics(options: {
  startDate?: string;
  endDate?: string;
}) {
  const { startDate, endDate } = options;

  let query = supabaseAdmin
    .from('system_logs')
    .select('level, created_at');

  if (startDate) {
    query = query.gte('created_at', startDate);
  }

  if (endDate) {
    query = query.lte('created_at', endDate);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch log statistics: ${error.message}`);
  }

  const stats = {
    total: data?.length || 0,
    error: 0,
    warn: 0,
    info: 0,
    debug: 0,
    byHour: {} as Record<string, number>,
  };

  data?.forEach((log) => {
    stats[log.level as LogLevel]++;
    
    // Group by hour
    const hour = new Date(log.created_at).toISOString().slice(0, 13) + ':00:00';
    stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;
  });

  return stats;
}

/**
 * Get system health metrics
 */
export async function getSystemHealth() {
  // Get recent error count (last 24 hours)
  const yesterday = new Date();
  yesterday.setHours(yesterday.getHours() - 24);

  const { data: recentErrors, error: errorError } = await supabaseAdmin
    .from('system_logs')
    .select('id', { count: 'exact' })
    .eq('level', 'error')
    .gte('created_at', yesterday.toISOString());

  // Get total logs count
  const { data: totalLogs, error: totalError } = await supabaseAdmin
    .from('system_logs')
    .select('id', { count: 'exact' })
    .limit(1);

  // Get database connection status (simple query)
  let dbStatus = 'healthy';
  try {
    await supabaseAdmin.from('users').select('user_id').limit(1);
  } catch (error) {
    dbStatus = 'unhealthy';
  }

  return {
    database: dbStatus,
    recentErrors: recentErrors?.length || 0,
    totalLogs: totalLogs?.length || 0,
    timestamp: new Date().toISOString(),
  };
}

