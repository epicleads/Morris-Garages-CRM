import { supabaseAdmin } from '../config/supabase';

export interface AdminDashboardStats {
  totalCreUsers: number;
  unassignedLeads: number;
  activeAssignments: number;
  freshLeads: number;
  totalLeads: number;
  qualifiedLeads: number;
  conversionRate: number;
  conversion_rate_percent_string: string;
}

export interface AdminQualifiedLead {
  qualification: any;
  lead: any | null;
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
    totalLeads,
    qualifiedLeads,
    conversionRate,
    conversion_rate_percent_string,
  };
};

/**
 * Fetch recent qualified leads for TL/Admin review along with basic lead details.
 * This is intentionally kept simple and read-only (no complex joins) for stability.
 */
export const getQualifiedLeadsForReview = async (): Promise<AdminQualifiedLead[]> => {
  // 1. Fetch latest qualification records
  const { data: qualifications, error: qualError } = await supabaseAdmin
    .from('leads_qualification')
    .select(
      `
      id,
      lead_id,
      qualified_category,
      customer_location,
      model_interested,
      purchase_timeline,
      finance_type,
      exchange_vehicle_make,
      exchange_vehicle_model,
      exchange_vehicle_year,
      lead_category,
      next_followup_at,
      remarks,
      qualified_by,
      qualified_at,
      "TEST_DRIVE",
      "BOOKED",
      "RETAILED",
      branch_id,
      tl_id,
      rm_id,
      dms_id
    `
    )
    .order('qualified_at', { ascending: false })
    .limit(200);

  if (qualError) {
    throw new Error(`Failed to fetch qualified leads for review: ${qualError.message}`);
  }

  const qualList = qualifications || [];
  if (qualList.length === 0) {
    return [];
  }

  // 2. Fetch basic lead details for associated leads
  const leadIds = Array.from(
    new Set(
      qualList
        .map((q) => q.lead_id)
        .filter((id): id is number => typeof id === 'number' && !Number.isNaN(id))
    )
  );

  let leadMap = new Map<number, any>();
  if (leadIds.length > 0) {
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads_master')
      .select(`
        id,
        full_name,
        phone_number_normalized,
        status,
        source_id,
        assigned_to,
        created_at,
        source:sources(id, display_name, source_type)
      `)
      .in('id', leadIds);

    if (leadsError) {
      throw new Error(`Failed to fetch lead details for qualified leads: ${leadsError.message}`);
    }

    (leads || []).forEach((lead) => {
      if (lead && typeof lead.id === 'number') {
        leadMap.set(lead.id, lead);
      }
    });
  }

  // 3. Combine qualification + lead into a flat structure
  return qualList.map((q) => ({
    qualification: q,
    lead: q.lead_id ? leadMap.get(q.lead_id) || null : null,
  }));
};

/**
 * Admin/TL-only update of qualified lead flags (TEST_DRIVE / BOOKED / RETAILED).
 * This is intentionally simple and does not enforce per-CRE ownership checks.
 */
export const updateQualifiedLeadFlagsAdmin = async (
  leadId: number,
  flags: { testDrive?: boolean | null; booked?: boolean | null; retailed?: boolean | null }
) => {
  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (flags.testDrive !== undefined) {
    updateData.TEST_DRIVE = flags.testDrive;
  }
  if (flags.booked !== undefined) {
    updateData.BOOKED = flags.booked;
  }
  if (flags.retailed !== undefined) {
    updateData.RETAILED = flags.retailed;
  }

  if (
    flags.testDrive === undefined &&
    flags.booked === undefined &&
    flags.retailed === undefined
  ) {
    throw new Error('At least one of testDrive, booked, or retailed must be provided');
  }

  const { error } = await supabaseAdmin
    .from('leads_qualification')
    .update(updateData)
    .eq('lead_id', leadId);

  if (error) {
    throw new Error(`Failed to update qualified lead flags: ${error.message}`);
  }

  return { success: true };
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


// ============================================================================
// 4. ADMIN-MANAGED MASTER DATA (MODELS, VARIANTS, LOCATIONS, REASONS)
// ============================================================================

// 4.1 Vehicle Models
export const listVehicleModels = async () => {
  const { data, error } = await supabaseAdmin
    .from('vehicle_models')
    .select('*')
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch vehicle models: ${error.message}`);
  }

  return data || [];
};

export const createVehicleModel = async (input: { name: string; isActive?: boolean; displayOrder?: number | null }) => {
  const { data, error } = await supabaseAdmin
    .from('vehicle_models')
    .insert({
      name: input.name,
      is_active: input.isActive ?? true,
      display_order: input.displayOrder ?? null,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create vehicle model: ${error.message}`);
  }

  return data;
};

export const updateVehicleModel = async (
  id: number,
  input: { name?: string; isActive?: boolean; displayOrder?: number | null }
) => {
  const updateData: any = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.isActive !== undefined) updateData.is_active = input.isActive;
  if (input.displayOrder !== undefined) updateData.display_order = input.displayOrder;

  const { data, error } = await supabaseAdmin
    .from('vehicle_models')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update vehicle model: ${error.message}`);
  }

  return data;
};

// 4.2 Vehicle Variants
export const listVehicleVariants = async (modelId?: number) => {
  let q = supabaseAdmin.from('vehicle_variants').select('*');

  if (modelId) {
    q = q.eq('model_id', modelId);
  }

  const { data, error } = await q
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch vehicle variants: ${error.message}`);
  }

  return data || [];
};

