import { supabaseAdmin } from '../config/supabase';
import { SafeUser } from '../types/user';
import { canAccessLead } from './permissions.service';

export interface CreDashboardSummary {
  pending: number;
  qualified: number;
  disqualified: number;
  lost: number;
}

export interface UpdateLeadQualificationInput {
  qualifiedCategory: string; // Required - derived from lead_category or status
  modelInterested?: string | null;
  variant?: string | null;
  profession?: string | null;
  customerLocation?: string | null;
  purchaseTimeline?: string | null;
  financeType?: string | null;
  testdriveDate?: string | null; // YYYY-MM-DD format
  exchangeVehicleMake?: string | null;
  exchangeVehicleModel?: string | null;
  exchangeVehicleYear?: number | null;
  leadCategory?: string | null;
  nextFollowupAt: string; // Required - ISO datetime
  remarks?: string | null;
}

const buildBaseQuery = (userId: number) =>
  supabaseAdmin.from('leads_master').select('id', { count: 'exact', head: true }).eq('assigned_to', userId);

const runCountQuery = async (
  userId: number,
  applyFilters: (query: ReturnType<typeof buildBaseQuery>) => ReturnType<typeof buildBaseQuery>
): Promise<number> => {
  const { count, error } = await applyFilters(buildBaseQuery(userId));
  if (error) {
    throw new Error(`Failed to load CRE dashboard summary: ${error.message}`);
  }
  return count ?? 0;
};

export const getCreDashboardSummary = async (userId: number): Promise<CreDashboardSummary> => {
  const [pending, qualified, disqualified, lost] = await Promise.all([
    runCountQuery(userId, (query) => query.eq('is_qualified', false).eq('status', 'New')),
    runCountQuery(userId, (query) => query.eq('is_qualified', true)),
    runCountQuery(userId, (query) => query.eq('is_qualified', false).eq('status', 'Disqualified')),
    runCountQuery(userId, (query) => query.eq('IS_LOST', true)),
  ]);

  return {
    pending,
    qualified,
    disqualified,
    lost,
  };
};

/**
 * Update or create lead qualification for CRE users
 * This function upserts into leads_qualification and sets is_qualified = true in leads_master
 */
