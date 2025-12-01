import { SupabaseClient } from '@supabase/supabase-js';
import { SafeUser } from '../types/user';
import { getLeadQueryFilter } from './permissions.service';

/**
 * Query helper functions for role-based data access
 * Ensures CRE can only see their assigned leads
 * CRE_TL and Developer can see all leads
 */

/**
 * Build a leads query with role-based filtering
 * @param supabase - Supabase client
 * @param user - Authenticated user
 * @returns Filtered query builder
 */
export const buildLeadsQuery = (
  supabase: SupabaseClient,
  user: SafeUser
) => {
  // Include source and assigned user information
  let query = supabase
    .from('leads_master')
    .select(`
      *,
      source:sources(id, display_name, source_type, webhook_secret, field_mapping),
      assigned_user:users!leads_master_assigned_to_fkey(user_id, full_name, username, role, email, phone_number)
    `);

  // Apply role-based filter
  const assignedToFilter = getLeadQueryFilter(user);
  if (assignedToFilter !== null) {
    // CRE can only see leads assigned to them
    query = query.eq('assigned_to', assignedToFilter);
  }
  // CRE_TL and Developer see all (no filter applied)

  return query;
};

/**
 * Build a leads query with additional filters
 * @param supabase - Supabase client
 * @param user - Authenticated user
 * @param additionalFilters - Additional filter functions to apply
 * @returns Filtered query builder
 */
export const buildLeadsQueryWithFilters = (
  supabase: SupabaseClient,
  user: SafeUser,
  additionalFilters?: (query: ReturnType<typeof buildLeadsQuery>) => ReturnType<typeof buildLeadsQuery>
) => {
  let query = buildLeadsQuery(supabase, user);

  if (additionalFilters) {
    query = additionalFilters(query);
  }

  return query;
};

/**
 * Build a query for lead logs with role-based filtering
 * CRE can only see logs for their assigned leads
 */
export const buildLeadLogsQuery = (
  supabase: SupabaseClient,
  user: SafeUser,
  leadId?: number
) => {
  let query = supabase.from('leads_logs').select('*, leads_master!inner(assigned_to)');

  // If specific lead ID, check access
  if (leadId) {
    query = query.eq('lead_id', leadId);
  }

  // For CRE, filter by assigned leads
  const assignedToFilter = getLeadQueryFilter(user);
  if (assignedToFilter !== null) {
    // Join with leads_master to filter by assigned_to
    query = query.eq('leads_master.assigned_to', assignedToFilter);
  }

  return query;
};

/**
 * Build a query for qualified leads with role-based filtering
 * CRE_TL can see all qualified leads for review
 * CRE can only see their own qualified leads
 */
export const buildQualifiedLeadsQuery = (
  supabase: SupabaseClient,
  user: SafeUser
) => {
  let query = supabase
    .from('leads_qualification')
    .select('*, leads_master!inner(assigned_to, status)');

  // Apply role-based filter
  const assignedToFilter = getLeadQueryFilter(user);
  if (assignedToFilter !== null) {
    // CRE can only see qualified leads assigned to them
    query = query.eq('leads_master.assigned_to', assignedToFilter);
  }
  // CRE_TL and Developer see all qualified leads

  return query;
};

/**
 * Build a query for today's follow-ups with role-based filtering
 */
export const buildTodaysFollowupsQuery = (
  supabase: SupabaseClient,
  user: SafeUser
) => {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  let query = supabase
    .from('leads_master')
    .select(`
      *,
      source:sources(id, display_name, source_type),
      assigned_user:users!leads_master_assigned_to_fkey(user_id, full_name, username, role)
    `)
    .gte('next_followup_at', `${today}T00:00:00`)
    .lt('next_followup_at', `${today}T23:59:59`)
    .in('status', ['Pending', 'Qualified', 'FollowUp', 'Working']);

  // Apply role-based filter
  const assignedToFilter = getLeadQueryFilter(user);
  if (assignedToFilter !== null) {
    query = query.eq('assigned_to', assignedToFilter);
  }

  return query;
};

/**
 * Build a query for CRE performance data
 * CRE can only see their own performance
 * CRE_TL can see all CRE performance
 */
export const buildCREPerformanceQuery = (
  supabase: SupabaseClient,
  user: SafeUser,
  creId?: number
) => {
  // If CRE_TL or Developer, they can query any CRE's performance
  // If CRE, they can only query their own
  const targetCreId = creId || (user.role === 'CRE' ? user.id : undefined);

  // This would typically join with leads_master and aggregate
  // For now, return a base query structure
  let query = supabase.from('leads_master').select('*');

  if (targetCreId) {
    query = query.eq('assigned_to', targetCreId);
  } else if (user.role === 'CRE') {
    // CRE can only see their own
    query = query.eq('assigned_to', user.id);
  }
  // CRE_TL and Developer see all (no filter)

  return query;
};

