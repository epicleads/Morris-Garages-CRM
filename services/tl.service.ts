import { supabaseAdmin } from '../config/supabase';
import { SafeUser } from '../types/user';

export interface TlTeamMember {
  rm_member_id: number;
  rm_user_id: number;
  rm_name: string;
  branch_id: number;
  branch_name: string;
}

export interface TlTeamPerformance {
  rm_member_id: number;
  rm_user_id: number;
  rm_name: string;
  branch_id: number;
  branch_name: string;
  total_leads: number;
  pending_leads: number;
  qualified_leads: number;
  disqualified_leads: number;
  booking_pending: number;
  won_leads: number;
  lost_leads: number;
  today_followups: number;
  today_assigned: number;
  conversion_rate: number;
}

export interface TlDashboardData {
  teamMembers: TlTeamMember[];
  teamPerformance: TlTeamPerformance[];
  summary: {
    total_team_leads: number;
    total_pending: number;
    total_qualified: number;
    total_booking_pending: number;
    total_won: number;
    total_lost: number;
    total_today_followups: number;
    total_today_assigned: number;
    overall_conversion_rate: number;
  };
}

/**
 * Get all RMs that belong to the TL's team(s).
 * TL is identified by role='RM_TL' or 'TL' in branch_members.
 * Returns RMs in the same branch(es) where TL is assigned.
 */
const getTlTeamRms = async (user: SafeUser): Promise<TlTeamMember[]> => {
  // First, find the TL's branch_members records
  const { data: tlMembers, error: tlError } = await supabaseAdmin
    .from('branch_members')
    .select('id, branch_id, branches(name)')
    .eq('user_id', user.id)
    .in('role', ['RM_TL', 'TL'])
    .eq('is_active', true);

  if (tlError) {
    throw new Error(`Failed to fetch TL branch members: ${tlError.message}`);
  }

  if (!tlMembers || tlMembers.length === 0) {
    return [];
  }

  // Get branch IDs where TL is assigned
  const branchIds = tlMembers.map((m) => m.branch_id);

  // Find all RMs in those branches
  const { data: rmMembers, error: rmError } = await supabaseAdmin
    .from('branch_members')
    .select(
      `
      id,
      user_id,
      branch_id,
      branches(name),
      users(full_name, username)
    `
    )
    .in('branch_id', branchIds)
    .eq('role', 'RM')
    .eq('is_active', true);

  if (rmError) {
    throw new Error(`Failed to fetch team RMs: ${rmError.message}`);
  }

  // Map to team member structure
  const teamMembers: TlTeamMember[] = (rmMembers || []).map((rm: any) => ({
    rm_member_id: rm.id,
    rm_user_id: rm.user_id,
    rm_name: rm.users?.full_name || rm.users?.username || `User ${rm.user_id}`,
    branch_id: rm.branch_id,
    branch_name: rm.branches?.name || 'Unknown Branch',
  }));

  return teamMembers;
};

/**
 * Get TL dashboard data with team performance metrics.
 * Only shows data for RMs in the TL's team(s).
 */
