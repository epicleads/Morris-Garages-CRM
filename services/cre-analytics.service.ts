import { supabaseAdmin } from '../config/supabase';
import { DateRange, getDateRangeFilter } from './analytics.service';

export interface CrePerformanceMetrics {
  creId: number;
  creName: string;
  // Lead counts
  totalLeadsAssigned: number;
  totalLeadsAttended: number; // Leads with at least one call
  // Call statistics
  totalCallsMade: number;
  callsPerDay: number;
  averageCallsPerLead: number;
  // Conversion metrics
  qualifiedLeads: number;
  wonLeads: number;
  lostLeads: number;
  disqualifiedLeads: number;
  // Ratios
  qualificationRate: number; // (qualified / assigned) * 100
  conversionRate: number; // (won / qualified) * 100
  overallConversionRate: number; // (won / assigned) * 100
  // Efficiency metrics
  averageResponseTime: number; // Minutes from assignment to first call
  averageTimeBetweenCalls: number; // Minutes between calls
  fastestResponseTime: number; // Fastest time to first call (minutes)
  slowestResponseTime: number; // Slowest time to first call (minutes)
  // Activity
  activeDays: number; // Days with at least one call
  lastActivityDate: string | null;
  // Date range
  dateRange: DateRange;
}

export interface CreLeaderboardEntry {
  creId: number;
  creName: string;
  totalLeadsAssigned: number;
  totalCallsMade: number;
  qualifiedLeads: number;
  wonLeads: number;
  qualificationRate: number;
  conversionRate: number;
  overallConversionRate: number;
  averageResponseTime: number;
  callsPerDay: number;
  efficiencyScore: number; // Calculated score based on multiple factors
  rank: number;
}

/**
 * Get CRE performance metrics for a specific CRE
 */