export const updateLeadQualification = async (
  user: SafeUser,
  leadId: number,
  input: UpdateLeadQualificationInput
) => {
  // Validate required fields
  if (!input.qualifiedCategory || input.qualifiedCategory.trim() === '') {
    throw new Error('qualifiedCategory is required');
  }

  if (!input.nextFollowupAt) {
    throw new Error('nextFollowupAt is required');
  }

  // Validate nextFollowupAt is a valid date
  const followupDate = new Date(input.nextFollowupAt);
  if (isNaN(followupDate.getTime())) {
    throw new Error('nextFollowupAt must be a valid date');
  }

  // Verify lead exists and user has access
  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads_master')
    .select('id, assigned_to, is_qualified, status')
    .eq('id', leadId)
    .single();

  if (leadError || !lead) {
    throw new Error(`Lead not found: ${leadError?.message || 'Lead does not exist'}`);
  }

  // Check if user has access to this lead
  if (!canAccessLead(user, lead.assigned_to)) {
    throw new Error('You do not have permission to update this lead');
  }

  // Check if qualification already exists for this lead
  const { data: existingQual, error: qualCheckError } = await supabaseAdmin
    .from('leads_qualification')
    .select('id')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (qualCheckError) {
    throw new Error(`Failed to check qualification: ${qualCheckError.message}`);
  }

  // Base qualification data (without qualified_by, which is set conditionally)
  const qualificationData = {
    lead_id: leadId,
    qualified_category: input.qualifiedCategory,
    model_interested: input.modelInterested || null,
    variant: input.variant || null,
    profession: input.profession || null,
    customer_location: input.customerLocation || null,
    purchase_timeline: input.purchaseTimeline || null,
    finance_type: input.financeType || null,
    testdrive_date: input.testdriveDate || null,
    exchange_vehicle_make: input.exchangeVehicleMake || null,
    exchange_vehicle_model: input.exchangeVehicleModel || null,
    exchange_vehicle_year: input.exchangeVehicleYear || null,
    lead_category: input.leadCategory || null,
    next_followup_at: input.nextFollowupAt,
    remarks: input.remarks || null,
    updated_at: new Date().toISOString(),
  };

  let qualification;

  if (existingQual) {
    // Update existing qualification - preserve qualified_by and qualified_at
    const { data: updatedQual, error: updateError } = await supabaseAdmin
      .from('leads_qualification')
      .update(qualificationData)
      .eq('id', existingQual.id)
      .eq('lead_id', leadId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update qualification: ${updateError.message}`);
    }

    qualification = updatedQual;
  } else {
    // Insert new qualification - set qualified_by and qualified_at for first time
    const { data: newQual, error: insertError } = await supabaseAdmin
      .from('leads_qualification')
      .insert({
        ...qualificationData,
        qualified_by: user.id,
        qualified_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create qualification: ${insertError.message}`);
    }

    qualification = newQual;
  }

  // Update leads_master: set is_qualified = true and update next_followup_at
  const { error: updateLeadError } = await supabaseAdmin
    .from('leads_master')
    .update({
      is_qualified: true,
      status: 'Pending', // Set status to 'pending' when qualified
      next_followup_at: input.nextFollowupAt,
      Lead_Remarks: input.remarks || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  if (updateLeadError) {
    throw new Error(`Failed to update lead: ${updateLeadError.message}`);
  }

  // Create lead log entry for history/audit
  await supabaseAdmin.from('leads_logs').insert({
    lead_id: leadId,
    old_status: lead.status,
    new_status: lead.is_qualified ? lead.status : 'Qualified', // Only change status if not already qualified
    remarks: input.remarks || 'Lead qualification updated',
    created_by: user.id,
    metadata: {
      action: existingQual ? 'qualification_updated' : 'lead_qualified',
      qualifiedCategory: input.qualifiedCategory,
      nextFollowupAt: input.nextFollowupAt,
    },
  });

  return qualification;
};

/**
 * Mark lead as unqualified (lost)
 */
export interface MarkUnqualifiedInput {
  lead_id: number;
  status: string; // Lost reason (e.g., "Lost - Price Concern")
  remarks?: string | null;
}

export const markLeadUnqualified = async (
  userId: number,
  input: MarkUnqualifiedInput
) => {
  const { lead_id, status, remarks } = input;

  // Verify lead exists and user has access
  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads_master')
    .select('id, assigned_to, status')
    .eq('id', lead_id)
    .single();

  if (leadError || !lead) {
    throw new Error(`Lead not found: ${leadError?.message || 'Lead does not exist'}`);
  }

  if (lead.assigned_to !== userId) {
    throw new Error('Unauthorized: You do not have access to this lead');
  }

  // Update lead: set status, IS_LOST = TRUE, Lead_Remarks, preserve is_qualified (don't set it)
  const { error: updateError } = await supabaseAdmin
    .from('leads_master')
    .update({
      status: status,
      IS_LOST: true,
      Lead_Remarks: remarks || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead_id);

  if (updateError) {
    throw new Error(`Failed to mark lead as unqualified: ${updateError.message}`);
  }

  // Create lead log entry
  await supabaseAdmin.from('leads_logs').insert({
    lead_id: lead_id,
    old_status: lead.status,
    new_status: status,
    remarks: remarks || `Lead marked as unqualified: ${status}`,
    created_by: userId,
    metadata: {
      action: 'lead_unqualified',
      reason: status,
    },
  });

  return { success: true, lead_id };
};

/**
 * Mark lead as pending
 */
export interface MarkPendingInput {
  lead_id: number;
  next_followup_at: string;
  remarks?: string | null;
}

export const markLeadPending = async (
  userId: number,
  input: MarkPendingInput
) => {
  const { lead_id, next_followup_at, remarks } = input;

  // Validate next_followup_at is a valid date
  const followupDate = new Date(next_followup_at);
  if (isNaN(followupDate.getTime())) {
    throw new Error('next_followup_at must be a valid date');
  }

  // Verify lead exists and user has access
  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads_master')
    .select('id, assigned_to, status, total_attempts, Lead_Remarks')
    .eq('id', lead_id)
    .single();

  if (leadError || !lead) {
    throw new Error(`Lead not found: ${leadError?.message || 'Lead does not exist'}`);
  }

  if (lead.assigned_to !== userId) {
    throw new Error('Unauthorized: You do not have access to this lead');
  }

  // Increment attempt count if needed (if status is changing to pending)
  const newAttemptCount = lead.total_attempts ? lead.total_attempts + 1 : 1;

  // Update lead: set status = 'pending', next_followup_at, increment attempts, update remarks
  const { error: updateError } = await supabaseAdmin
    .from('leads_master')
    .update({
      status: 'Pending',
      next_followup_at: next_followup_at,
      total_attempts: newAttemptCount,
      Lead_Remarks: remarks || lead.Lead_Remarks || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead_id);

  if (updateError) {
    throw new Error(`Failed to mark lead as pending: ${updateError.message}`);
  }

  // Create lead log entry
  await supabaseAdmin.from('leads_logs').insert({
    lead_id: lead_id,
    old_status: lead.status,
    new_status: 'Pending',
    remarks: remarks || `Lead set to pending, next follow-up: ${next_followup_at}`,
    created_by: userId,
    metadata: {
      action: 'lead_pending',
      next_followup_at: next_followup_at,
      attempt_count: newAttemptCount,
    },
  });

  return { success: true, lead_id, attempt_count: newAttemptCount };
};

/**
 * Get filtered leads for CRE workspace
 * All queries are scoped to assigned_to = userId
 */
export interface FilteredLeadsOptions {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}

export interface FilteredLeadsResponse {
  leads: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Get Fresh Leads - Untouched (status = 'New' AND is_qualified = FALSE AND "IS_LOST" IS NULL)
 */
export const getFreshUntouchedLeads = async (
  userId: number,
  options?: FilteredLeadsOptions
): Promise<FilteredLeadsResponse> => {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 50;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('leads_master')
    .select(`
      *,
      source:sources(id, display_name, source_type)
    `, { count: 'exact' })
    .eq('assigned_to', userId)
    .eq('status', 'New')
    .eq('is_qualified', false)
    .order('created_at', { ascending: false });

  if (options?.startDate) {
    query = query.gte('created_at', options.startDate);
  }

  if (options?.endDate) {
    query = query.lte('created_at', options.endDate);
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch fresh untouched leads: ${error.message}`);
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);

  return {
    leads: data || [],
    total,
    page,
    limit,
    totalPages,
  };
};

/**
 * Get Fresh Leads - Called (status != 'New' AND is_qualified = FALSE AND "IS_LOST" IS NULL)
 */
export const getFreshCalledLeads = async (
  userId: number,
  options?: FilteredLeadsOptions
): Promise<FilteredLeadsResponse> => {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 50;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('leads_master')
    .select(`
      *,
      source:sources(id, display_name, source_type)
    `, { count: 'exact' })
    .eq('assigned_to', userId)
    .neq('status', 'New')
    .eq('is_qualified', false)
    .is('IS_LOST', null)
    .order('updated_at', { ascending: false });

  if (options?.startDate) {
    query = query.gte('created_at', options.startDate);
  }

  if (options?.endDate) {
    query = query.lte('created_at', options.endDate);
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch fresh called leads: ${error.message}`);
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);

  return {
    leads: data || [],
    total,
    page,
    limit,
    totalPages,
  };
};

/**
 * Get Today's Follow-ups (DATE(next_followup_at) = CURRENT_DATE AND "IS_LOST" IS NULL)
 */
export const getTodaysFollowupsLeads = async (
  userId: number,
  options?: FilteredLeadsOptions
): Promise<FilteredLeadsResponse> => {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 50;
  const offset = (page - 1) * limit;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayEnd = tomorrow.toISOString();

  // Query 1: Leads from leads_master
  const { data: masterIds, error: masterError } = await supabaseAdmin
    .from('leads_master')
    .select('id')
    .eq('assigned_to', userId)
    .neq('status', 'New')
    .gte('next_followup_at', todayStart)
    .lt('next_followup_at', todayEnd)
    .is('IS_LOST', null);

  if (masterError) {
    throw new Error(`Failed to fetch master follow-ups: ${masterError.message}`);
  }

  // Query 2: Leads from leads_qualification
  const { data: qualIds, error: qualError } = await supabaseAdmin
    .from('leads_qualification')
    .select('lead_id')
    .eq('qualified_by', userId)
    .gte('next_followup_at', todayStart)
    .lt('next_followup_at', todayEnd);

  if (qualError) {
    throw new Error(`Failed to fetch qualification follow-ups: ${qualError.message}`);
  }

  // Combine and deduplicate IDs
  const masterIdList = (masterIds || []).map(l => l.id);
  const qualIdList = (qualIds || []).map(l => l.lead_id);
  const combinedIds = Array.from(new Set([...masterIdList, ...qualIdList]));

  const total = combinedIds.length;
  const totalPages = Math.ceil(total / limit);

  if (total === 0) {
    return {
      leads: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
    };
  }

  // Fetch full lead details for the current page
  // We need to paginate the IDs first
  const pagedIds = combinedIds.slice(offset, offset + limit);

  const { data: leads, error: leadsError } = await supabaseAdmin
    .from('leads_master')
    .select(`
      *,
      source:sources(id, display_name, source_type)
    `)
    .in('id', pagedIds)
    .order('next_followup_at', { ascending: true });

  if (leadsError) {
    throw new Error(`Failed to fetch follow-up details: ${leadsError.message}`);
  }

  return {
    leads: leads || [],
    total,
    page,
    limit,
    totalPages,
  };
};

/**
 * Get Pending Leads (status != 'New' AND is_qualified = FALSE AND "IS_LOST" IS NULL AND Lead_Remarks IS NOT NULL AND TRIM(Lead_Remarks) <> '')
 */
export const getPendingLeads = async (
  userId: number,
  options?: FilteredLeadsOptions
): Promise<FilteredLeadsResponse> => {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 50;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('leads_master')
    .select(`
      *,
      source:sources(id, display_name, source_type)
    `, { count: 'exact' })
    .eq('assigned_to', userId)
    .eq('status', 'Pending')
    .eq('is_qualified', false)
    .is('IS_LOST', null)
    .is('IS_LOST', null)
    .order('updated_at', { ascending: false });

  if (options?.startDate) {
    query = query.gte('next_followup_at', options.startDate);
  }

  if (options?.endDate) {
    query = query.lte('next_followup_at', options.endDate);
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch pending leads: ${error.message}`);
  }

  const filteredLeads = data || [];

  const total = filteredLeads.length;
  const totalPages = Math.ceil(total / limit);

  return {
    leads: filteredLeads,
    total,
    page,
    limit,
    totalPages,
  };
};

/**
 * Get Qualified Leads (is_qualified = TRUE AND "IS_LOST" IS NULL)
 */
export const getQualifiedLeads = async (
  userId: number,
  options?: FilteredLeadsOptions
): Promise<FilteredLeadsResponse> => {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 50;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('leads_master')
    .select(`
      *,
      source:sources(id, display_name, source_type)
    `, { count: 'exact' })
    .eq('assigned_to', userId)
    .eq('is_qualified', true)
    .is('IS_LOST', null)
    .order('updated_at', { ascending: false });

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch qualified leads: ${error.message}`);
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);

  return {
    leads: data || [],
    total,
    page,
    limit,
    totalPages,
  };
};

/**
 * Get Won Leads (is_qualified = TRUE AND "IS_LOST" = FALSE)
 */
export const getWonLeads = async (
  userId: number,
  options?: FilteredLeadsOptions
): Promise<FilteredLeadsResponse> => {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 50;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('leads_master')
    .select(`
      *,
      source:sources(id, display_name, source_type),
      qualification:leads_qualification!inner(
        id,
        qualified_by,
        RETAILED,
        TEST_DRIVE,
        BOOKED,
        qualified_at
      )
    `, { count: 'exact' })
    .eq('assigned_to', userId)
    .eq('is_qualified', true)
    .is('IS_LOST', null)
    .eq('qualification.RETAILED', true)
    .eq('qualification.qualified_by', userId)
    .order('updated_at', { ascending: false });

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch won leads: ${error.message}`);
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);

  return {
    leads: data || [],
    total,
    page,
    limit,
    totalPages,
  };
};

/**
 * Get Lost Leads (is_qualified = TRUE AND "IS_LOST" = TRUE)
 */
export const getLostLeads = async (
  userId: number,
  options?: FilteredLeadsOptions
): Promise<FilteredLeadsResponse> => {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 50;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('leads_master')
    .select(`
      *,
      source:sources(id, display_name, source_type)
    `, { count: 'exact' })
    .eq('assigned_to', userId)
    .eq('IS_LOST', true)
    .order('updated_at', { ascending: false });

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch lost leads: ${error.message}`);
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);

  return {
    leads: data || [],
    total,
    page,
    limit,
    totalPages,
  };
};

