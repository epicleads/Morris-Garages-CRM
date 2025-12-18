import { supabaseAdmin } from '../config/supabase';
import { SafeUser } from '../types/user';

export interface ReceptionKpiStats {
  todayWalkIns: number;
  todayNewLeads: number;
  todayRepeatVisits: number;
  todayTestDrives: number;
}

export interface ReceptionRecentActivityItem {
  id: number;
  event: string;
  lead_id: number;
  customer_name: string | null;
  phone_number_normalized: string | null;
  branch_name: string | null;
  model: string | null;
  created_at: string;
  action: 'created_new_lead' | 'attached_to_existing';
}

export interface ReceptionDashboardResponse {
  stats: ReceptionKpiStats;
  recentActivity: ReceptionRecentActivityItem[];
}

export const getReceptionDashboard = async (user: SafeUser): Promise<ReceptionDashboardResponse> => {
  // Only Receptionist (or Admin/Developer for debugging) should hit this
  if (user.role !== 'Receptionist' && !user.isDeveloper && user.role !== 'Admin') {
    throw new Error('Permission denied: Only Receptionist / Admin / Developer can view this dashboard');
  }

  // Define today range in UTC
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  // Resolve branch for Receptionist so that dashboard is branch-scoped
  // (If Admin/Developer is calling this for debugging, we don't scope by branch)
  let receptionistBranchId: number | null = null;
  if (user.role === 'Receptionist') {
    const { data: branchMember, error: branchError } = await supabaseAdmin
      .from('branch_members')
      .select('branch_id')
      .eq('role', 'Receptionist')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (branchError) {
      throw new Error(`Failed to resolve receptionist branch: ${branchError.message}`);
    }

    receptionistBranchId = branchMember?.branch_id ?? null;
  }

  // 1. Fetch all walk-in related logs created by this receptionist today,
  //    scoped to her current branch (if known)
  let logsQuery = supabaseAdmin
    .from('leads_logs')
    .select(
      `
      id,
      lead_id,
      old_status,
      new_status,
      remarks,
      metadata,
      created_by,
      created_at,
      leads_master (
        id,
        full_name,
        phone_number_normalized,
        branch_id,
        branches ( name )
      )
    `
    )
    .eq('created_by', user.id)
    .gte('created_at', startOfDay.toISOString())
    .lt('created_at', endOfDay.toISOString());

  if (receptionistBranchId) {
    // Only include leads belonging to the receptionist's branch
    logsQuery = logsQuery.eq('leads_master.branch_id', receptionistBranchId);
  }

  const { data: logs, error: logsError } = await logsQuery.order('created_at', { ascending: false });

  if (logsError) {
    throw new Error(`Failed to fetch receptionist activity logs: ${logsError.message}`);
  }

  let todayWalkIns = 0;
  let todayNewLeads = 0;
  let todayRepeatVisits = 0;
  let todayTestDrives = 0;

  const recentActivity: ReceptionRecentActivityItem[] = [];

  (logs || []).forEach((log: any) => {
    const meta = (log.metadata || {}) as Record<string, any>;
    const event = (meta.event as string) || 'unknown';

    if (event === 'walk_in_created' || event === 'walk_in_again') {
      todayWalkIns++;
      if (event === 'walk_in_created') {
        todayNewLeads++;
      } else if (event === 'walk_in_again') {
        todayRepeatVisits++;
      }

      recentActivity.push({
        id: log.id,
        event,
        lead_id: log.lead_id,
        customer_name: log.leads_master?.full_name || null,
        phone_number_normalized: log.leads_master?.phone_number_normalized || null,
        branch_name: log.leads_master?.branches?.name || null,
        model: (meta.model as string) || null,
        created_at: log.created_at,
        action: event === 'walk_in_created' ? 'created_new_lead' : 'attached_to_existing',
      });
    }

    if (event === 'test_drive_booked') {
      todayTestDrives++;
    }
  });

  return {
    stats: {
      todayWalkIns,
      todayNewLeads,
      todayRepeatVisits,
      todayTestDrives,
    },
    recentActivity,
  };
};