export const createVehicleVariant = async (input: {
  modelId: number;
  name: string;
  isActive?: boolean;
  displayOrder?: number | null;
}) => {
  const { data, error } = await supabaseAdmin
    .from('vehicle_variants')
    .insert({
      model_id: input.modelId,
      name: input.name,
      is_active: input.isActive ?? true,
      display_order: input.displayOrder ?? null,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create vehicle variant: ${error.message}`);
  }

  return data;
};

export const updateVehicleVariant = async (
  id: number,
  input: { name?: string; isActive?: boolean; displayOrder?: number | null; modelId?: number }
) => {
  const updateData: any = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.isActive !== undefined) updateData.is_active = input.isActive;
  if (input.displayOrder !== undefined) updateData.display_order = input.displayOrder;
  if (input.modelId !== undefined) updateData.model_id = input.modelId;

  const { data, error } = await supabaseAdmin
    .from('vehicle_variants')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update vehicle variant: ${error.message}`);
  }

  return data;
};

// 4.3 Locations
export const listLocations = async (branchId?: number) => {
  let q = supabaseAdmin.from('locations').select('*');

  if (branchId) {
    q = q.eq('branch_id', branchId);
  }

  const { data, error } = await q
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch locations: ${error.message}`);
  }

  return data || [];
};

export const createLocation = async (input: {
  name: string;
  city?: string | null;
  branchId?: number | null;
  isActive?: boolean;
  displayOrder?: number | null;
}) => {
  const { data, error } = await supabaseAdmin
    .from('locations')
    .insert({
      name: input.name,
      city: input.city ?? null,
      branch_id: input.branchId ?? null,
      is_active: input.isActive ?? true,
      display_order: input.displayOrder ?? null,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create location: ${error.message}`);
  }

  return data;
};

export const updateLocation = async (
  id: number,
  input: {
    name?: string;
    city?: string | null;
    branchId?: number | null;
    isActive?: boolean;
    displayOrder?: number | null;
  }
) => {
  const updateData: any = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.city !== undefined) updateData.city = input.city;
  if (input.branchId !== undefined) updateData.branch_id = input.branchId;
  if (input.isActive !== undefined) updateData.is_active = input.isActive;
  if (input.displayOrder !== undefined) updateData.display_order = input.displayOrder;

  const { data, error } = await supabaseAdmin
    .from('locations')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update location: ${error.message}`);
  }

  return data;
};

// 4.4 Pending Reasons
export const listPendingReasons = async () => {
  const { data, error } = await supabaseAdmin
    .from('pending_reasons')
    .select('*')
    .order('label', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch pending reasons: ${error.message}`);
  }

  return data || [];
};

export const createPendingReason = async (input: {
  code: string;
  label: string;
  description?: string | null;
  isActive?: boolean;
  appliesToStage?: string | null;
}) => {
  const { data, error } = await supabaseAdmin
    .from('pending_reasons')
    .insert({
      code: input.code,
      label: input.label,
      description: input.description ?? null,
      is_active: input.isActive ?? true,
      applies_to_stage: input.appliesToStage ?? null,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create pending reason: ${error.message}`);
  }

  return data;
};

export const updatePendingReason = async (
  id: number,
  input: {
    code?: string;
    label?: string;
    description?: string | null;
    isActive?: boolean;
    appliesToStage?: string | null;
  }
) => {
  const updateData: any = { updated_at: new Date().toISOString() };
  if (input.code !== undefined) updateData.code = input.code;
  if (input.label !== undefined) updateData.label = input.label;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.isActive !== undefined) updateData.is_active = input.isActive;
  if (input.appliesToStage !== undefined) updateData.applies_to_stage = input.appliesToStage;

  const { data, error } = await supabaseAdmin
    .from('pending_reasons')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update pending reason: ${error.message}`);
  }

  return data;
};

// 4.5 Unqualified / Lost Reasons
export const listUnqualifiedReasons = async () => {
  const { data, error } = await supabaseAdmin
    .from('unqualified_reasons')
    .select('*')
    .order('label', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch unqualified reasons: ${error.message}`);
  }

  return data || [];
};

export const createUnqualifiedReason = async (input: {
  code: string;
  label: string;
  description?: string | null;
  category?: string | null;
  isActive?: boolean;
  appliesToStage?: string | null;
}) => {
  const { data, error } = await supabaseAdmin
    .from('unqualified_reasons')
    .insert({
      code: input.code,
      label: input.label,
      description: input.description ?? null,
      category: input.category ?? null,
      is_active: input.isActive ?? true,
      applies_to_stage: input.appliesToStage ?? null,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create unqualified reason: ${error.message}`);
  }

  return data;
};

export const updateUnqualifiedReason = async (
  id: number,
  input: {
    code?: string;
    label?: string;
    description?: string | null;
    category?: string | null;
    isActive?: boolean;
    appliesToStage?: string | null;
  }
) => {
  const updateData: any = { updated_at: new Date().toISOString() };
  if (input.code !== undefined) updateData.code = input.code;
  if (input.label !== undefined) updateData.label = input.label;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.category !== undefined) updateData.category = input.category;
  if (input.isActive !== undefined) updateData.is_active = input.isActive;
  if (input.appliesToStage !== undefined) updateData.applies_to_stage = input.appliesToStage;

  const { data, error } = await supabaseAdmin
    .from('unqualified_reasons')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update unqualified reason: ${error.message}`);
  }

  return data;
};