/**
 * Get counts for all filter categories (for tab labels)
 */
export interface FilterCounts {
  fresh_untouched: number;
  fresh_called: number;
  today_followups: number;
  pending: number;
  qualified: number;
  won: number;
  lost: number;
}

export const getFilterCounts = async (userId: number): Promise<FilterCounts> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayEnd = tomorrow.toISOString();

  const [freshUntouched, freshCalled, todaysFollowups, pendingCount, qualified, won, lost] = await Promise.all([
    // Fresh Untouched: status='New', is_qualified=false, IS_LOST=null
    supabaseAdmin
      .from('leads_master')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .eq('status', 'New')
      .eq('is_qualified', false)
      .then(({ count }) => count ?? 0),

    // Fresh Called: status!='New', is_qualified=false, IS_LOST=null
    supabaseAdmin
      .from('leads_master')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .neq('status', 'New')
      .eq('is_qualified', false)
      .is('IS_LOST', null)
      .then(({ count }) => count ?? 0),

    // Today's Follow-ups: Combine leads_master and leads_qualification
    Promise.all([
      supabaseAdmin
        .from('leads_master')
        .select('id')
        .eq('assigned_to', userId)
        .neq('status', 'New')
        .gte('next_followup_at', todayStart)
        .lt('next_followup_at', todayEnd)
        .is('IS_LOST', null),
      supabaseAdmin
        .from('leads_qualification')
        .select('lead_id')
        .eq('qualified_by', userId)
        .gte('next_followup_at', todayStart)
        .lt('next_followup_at', todayEnd)
    ]).then(([{ data: masterIds }, { data: qualIds }]) => {
      const mIds = (masterIds || []).map(l => l.id);
      const qIds = (qualIds || []).map(l => l.lead_id);
      return new Set([...mIds, ...qIds]).size;
    }),

    // Pending: status='Pending', is_qualified=false, IS_LOST=null
    supabaseAdmin
      .from('leads_master')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .eq('status', 'Pending')
      .eq('is_qualified', false)
      .is('IS_LOST', null)
      .then(({ count }) => count ?? 0),

    // Qualified: is_qualified=true, IS_LOST=null
    supabaseAdmin
      .from('leads_master')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .eq('is_qualified', true)
      .is('IS_LOST', null)
      .then(({ count }) => count ?? 0),

    // Won: RETAILED=true in leads_qualification, qualified_by=userId
    supabaseAdmin
      .from('leads_master')
      .select(`
        id,
        qualification:leads_qualification!inner(RETAILED, qualified_by)
      `, { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .eq('is_qualified', true)
      .is('IS_LOST', null)
      .eq('qualification.RETAILED', true)
      .eq('qualification.qualified_by', userId)
      .then(({ count }) => count ?? 0),

    // Lost: is_qualified=true, IS_LOST=true
    supabaseAdmin
      .from('leads_master')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', userId)
      .eq('IS_LOST', true)
      .then(({ count }) => count ?? 0),
  ]);

  return {
    fresh_untouched: freshUntouched,
    fresh_called: freshCalled,
    today_followups: todaysFollowups,
    pending: pendingCount,
    qualified,
    won,
    lost,
  };
};



export interface UpdateQualifiedLeadStatusInput {
  lead_id: number;
  test_drive: boolean;
  booked: boolean;
  retailed: boolean;
}

export const updateQualifiedLeadStatus = async (
  userId: number,
  data: UpdateQualifiedLeadStatusInput
): Promise<void> => {
  // 1. Verify access (assigned or qualified by)
  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads_master')
    .select('id, assigned_to')
    .eq('id', data.lead_id)
    .single();

  if (leadError || !lead) {
    throw new Error('Lead not found');
  }

  // Check if assigned to user
  if (lead.assigned_to !== userId) {
    // Check if qualified by user
    const { data: qual, error: qualError } = await supabaseAdmin
      .from('leads_qualification')
      .select('qualified_by')
      .eq('lead_id', data.lead_id)
      .single();

    if (qualError || !qual || qual.qualified_by !== userId) {
      throw new Error('Unauthorized to update this lead');
    }
  }

  // 2. Update leads_qualification
  const { error: updateError } = await supabaseAdmin
    .from('leads_qualification')
    .update({
      TEST_DRIVE: data.test_drive,
      BOOKED: data.booked,
      RETAILED: data.retailed,
      updated_at: new Date().toISOString(),
    })
    .eq('lead_id', data.lead_id);

  if (updateError) {
    throw new Error(`Failed to update qualified lead status: ${updateError.message}`);
  }
};

export const getLeadQualification = async (
  userId: number,
  leadId: number
): Promise<any> => {
  // 1. Verify access
  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads_master')
    .select('id, assigned_to')
    .eq('id', leadId)
    .single();

  if (leadError || !lead) {
    throw new Error('Lead not found');
  }

  if (lead.assigned_to !== userId) {
    // Check if qualified by user
    const { data: qualCheck, error: qualCheckError } = await supabaseAdmin
      .from('leads_qualification')
      .select('qualified_by')
      .eq('lead_id', leadId)
      .single();

    if (qualCheckError || !qualCheck || qualCheck.qualified_by !== userId) {
      throw new Error('Unauthorized to view this lead details');
    }
  }

  // 2. Fetch qualification details
  const { data, error } = await supabaseAdmin
    .from('leads_qualification')
    .select('*')
    .eq('lead_id', leadId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch qualification details: ${error.message}`);
  }

  return data;
};