export async function getCrePerformanceMetrics(
  creId: number,
  dateRange: DateRange
): Promise<CrePerformanceMetrics> {
  const { startDate, endDate } = getDateRangeFilter(dateRange);

  // Get CRE user info
  const { data: creUser, error: userError } = await supabaseAdmin
    .from('users')
    .select('user_id, full_name, username')
    .eq('user_id', creId)
    .eq('role', 'CRE')
    .single();

  if (userError || !creUser) {
    throw new Error(`CRE not found: ${userError?.message || 'User does not exist'}`);
  }

  // Build date filter for queries
  let leadsQuery = supabaseAdmin
    .from('leads_master')
    .select('id, assigned_to, status, is_qualified, IS_LOST, created_at, updated_at')
    .eq('assigned_to', creId);

  let logsQuery = supabaseAdmin
    .from('leads_logs')
    .select('id, lead_id, created_at, created_by, attempt_no')
    .eq('created_by', creId);

  if (startDate) {
    leadsQuery = leadsQuery.gte('created_at', startDate.toISOString());
    logsQuery = logsQuery.gte('created_at', startDate.toISOString());
  }
  if (endDate) {
    leadsQuery = leadsQuery.lte('created_at', endDate.toISOString());
    logsQuery = logsQuery.lte('created_at', endDate.toISOString());
  }

  // Build qualified query
  let qualifiedQuery = supabaseAdmin
    .from('leads_master')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', creId)
    .eq('is_qualified', true);
  if (startDate) qualifiedQuery = qualifiedQuery.gte('created_at', startDate.toISOString());
  if (endDate) qualifiedQuery = qualifiedQuery.lte('created_at', endDate.toISOString());

  // Build lost query
  let lostQuery = supabaseAdmin
    .from('leads_master')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', creId)
    .eq('IS_LOST', true);
  if (startDate) lostQuery = lostQuery.gte('created_at', startDate.toISOString());
  if (endDate) lostQuery = lostQuery.lte('created_at', endDate.toISOString());

  // Build disqualified query
  let disqualifiedQuery = supabaseAdmin
    .from('leads_master')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', creId)
    .eq('status', 'Disqualified');
  if (startDate) disqualifiedQuery = disqualifiedQuery.gte('created_at', startDate.toISOString());
  if (endDate) disqualifiedQuery = disqualifiedQuery.lte('created_at', endDate.toISOString());

  // Build won query (RETAILED = true)
  let wonQuery = supabaseAdmin
    .from('leads_qualification')
    .select('lead_id, leads_master!inner(id, created_at)')
    .eq('cre_id', creId)
    .eq('RETAILED', true);
  if (startDate) wonQuery = wonQuery.gte('leads_master.created_at', startDate.toISOString());
  if (endDate) wonQuery = wonQuery.lte('leads_master.created_at', endDate.toISOString());

  // Fetch all data
  const [leadsResult, logsResult, qualifiedResult, wonResult, lostResult, disqualifiedResult] = await Promise.all([
    leadsQuery,
    logsQuery,
    qualifiedQuery,
    wonQuery,
    lostQuery,
    disqualifiedQuery,
  ]);

  if (leadsResult.error) {
    throw new Error(`Failed to fetch leads: ${leadsResult.error.message}`);
  }
  if (logsResult.error) {
    throw new Error(`Failed to fetch logs: ${logsResult.error.message}`);
  }

  const leads = leadsResult.data || [];
  const logs = logsResult.data || [];
  const qualifiedCount = qualifiedResult.count || 0;
  const lostCount = lostResult.count || 0;
  const disqualifiedCount = disqualifiedResult.count || 0;

  // Calculate won leads (RETAILED = true)
  const wonCount = wonResult.data ? (wonResult.data as any[]).length : 0;

  // Calculate metrics
  const totalLeadsAssigned = leads.length;
  const totalCallsMade = logs.length;

  // Leads with at least one call (attended)
  const leadIdsWithCalls = new Set(logs.map((log) => log.lead_id));
  const totalLeadsAttended = leadIdsWithCalls.size;

  // Calculate calls per day
  const daysInRange = startDate && endDate
    ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    : dateRange.type === 'today' ? 1
    : dateRange.type === 'mtd' ? new Date().getDate()
    : dateRange.type === 'ytd' ? Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24))
    : 30; // Default to 30 days for 'all'
  const callsPerDay = daysInRange > 0 ? totalCallsMade / daysInRange : 0;

  // Average calls per lead
  const averageCallsPerLead = totalLeadsAttended > 0 ? totalCallsMade / totalLeadsAttended : 0;

  // Calculate response times (time from lead assignment to first call)
  const responseTimes: number[] = [];
  const timeBetweenCalls: number[] = [];

  for (const lead of leads) {
    const leadLogs = logs.filter((log) => log.lead_id === lead.id).sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateA - dateB;
    });

    if (leadLogs.length > 0) {
      const firstCallTime = new Date(leadLogs[0].created_at).getTime();
      const assignmentTime = new Date(lead.created_at).getTime();
      const responseTime = (firstCallTime - assignmentTime) / (1000 * 60); // Minutes
      if (responseTime >= 0) {
        responseTimes.push(responseTime);
      }

      // Calculate time between calls
      for (let i = 1; i < leadLogs.length; i++) {
        const prevCallTime = new Date(leadLogs[i - 1].created_at).getTime();
        const currentCallTime = new Date(leadLogs[i].created_at).getTime();
        const timeDiff = (currentCallTime - prevCallTime) / (1000 * 60); // Minutes
        if (timeDiff >= 0) {
          timeBetweenCalls.push(timeDiff);
        }
      }
    }
  }

  const averageResponseTime = responseTimes.length > 0
    ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
    : 0;

  const averageTimeBetweenCalls = timeBetweenCalls.length > 0
    ? timeBetweenCalls.reduce((sum, time) => sum + time, 0) / timeBetweenCalls.length
    : 0;

  const fastestResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
  const slowestResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;

  // Calculate active days (days with at least one call)
  const activeDaysSet = new Set<string>();
  logs.forEach((log) => {
    const date = new Date(log.created_at);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    activeDaysSet.add(dateStr);
  });
  const activeDays = activeDaysSet.size;

  // Get last activity date
  const sortedLogs = [...logs].sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const lastActivityDate = sortedLogs.length > 0 ? sortedLogs[0].created_at : null;

  // Calculate ratios
  const qualificationRate = totalLeadsAssigned > 0 ? (qualifiedCount / totalLeadsAssigned) * 100 : 0;
  const conversionRate = qualifiedCount > 0 ? (wonCount / qualifiedCount) * 100 : 0;
  const overallConversionRate = totalLeadsAssigned > 0 ? (wonCount / totalLeadsAssigned) * 100 : 0;

  return {
    creId: creUser.user_id,
    creName: creUser.full_name || creUser.username,
    totalLeadsAssigned,
    totalLeadsAttended,
    totalCallsMade,
    callsPerDay: Math.round(callsPerDay * 100) / 100,
    averageCallsPerLead: Math.round(averageCallsPerLead * 100) / 100,
    qualifiedLeads: qualifiedCount,
    wonLeads: wonCount,
    lostLeads: lostCount,
    disqualifiedLeads: disqualifiedCount,
    qualificationRate: Math.round(qualificationRate * 100) / 100,
    conversionRate: Math.round(conversionRate * 100) / 100,
    overallConversionRate: Math.round(overallConversionRate * 100) / 100,
    averageResponseTime: Math.round(averageResponseTime * 100) / 100,
    averageTimeBetweenCalls: Math.round(averageTimeBetweenCalls * 100) / 100,
    fastestResponseTime: Math.round(fastestResponseTime * 100) / 100,
    slowestResponseTime: Math.round(slowestResponseTime * 100) / 100,
    activeDays,
    lastActivityDate,
    dateRange,
  };
}

