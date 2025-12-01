import { supabaseAdmin } from '../config/supabase';

export interface AdminDashboardStats {
  totalCreUsers: number;
  unassignedLeads: number;
  activeAssignments: number;
  freshLeads: number;
  conversionRate: number;
  conversion_rate_percent_string: string;
}

export const getDashboardStats = async (): Promise<AdminDashboardStats> => {
  const [
    totalCreUsers,
    unassignedLeads,
    activeAssignments,
    freshLeads,
    totalLeads,
    qualifiedLeads
  ] = await Promise.all([
    // 1. Total CRE Users: WHERE role = 'CRE'
    supabaseAdmin
      .from('users')
      .select('user_id', { count: 'exact', head: true })
      .eq('role', 'CRE')
      .then(({ count }) => count ?? 0),

    // 2. Unassigned Leads: WHERE status = 'NEW' AND assigned_to IS NULL
    supabaseAdmin
      .from('leads_master')
      .select('id', { count: 'exact', head: true })
      .ilike('status', 'NEW') // Using ilike to be safe with casing
      .is('assigned_to', null)
      .then(({ count }) => count ?? 0),

    // 3. Active Assignments: WHERE status != 'New' AND "IS_LOST" IS NULL
    supabaseAdmin
      .from('leads_master')
      .select('id', { count: 'exact', head: true })
      .not('status', 'ilike', 'New')
      .is('IS_LOST', null)
      .then(({ count }) => count ?? 0),

    // 4. Fresh Leads: WHERE status = 'New' AND "IS_LOST" IS NULL
    supabaseAdmin
      .from('leads_master')
      .select('id', { count: 'exact', head: true })
      .ilike('status', 'New')
      .is('IS_LOST', null)
      .then(({ count }) => count ?? 0),

    // 5a. Total Leads (for conversion rate)
    supabaseAdmin
      .from('leads_master')
      .select('id', { count: 'exact', head: true })
      .then(({ count }) => count ?? 0),

    // 5b. Qualified Leads (for conversion rate): WHERE is_qualified = TRUE
    supabaseAdmin
      .from('leads_master')
      .select('id', { count: 'exact', head: true })
      .eq('is_qualified', true)
      .then(({ count }) => count ?? 0),
  ]);

  // Calculate Conversion Rate
  const conversionRate = totalLeads > 0
    ? parseFloat(((qualifiedLeads / totalLeads) * 100).toFixed(2))
    : 0;

  const conversion_rate_percent_string = `${conversionRate}%`;

  console.log('Admin Dashboard Stats Debug:', {
    totalCreUsers,
    unassignedLeads,
    activeAssignments,
    freshLeads,
    totalLeads,
    qualifiedLeads,
    conversionRate,
    conversion_rate_percent_string
  });

  return {
    totalCreUsers,
    unassignedLeads,
    activeAssignments,
    freshLeads,
    conversionRate,
    conversion_rate_percent_string
  };
};

export const assignLeadsToCre = async (leadIds: number[], creId: number) => {
  const { error } = await supabaseAdmin
    .from('leads_master')
    .update({
      assigned_to: creId,
      status: 'Assigned', // Update status to Assigned when assigning
      updated_at: new Date().toISOString()
    })
    .in('id', leadIds);

  if (error) {
    throw new Error(`Failed to assign leads: ${error.message}`);
  }

  return { success: true, count: leadIds.length };
};