export const getTlDashboard = async (user: SafeUser): Promise<TlDashboardData> => {
  if (user.role !== 'RM_TL' && !user.isDeveloper && user.role !== 'Admin') {
    throw new Error('Permission denied: Only RM_TL / Admin / Developer can access TL dashboard');
  }

  const teamMembers = await getTlTeamRms(user);

  if (teamMembers.length === 0) {
    return {
      teamMembers: [],
      teamPerformance: [],
      summary: {
        total_team_leads: 0,
        total_pending: 0,
        total_qualified: 0,
        total_booking_pending: 0,
        total_won: 0,
        total_lost: 0,
        total_today_followups: 0,
        total_today_assigned: 0,
        overall_conversion_rate: 0,
      },
    };
  }

  const rmMemberIds = teamMembers.map((m) => m.rm_member_id);

  // Get today's date range
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  // Fetch all qualifications for team RMs
  const { data: qualifications, error: qualError } = await supabaseAdmin
    .from('leads_qualification')
    .select(
      `
      id,
      lead_id,
      rm_id,
      branch_id,
      next_followup_at,
      BOOKED,
      RETAILED,
      leads_master (
        id,
        status,
        created_at,
        next_followup_at
      )
    `
    )
    .in('rm_id', rmMemberIds);

  if (qualError) {
    throw new Error(`Failed to fetch team qualifications: ${qualError.message}`);
  }

  // Calculate performance per RM
  const performanceMap = new Map<number, TlTeamPerformance>();

  // Initialize performance for each RM
  teamMembers.forEach((member) => {
    performanceMap.set(member.rm_member_id, {
      rm_member_id: member.rm_member_id,
      rm_user_id: member.rm_user_id,
      rm_name: member.rm_name,
      branch_id: member.branch_id,
      branch_name: member.branch_name,
      total_leads: 0,
      pending_leads: 0,
      qualified_leads: 0,
      disqualified_leads: 0,
      booking_pending: 0,
      won_leads: 0,
      lost_leads: 0,
      today_followups: 0,
      today_assigned: 0,
      conversion_rate: 0,
    });
  });

  // Aggregate metrics from qualifications
  (qualifications || []).forEach((qual: any) => {
    const lead = qual.leads_master;
    if (!lead) return;

    const perf = performanceMap.get(qual.rm_id);
    if (!perf) return;

    perf.total_leads++;

    // Status-based counts
    const status = lead.status?.toLowerCase() || '';
    if (status === 'pending' || qual.next_followup_at) {
      perf.pending_leads++;
    }
    if (status === 'qualified' || status === 'booked') {
      perf.qualified_leads++;
    }
    if (status === 'disqualified' || status === 'lost') {
      perf.disqualified_leads++;
    }
    if (qual.BOOKED && status === 'booked') {
      perf.booking_pending++;
    }
    if (status === 'won') {
      perf.won_leads++;
    }
    if (status === 'lost' || status === 'closed_due_to_sale_elsewhere') {
      perf.lost_leads++;
    }

    // Today's follow-ups
    if (qual.next_followup_at) {
      const followupDate = new Date(qual.next_followup_at);
      if (followupDate >= startOfToday && followupDate < endOfToday) {
        perf.today_followups++;
      }
    }

    // Today's assigned
    if (lead.created_at) {
      const createdDate = new Date(lead.created_at);
      if (createdDate >= startOfToday && createdDate < endOfToday) {
        perf.today_assigned++;
      }
    }
  });

  // Calculate conversion rates
  performanceMap.forEach((perf) => {
    if (perf.total_leads > 0) {
      perf.conversion_rate = (perf.won_leads / perf.total_leads) * 100;
    }
  });

  const teamPerformance = Array.from(performanceMap.values());

  // Calculate summary
  const summary = {
    total_team_leads: teamPerformance.reduce((sum, p) => sum + p.total_leads, 0),
    total_pending: teamPerformance.reduce((sum, p) => sum + p.pending_leads, 0),
    total_qualified: teamPerformance.reduce((sum, p) => sum + p.qualified_leads, 0),
    total_booking_pending: teamPerformance.reduce((sum, p) => sum + p.booking_pending, 0),
    total_won: teamPerformance.reduce((sum, p) => sum + p.won_leads, 0),
    total_lost: teamPerformance.reduce((sum, p) => sum + p.lost_leads, 0),
    total_today_followups: teamPerformance.reduce((sum, p) => sum + p.today_followups, 0),
    total_today_assigned: teamPerformance.reduce((sum, p) => sum + p.today_assigned, 0),
    overall_conversion_rate: 0,
  };

  if (summary.total_team_leads > 0) {
    summary.overall_conversion_rate = (summary.total_won / summary.total_team_leads) * 100;
  }

  return {
    teamMembers,
    teamPerformance,
    summary,
  };
};

/**
 * Get team leads for a specific RM (filtered by TL's team).
 */
export const getTlTeamLeads = async (
  user: SafeUser,
  filters?: {
    rmMemberId?: number;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }
) => {
  if (user.role !== 'RM_TL' && !user.isDeveloper && user.role !== 'Admin') {
    throw new Error('Permission denied: Only RM_TL / Admin / Developer can access team leads');
  }

  const teamMembers = await getTlTeamRms(user);
  if (teamMembers.length === 0) {
    return { leads: [], total: 0 };
  }

  const rmMemberIds = teamMembers.map((m) => m.rm_member_id);

  // If specific RM filter, ensure it's in the team
  if (filters?.rmMemberId) {
    if (!rmMemberIds.includes(filters.rmMemberId)) {
      throw new Error('Permission denied: RM not in your team');
    }
  }

  // Build query
  let qualQuery = supabaseAdmin
    .from('leads_qualification')
    .select(
      `
      id,
      lead_id,
      rm_id,
      branch_id,
      next_followup_at,
      BOOKED,
      RETAILED,
      leads_master (
        id,
        customer_id,
        full_name,
        phone_number_normalized,
        status,
        branch_id,
        source_id,
        created_at,
        next_followup_at,
        Lead_Remarks
      )
    `
    )
    .in('rm_id', filters?.rmMemberId ? [filters.rmMemberId] : rmMemberIds);

  if (filters?.status) {
    // Filter by lead status
    // Note: This is a simplified filter - you may need to adjust based on your status values
    qualQuery = qualQuery.eq('leads_master.status', filters.status);
  }

  const { data: qualifications, error } = await qualQuery;

  if (error) {
    throw new Error(`Failed to fetch team leads: ${error.message}`);
  }

  // Map to lead format
  const leads = (qualifications || [])
    .map((qual: any) => {
      const lead = qual.leads_master;
      if (!lead) return null;

      return {
        id: lead.id,
        customer_id: lead.customer_id,
        full_name: lead.full_name,
        phone_number_normalized: lead.phone_number_normalized,
        status: lead.status,
        branch_id: lead.branch_id,
        source_id: lead.source_id,
        created_at: lead.created_at,
        next_followup_at: qual.next_followup_at || lead.next_followup_at,
        rm_stage: null, // Could derive from qualification
        has_booking: qual.BOOKED || false,
        has_retail: qual.RETAILED || false,
        rm_member_id: qual.rm_id,
      };
    })
    .filter((l: any) => l !== null);

  return {
    leads,
    total: leads.length,
  };
};