/**
 * Get CRE leaderboard (all CREs ranked by performance)
 */
export async function getCreLeaderboard(
  dateRange: DateRange,
  limit: number = 50
): Promise<CreLeaderboardEntry[]> {
  const { startDate, endDate } = getDateRangeFilter(dateRange);

  // Get all active CRE users
  const { data: creUsers, error: usersError } = await supabaseAdmin
    .from('users')
    .select('user_id, full_name, username')
    .eq('role', 'CRE')
    .eq('status', true);

  if (usersError) {
    throw new Error(`Failed to fetch CRE users: ${usersError.message}`);
  }

  if (!creUsers || creUsers.length === 0) {
    return [];
  }

  // Get metrics for each CRE
  const leaderboardPromises = creUsers.map(async (cre) => {
    try {
      const metrics = await getCrePerformanceMetrics(cre.user_id, dateRange);
      
      // Calculate efficiency score (weighted combination of metrics)
      // Higher score = better performance
      const efficiencyScore = 
        (metrics.qualificationRate * 0.3) +
        (metrics.conversionRate * 0.3) +
        (metrics.overallConversionRate * 0.2) +
        (metrics.callsPerDay * 2) + // Calls per day is important
        (metrics.totalLeadsAttended > 0 ? (metrics.totalLeadsAttended / metrics.totalLeadsAssigned) * 100 * 0.1 : 0) +
        (metrics.averageResponseTime > 0 ? Math.max(0, 100 - (metrics.averageResponseTime / 60)) * 0.1 : 0); // Faster response = higher score

      return {
        creId: metrics.creId,
        creName: metrics.creName,
        totalLeadsAssigned: metrics.totalLeadsAssigned,
        totalCallsMade: metrics.totalCallsMade,
        qualifiedLeads: metrics.qualifiedLeads,
        wonLeads: metrics.wonLeads,
        qualificationRate: metrics.qualificationRate,
        conversionRate: metrics.conversionRate,
        overallConversionRate: metrics.overallConversionRate,
        averageResponseTime: metrics.averageResponseTime,
        callsPerDay: metrics.callsPerDay,
        efficiencyScore: Math.round(efficiencyScore * 100) / 100,
        rank: 0, // Will be set after sorting
      };
    } catch (error) {
      // If error fetching metrics, return zero metrics
      return {
        creId: cre.user_id,
        creName: cre.full_name || cre.username,
        totalLeadsAssigned: 0,
        totalCallsMade: 0,
        qualifiedLeads: 0,
        wonLeads: 0,
        qualificationRate: 0,
        conversionRate: 0,
        overallConversionRate: 0,
        averageResponseTime: 0,
        callsPerDay: 0,
        efficiencyScore: 0,
        rank: 0,
      };
    }
  });

  const leaderboard = await Promise.all(leaderboardPromises);

  // Sort by efficiency score (descending)
  leaderboard.sort((a, b) => b.efficiencyScore - a.efficiencyScore);

  // Assign ranks
  leaderboard.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  // Return top N
  return leaderboard.slice(0, limit);
}

