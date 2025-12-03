import { supabaseAdmin } from '../config/supabase';
import { SafeUser } from '../types/user';
import { buildLeadsQuery, buildTodaysFollowupsQuery } from './queryHelpers';
import { canAccessLead, canViewAllLeads } from './permissions.service';
import { autoAssignLead } from './assignment.service';

export interface CreateLeadInput {
  fullName: string;
  phoneNumber: string;
  alternatePhoneNumber?: string;
  sourceId?: number;
  externalLeadId?: string;
  rawPayload?: any;
}

export interface UpdateLeadStatusInput {
  status: string;
  remarks?: string;
  attemptNo?: number;
  callDuration?: number;
  nextFollowupAt?: string;
  pendingReason?: string;
  disqualifyReason?: string;
  assignedTo?: number;
}

export interface QualifyLeadInput {
  qualifiedCategory: string; // Required - Category of qualification
  modelInterested?: string; // Optional - Model customer is interested in
  variant?: string; // Optional - Variant of the model
  profession?: string; // Optional - Customer's profession
  customerLocation?: string; // Optional - Customer's location
  purchaseTimeline?: string; // Optional - When customer plans to purchase
  financeType?: string; // Optional - Type of financing
  testdriveDate?: string; // Optional - Test drive date (YYYY-MM-DD format)
  exchangeVehicleMake?: string; // Optional - Exchange vehicle make
  exchangeVehicleModel?: string; // Optional - Exchange vehicle model
  exchangeVehicleYear?: number; // Optional - Exchange vehicle year
  leadCategory?: string; // Optional - Lead category
  nextFollowupAt: string; // REQUIRED - Next follow-up date/time (ISO datetime)
  remarks?: string; // Optional - Additional remarks
  branchId?: number; // Optional - Branch to route qualified lead to
  tlId?: number; // Optional - Team Lead user_id for this lead
  rmId?: number; // Optional - Relationship Manager user_id for this lead
  dmsId?: string; // Optional - DMS reference id
}

export interface UpdateQualificationInput {
  qualifiedCategory?: string; // Optional - Category of qualification
  modelInterested?: string; // Optional - Model customer is interested in
  variant?: string; // Optional - Variant of the model
  profession?: string; // Optional - Customer's profession
  customerLocation?: string; // Optional - Customer's location
  purchaseTimeline?: string; // Optional - When customer plans to purchase
  financeType?: string; // Optional - Type of financing
  testdriveDate?: string; // Optional - Test drive date (YYYY-MM-DD format)
  exchangeVehicleMake?: string; // Optional - Exchange vehicle make
  exchangeVehicleModel?: string; // Optional - Exchange vehicle model
  exchangeVehicleYear?: number; // Optional - Exchange vehicle year
  leadCategory?: string; // Optional - Lead category
  nextFollowupAt?: string; // Optional - Next follow-up date/time (ISO datetime)
  remarks?: string; // Optional - Additional remarks
  branchId?: number; // Optional - Branch to route qualified lead to
  tlId?: number; // Optional - Team Lead user_id for this lead
  rmId?: number; // Optional - Relationship Manager user_id for this lead
  dmsId?: string; // Optional - DMS reference id
}

export interface LeadFilters {
  status?: string;
  sourceId?: number;
  assignedTo?: number;
  dateFrom?: string;
  dateTo?: string;
  filterType?: 'today' | 'mtd' | 'custom' | 'all';
  page?: number;
  limit?: number;
  search?: string; // Search by name or phone
}

/**
 * Normalize phone number - remove all non-digit characters
 */
const normalizePhone = (phone: string): string => {
  return phone.replace(/\D/g, '');
};

/**
 * List leads with role-based filtering and advanced filters
 */
export const listLeads = async (user: SafeUser, filters?: LeadFilters) => {
  let query = buildLeadsQuery(supabaseAdmin, user);

  // Status filter
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  // Source filter
  if (filters?.sourceId) {
    query = query.eq('source_id', filters.sourceId);
  }

  // Assigned to filter (only for CRE_TL/Developer)
  if (filters?.assignedTo && canViewAllLeads(user)) {
    query = query.eq('assigned_to', filters.assignedTo);
  }

  // Date filters
  if (filters?.filterType) {
    const now = new Date();
    let dateFrom: string | undefined;
    let dateTo: string | undefined;

    switch (filters.filterType) {
      case 'today':
        dateFrom = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        dateTo = new Date(now.setHours(23, 59, 59, 999)).toISOString();
        break;
      case 'mtd':
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        dateTo = new Date().toISOString();
        break;
      case 'custom':
        dateFrom = filters.dateFrom;
        dateTo = filters.dateTo;
        break;
      case 'all':
      default:
        // No date filter
        break;
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }
  } else if (filters?.dateFrom || filters?.dateTo) {
    // Custom date range
    if (filters.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }
  }

  // Search filter (name or phone)
  if (filters?.search) {
    const searchTerm = filters.search.trim();
    // Search in full_name or phone_number_normalized
    query = query.or(
      `full_name.ilike.%${searchTerm}%,phone_number_normalized.ilike.%${searchTerm}%`
    );
  }

  // Pagination
  const page = filters?.page || 1;
  const limit = filters?.limit || 50;
  const offset = (page - 1) * limit;

  query = query.order('created_at', { ascending: false });

  // Get count first (without pagination) - build separate count query
  let countQuery = buildLeadsQuery(supabaseAdmin, user);
  if (filters?.status) {
    countQuery = countQuery.eq('status', filters.status);
  }
  if (filters?.sourceId) {
    countQuery = countQuery.eq('source_id', filters.sourceId);
  }
  if (filters?.assignedTo && canViewAllLeads(user)) {
    countQuery = countQuery.eq('assigned_to', filters.assignedTo);
  }
  if (filters?.dateFrom) {
    countQuery = countQuery.gte('created_at', filters.dateFrom);
  }
  if (filters?.dateTo) {
    countQuery = countQuery.lte('created_at', filters.dateTo);
  }
  if (filters?.search) {
    const searchTerm = filters.search.trim();
    countQuery = countQuery.or(
      `full_name.ilike.%${searchTerm}%,phone_number_normalized.ilike.%${searchTerm}%`
    );
  }

  // Get count - fetch all IDs and count them (simpler approach)
  const { data: countData, error: countError } = await countQuery.select('id');

  if (countError) {
    throw new Error(`Failed to get count: ${countError.message}`);
  }

  const total = countData?.length || 0;

  // Apply pagination to main query
  query = query.range(offset, offset + limit - 1);
  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list leads: ${error.message}`);
  }

  return {
    leads: data || [],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

/**
 * Get single lead with access check
 */
export const getLeadById = async (user: SafeUser, leadId: number) => {
  const { data: lead, error } = await supabaseAdmin
    .from('leads_master')
    .select(`
      *,
      source:sources(id, display_name, source_type, webhook_secret, field_mapping),
      assigned_user:users!leads_master_assigned_to_fkey(user_id, full_name, username, role, email, phone_number)
    `)
    .eq('id', leadId)
    .single();

  if (error || !lead) {
    throw new Error('Lead not found');
  }

  // Check access
  if (!canAccessLead(user, lead.assigned_to)) {
    throw new Error('Access denied: You can only view leads assigned to you');
  }

  return lead;
};

/**
 * Create lead manually (Admin/CRE_TL only)
 */
export const createLead = async (user: SafeUser, input: CreateLeadInput) => {
  if (!canViewAllLeads(user)) {
    throw new Error('Permission denied: Only Team Leads can create leads');
  }

  // Normalize phone
  const normalizedPhone = normalizePhone(input.phoneNumber);

  if (normalizedPhone.length < 10) {
    throw new Error('Invalid phone number: Must be at least 10 digits');
  }

  // Check for duplicate
  const { data: existing } = await supabaseAdmin
    .from('leads_master')
    .select('id, full_name, status')
    .eq('phone_number_normalized', normalizedPhone)
    .maybeSingle();

  if (existing) {
    throw new Error(
      `Lead with this phone number already exists (ID: ${existing.id}, Status: ${existing.status})`
    );
  }

  // Validate source exists if sourceId is provided
  let sourceId: number | null = null;
  if (input.sourceId) {
    const { data: source, error: sourceError } = await supabaseAdmin
      .from('sources')
      .select('id, display_name')
      .eq('id', input.sourceId)
      .maybeSingle();

    if (sourceError) {
      throw new Error(`Failed to validate source: ${sourceError.message}`);
    }

    if (!source) {
      throw new Error(
        `Source with ID ${input.sourceId} does not exist. Please create the source first or use a valid source ID.`
      );
    }

    sourceId = input.sourceId;
  }

  const { data, error } = await supabaseAdmin
    .from('leads_master')
    .insert({
      full_name: input.fullName,
      phone_number_normalized: normalizedPhone,
      alternate_phone_number: input.alternatePhoneNumber
        ? normalizePhone(input.alternatePhoneNumber)
        : null,
      source_id: sourceId,
      external_lead_id: input.externalLeadId || null,
      raw_payload: input.rawPayload || null,
      status: 'New',
    })
    .select()
    .single();

  if (error) {
    // Provide better error messages for common issues
    if (error.message.includes('foreign key constraint')) {
      if (error.message.includes('source_id')) {
        throw new Error(
          `Invalid source ID: ${input.sourceId}. This source does not exist in the database. Please create the source first or remove the sourceId field.`
        );
      }
      if (error.message.includes('assigned_to')) {
        throw new Error(
          `Invalid assigned user ID. The user does not exist in the database.`
        );
      }
    }
    throw new Error(`Failed to create lead: ${error.message}`);
  }

  // Create initial log entry
  await supabaseAdmin.from('leads_logs').insert({
    lead_id: data.id,
    old_status: null,
    new_status: 'New',
    remarks: 'Lead created manually',
    created_by: user.id,
  });

  // Attempt auto-assignment based on source rules
  if (sourceId) {
    try {
      const autoResult = await autoAssignLead(data.id, sourceId);
      if (autoResult?.assignedTo) {
        data.assigned_to = autoResult.assignedTo;
        data.assigned_at = autoResult.assignedAt || data.assigned_at;
      }
    } catch (autoError) {
      // Log but don't block lead creation
      console.error('Auto assignment failed', autoError);
    }
  }

  return data;
};

/**
 * Update lead status with automatic log creation
 */
export const updateLeadStatus = async (
  user: SafeUser,
  leadId: number,
  input: UpdateLeadStatusInput
) => {
  // Get current lead
  const lead = await getLeadById(user, leadId);

  const attemptNo = input.attemptNo || lead.total_attempts + 1;

  const updateData: any = {
    status: input.status,
    updated_at: new Date().toISOString(),
    total_attempts: attemptNo,
  };

  if (input.remarks) {
    updateData.Lead_Remarks = input.remarks;
  }

  // Allow CRE_TL/Developer to reassign during status update
  if (
    input.assignedTo &&
    canViewAllLeads(user) &&
    input.assignedTo !== lead.assigned_to
  ) {
    const { data: targetUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('user_id, full_name, status')
      .eq('user_id', input.assignedTo)
      .maybeSingle();

    if (userError) {
      throw new Error(`Failed to verify assignee: ${userError.message}`);
    }

    if (!targetUser || targetUser.status === false) {
      throw new Error(`Assigned user ${input.assignedTo} not found or inactive`);
    }

    updateData.assigned_to = input.assignedTo;
    updateData.assigned_at = new Date().toISOString();
  }

  // Handle status-specific requirements
  if (input.status === 'Pending') {
    if (!input.nextFollowupAt) {
      throw new Error('nextFollowupAt is required for Pending status');
    }
    if (!input.remarks || input.remarks.trim() === '') {
      throw new Error('remarks are required for Pending status to capture follow-up context');
    }
    updateData.next_followup_at = input.nextFollowupAt;
    updateData.IS_LOST = false;
  }

  if (input.status === 'Qualified') {
    if (!input.nextFollowupAt) {
      throw new Error('nextFollowupAt is required for Qualified status');
    }
    updateData.next_followup_at = input.nextFollowupAt;
    updateData.is_qualified = true;
  }

  if (input.status === 'Disqualified') {
    if (!input.disqualifyReason) {
      throw new Error('disqualifyReason is required for Disqualified status');
    }
    updateData.IS_LOST = true;
  }

  if (input.status === 'Lost') {
    updateData.IS_LOST = true;
  }

  if (
    input.nextFollowupAt &&
    input.status !== 'Pending' &&
    input.status !== 'Qualified'
  ) {
    updateData.next_followup_at = input.nextFollowupAt;
  }

  // Ensure IS_LOST resets when moving back to working statuses
  if (
    input.status !== 'Disqualified' &&
    input.status !== 'Lost' &&
    updateData.IS_LOST === undefined
  ) {
    // Use NULL (not false) to represent "not lost" so filters that check for NULL work correctly
    updateData.IS_LOST = null;
  }

  // Update lead
  const { data: updatedLead, error: updateError } = await supabaseAdmin
    .from('leads_master')
    .update(updateData)
    .eq('id', leadId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Failed to update lead: ${updateError.message}`);
  }

  // Create lead log with metadata
  const logMetadata: any = {
    callDuration: input.callDuration || null,
    nextFollowupAt: input.nextFollowupAt || null,
  };

  if (input.pendingReason) {
    logMetadata.pendingReason = input.pendingReason;
  }

  if (input.disqualifyReason) {
    logMetadata.disqualifyReason = input.disqualifyReason;
  }

  if (input.assignedTo && canViewAllLeads(user)) {
    logMetadata.manualAssignment = {
      assignedTo: input.assignedTo,
    };
  }

  await supabaseAdmin.from('leads_logs').insert({
    lead_id: leadId,
    old_status: lead.status,
    new_status: input.status,
    remarks: input.remarks || null,
    attempt_no: attemptNo,
    created_by: user.id,
    metadata: logMetadata,
  });

  return updatedLead;
};

/**
 * Qualify lead - creates qualification record
 * 
 * Process:
 * 1. CRE marks lead as Qualified
 * 2. Opens qualification form
 * 3. Fills required fields (qualifiedCategory, nextFollowupAt)
 * 4. Fills optional fields
 * 5. Creates qualification record
 * 6. Updates leads_master status
 * 7. Creates lead_log entry
 */
export const qualifyLead = async (
  user: SafeUser,
  leadId: number,
  input: QualifyLeadInput
) => {
  // Validate required fields
  if (!input.qualifiedCategory || input.qualifiedCategory.trim() === '') {
    throw new Error('qualifiedCategory is required');
  }

  if (!input.nextFollowupAt) {
    throw new Error('nextFollowupAt is required for qualification');
  }

  // Validate nextFollowupAt is a valid date
  const followupDate = new Date(input.nextFollowupAt);
  if (isNaN(followupDate.getTime())) {
    throw new Error('nextFollowupAt must be a valid date');
  }

  // Get lead
  const lead = await getLeadById(user, leadId);

  // Optional validation: if branch/TL/RM provided, ensure they are consistent
  if (input.branchId) {
    const { data: branch, error: branchError } = await supabaseAdmin
      .from('branches')
      .select('id, is_active')
      .eq('id', input.branchId)
      .maybeSingle();
    if (branchError) {
      throw new Error(`Failed to verify branch: ${branchError.message}`);
    }
    if (!branch) {
      throw new Error('Invalid branchId: branch not found');
    }
  }

  if (input.tlId) {
    const { data: tlMember, error: tlError } = await supabaseAdmin
      .from('branch_members')
      .select('id')
      .eq('branch_id', input.branchId || null)
      .eq('user_id', input.tlId)
      .eq('role', 'TL')
      .eq('is_active', true)
      .maybeSingle();
    if (tlError) {
      throw new Error(`Failed to verify TL: ${tlError.message}`);
    }
    if (!tlMember) {
      throw new Error('Invalid tlId for the given branch');
    }
  }

  if (input.rmId) {
    const { data: rmMember, error: rmError } = await supabaseAdmin
      .from('branch_members')
      .select('id')
      .eq('branch_id', input.branchId || null)
      .eq('user_id', input.rmId)
      .eq('role', 'RM')
      .eq('is_active', true)
      .maybeSingle();
    if (rmError) {
      throw new Error(`Failed to verify RM: ${rmError.message}`);
    }
    if (!rmMember) {
      throw new Error('Invalid rmId for the given branch');
    }
  }

  // Check if lead is already qualified - throw error (use update endpoint instead)
  if (lead.is_qualified) {
    const { data: existingQual } = await supabaseAdmin
      .from('leads_qualification')
      .select('id')
      .eq('lead_id', leadId)
      .maybeSingle();

    if (existingQual) {
      throw new Error('Lead is already qualified. Use PATCH /leads/:id/qualification to update.');
    }
  }

  // Calculate attempt number from leads_logs (get max attempt_no or count logs)
  const { data: logs } = await supabaseAdmin
    .from('leads_logs')
    .select('attempt_no')
    .eq('lead_id', leadId)
    .not('attempt_no', 'is', null)
    .order('attempt_no', { ascending: false })
    .limit(1);

  // Get max attempt_no or use current total_attempts from lead
  const maxAttemptNo = logs && logs.length > 0 && logs[0].attempt_no
    ? logs[0].attempt_no
    : (lead.total_attempts || 0);

  const attemptNo = maxAttemptNo + 1;

  // Start transaction-like operations (Supabase doesn't have transactions, so we do sequentially)
  // 1. Update leads_master status and denormalized fields
  const { error: updateError } = await supabaseAdmin
    .from('leads_master')
    .update({
      status: 'Pending', // User requested status to be 'Pending' after qualification
      is_qualified: true,
      next_followup_at: input.nextFollowupAt, // Denormalized for performance
      total_attempts: attemptNo, // Denormalized for performance
      Lead_Remarks: input.remarks || null, // Latest remark
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  if (updateError) {
    throw new Error(`Failed to update lead: ${updateError.message}`);
  }

  // 2. Create qualification record (source of truth for qualified leads)
  const { data: qualification, error: qualError } = await supabaseAdmin
    .from('leads_qualification')
    .insert({
      lead_id: leadId,
      qualified_category: input.qualifiedCategory, // Required
      model_interested: input.modelInterested || null, // Optional
      variant: input.variant || null, // Optional
      profession: input.profession || null, // Optional
      customer_location: input.customerLocation || null, // Optional
      purchase_timeline: input.purchaseTimeline || null, // Optional
      finance_type: input.financeType || null, // Optional
      testdrive_date: input.testdriveDate || null, // Optional (date format: YYYY-MM-DD)
      exchange_vehicle_make: input.exchangeVehicleMake || null, // Optional
      exchange_vehicle_model: input.exchangeVehicleModel || null, // Optional
      exchange_vehicle_year: input.exchangeVehicleYear || null, // Optional
      lead_category: input.leadCategory || null, // Optional
      next_followup_at: input.nextFollowupAt, // REQUIRED - stored here (source of truth)
      remarks: input.remarks || null, // Optional
      qualified_by: user.id,
      qualified_at: new Date().toISOString(),
      branch_id: input.branchId || null,
      tl_id: input.tlId || null,
      rm_id: input.rmId || null,
      dms_id: input.dmsId || null,
    })
    .select()
    .single();

  if (qualError) {
    // Rollback leads_master update if qualification insert fails
    await supabaseAdmin
      .from('leads_master')
      .update({
        status: lead.status,
        is_qualified: false,
        next_followup_at: null,
      })
      .eq('id', leadId);

    throw new Error(`Failed to create qualification: ${qualError.message}`);
  }

  // 3. Create lead log entry (for history/audit)
  await supabaseAdmin.from('leads_logs').insert({
    lead_id: leadId,
    old_status: lead.status,
    new_status: 'Pending', // Reflects the new master status
    remarks: input.remarks || 'Lead qualified',
    attempt_no: attemptNo,
    created_by: user.id,
    metadata: {
      qualifiedCategory: input.qualifiedCategory,
      nextFollowupAt: input.nextFollowupAt, // Also in metadata for history
      action: 'qualified', // Explicitly mark this as a qualification event
    },
  });

  return qualification;
};

/**
 * Update qualification - updates existing qualification record
 * Supports partial updates (only updates fields provided)
 */
export const updateQualification = async (
  user: SafeUser,
  leadId: number,
  input: UpdateQualificationInput
) => {
  // Validate nextFollowupAt if provided
  if (input.nextFollowupAt) {
    const followupDate = new Date(input.nextFollowupAt);
    if (isNaN(followupDate.getTime())) {
      throw new Error('nextFollowupAt must be a valid date');
    }
  }

  // Validate qualifiedCategory if provided
  if (input.qualifiedCategory !== undefined && input.qualifiedCategory.trim() === '') {
    throw new Error('qualifiedCategory cannot be empty');
  }

  // Get lead
  const lead = await getLeadById(user, leadId);

  // Get existing qualification to preserve values not being updated
  const { data: existingQual, error: qualCheckError } = await supabaseAdmin
    .from('leads_qualification')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (qualCheckError) {
    throw new Error(`Failed to check qualification: ${qualCheckError.message}`);
  }

  if (!existingQual) {
    throw new Error('Lead is not qualified yet. Use POST /leads/:id/qualify to create qualification first.');
  }

  // Build update object - only include fields that are provided
  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (input.qualifiedCategory !== undefined) {
    updateData.qualified_category = input.qualifiedCategory;
  }
  if (input.modelInterested !== undefined) {
    updateData.model_interested = input.modelInterested;
  }
  if (input.variant !== undefined) {
    updateData.variant = input.variant;
  }
  if (input.profession !== undefined) {
    updateData.profession = input.profession;
  }
  if (input.customerLocation !== undefined) {
    updateData.customer_location = input.customerLocation;
  }
  if (input.purchaseTimeline !== undefined) {
    updateData.purchase_timeline = input.purchaseTimeline;
  }
  if (input.financeType !== undefined) {
    updateData.finance_type = input.financeType;
  }
  if (input.testdriveDate !== undefined) {
    updateData.testdrive_date = input.testdriveDate || null;
  }
  if (input.exchangeVehicleMake !== undefined) {
    updateData.exchange_vehicle_make = input.exchangeVehicleMake;
  }
  if (input.exchangeVehicleModel !== undefined) {
    updateData.exchange_vehicle_model = input.exchangeVehicleModel;
  }
  if (input.exchangeVehicleYear !== undefined) {
    updateData.exchange_vehicle_year = input.exchangeVehicleYear;
  }
  if (input.leadCategory !== undefined) {
    updateData.lead_category = input.leadCategory;
  }
  if (input.nextFollowupAt !== undefined) {
    updateData.next_followup_at = input.nextFollowupAt;
  }
  if (input.remarks !== undefined) {
    updateData.remarks = input.remarks;
  }
  if (input.branchId !== undefined) {
    updateData.branch_id = input.branchId || null;
  }
  if (input.tlId !== undefined) {
    updateData.tl_id = input.tlId || null;
  }
  if (input.rmId !== undefined) {
    updateData.rm_id = input.rmId || null;
  }
  if (input.dmsId !== undefined) {
    updateData.dms_id = input.dmsId || null;
  }

  // Update leads_master (denormalized fields) - only if nextFollowupAt or remarks changed
  if (input.nextFollowupAt !== undefined || input.remarks !== undefined) {
    const leadUpdateData: any = {
      updated_at: new Date().toISOString(),
    };
    if (input.nextFollowupAt !== undefined) {
      leadUpdateData.next_followup_at = input.nextFollowupAt;
    }
    if (input.remarks !== undefined) {
      leadUpdateData.Lead_Remarks = input.remarks;
    }

    const { error: updateError } = await supabaseAdmin
      .from('leads_master')
      .update(leadUpdateData)
      .eq('id', leadId);

    if (updateError) {
      throw new Error(`Failed to update lead: ${updateError.message}`);
    }
  }

  // Update qualification record
  const { data: qualification, error: qualError } = await supabaseAdmin
    .from('leads_qualification')
    .update(updateData)
    .eq('lead_id', leadId)
    .select()
    .single();

  if (qualError) {
    throw new Error(`Failed to update qualification: ${qualError.message}`);
  }

  // Create lead log entry for update
  await supabaseAdmin.from('leads_logs').insert({
    lead_id: leadId,
    old_status: lead.status,
    new_status: lead.status, // Status remains 'Qualified'
    remarks: input.remarks || 'Qualification updated',
    created_by: user.id,
    metadata: {
      action: 'qualification_updated',
      qualifiedCategory: input.qualifiedCategory,
      nextFollowupAt: input.nextFollowupAt,
    },
  });

  return qualification;
};

/**
 * Get today's follow-ups
 */
export const getTodaysFollowups = async (user: SafeUser) => {
  const query = buildTodaysFollowupsQuery(supabaseAdmin, user);
  const { data, error } = await query.order('next_followup_at', {
    ascending: true,
  });

  if (error) {
    throw new Error(`Failed to fetch follow-ups: ${error.message}`);
  }

  return data || [];
};

/**
 * Get lead timeline/history - all previous attempts, status changes, etc.
 */
export const getLeadTimeline = async (user: SafeUser, leadId: number) => {
  // Check access
  await getLeadById(user, leadId);

  // Get all logs (call attempts, status changes)
  const { data: logs, error: logsError } = await supabaseAdmin
    .from('leads_logs')
    .select(
      `
      *,
      created_by_user:users!leads_logs_created_by_fkey(full_name, username, role)
    `
    )
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });

  if (logsError) {
    throw new Error(`Failed to fetch logs: ${logsError.message}`);
  }

  // Get source history (all sources that contributed to this lead)
  const { data: sources, error: sourcesError } = await supabaseAdmin
    .from('lead_sources_history')
    .select(
      `
      *,
      source:sources(display_name, source_type)
    `
    )
    .eq('lead_id', leadId)
    .order('received_at', { ascending: true });

  if (sourcesError) {
    throw new Error(`Failed to fetch source history: ${sourcesError.message}`);
  }

  // Get qualification record (fetch users separately to avoid join issues)
  const { data: qualification, error: qualError } = await supabaseAdmin
    .from('leads_qualification')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (qualError) {
    throw new Error(`Failed to fetch qualification: ${qualError.message}`);
  }

  // Fetch user details separately if qualification exists
  let qualifiedByUser = null;
  let reviewedByUser = null;

  if (qualification) {
    if (qualification.qualified_by) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('full_name, username')
        .eq('user_id', qualification.qualified_by)
        .maybeSingle();
      qualifiedByUser = user;
    }

    if (qualification.reviewed_by) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('full_name, username')
        .eq('user_id', qualification.reviewed_by)
        .maybeSingle();
      reviewedByUser = user;
    }
  }

  // Get assignment history (from activity_logs if available, or derive from logs)
  // For now, we'll get assignment info from lead itself and logs
  const { data: lead } = await supabaseAdmin
    .from('leads_master')
    .select(
      `
      id,
      assigned_to,
      assigned_at,
      status,
      source:sources(id, display_name, source_type),
      assigned_user:users!leads_master_assigned_to_fkey(full_name, username, role)
    `
    )
    .eq('id', leadId)
    .single();

  // Combine all timeline events in chronological order
  const timelineEvents: any[] = [];

  // Add source entries
  if (sources) {
    sources.forEach((source) => {
      timelineEvents.push({
        type: 'source',
        timestamp: source.received_at,
        data: {
          sourceName: source.source?.display_name || 'Unknown',
          sourceType: source.source?.source_type || 'Unknown',
          externalId: source.external_id,
          isPrimary: source.is_primary,
        },
      });
    });
  }

  // Add assignment event
  if (lead?.assigned_at) {
    // Handle assigned_user as either array or single object
    const assignedUser = Array.isArray(lead.assigned_user)
      ? lead.assigned_user[0]
      : lead.assigned_user;

    timelineEvents.push({
      type: 'assignment',
      timestamp: lead.assigned_at,
      data: {
        assignedTo: assignedUser?.full_name || 'Unknown',
        assignedToUsername: assignedUser?.username || 'Unknown',
      },
    });
  }

  // Add log entries (call attempts, status changes)
  if (logs) {
    logs.forEach((log) => {
      timelineEvents.push({
        type: 'log',
        timestamp: log.created_at,
        data: {
          id: log.id,
          oldStatus: log.old_status,
          newStatus: log.new_status,
          attemptNo: log.attempt_no,
          remarks: log.remarks,
          metadata: log.metadata,
          createdBy: log.created_by_user?.full_name || 'Unknown',
          createdByUsername: log.created_by_user?.username || 'Unknown',
        },
      });
    });
  }

  // Add qualification event
  if (qualification) {
    timelineEvents.push({
      type: 'qualification',
      timestamp: qualification.qualified_at,
      data: {
        id: qualification.id,
        qualifiedCategory: qualification.qualified_category,
        modelInterested: qualification.model_interested,
        qualifiedBy: qualifiedByUser?.full_name || 'Unknown',
        qualifiedByUsername: qualifiedByUser?.username || 'Unknown',
        reviewStatus: qualification.review_status || null,
        reviewedBy: reviewedByUser?.full_name || null,
        reviewedAt: qualification.reviewed_at || null,
      },
    });
  }

  // Sort by timestamp
  timelineEvents.sort((a, b) => {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });

  // Handle assigned_user as either array or single object
  const assignedUser = lead?.assigned_user
    ? (Array.isArray(lead.assigned_user) ? lead.assigned_user[0] : lead.assigned_user)
    : null;

  return {
    timeline: timelineEvents,
    summary: {
      totalAttempts: logs?.length || 0,
      totalSources: sources?.length || 0,
      isQualified: !!qualification,
      currentStatus: lead?.status || 'Unknown',
      assignedTo: assignedUser?.full_name || null,
    },
    // Expose raw qualification record so admin UI can show full details
    qualification,
  };
};

/**
 * Get lead statistics for dashboard
 */
export const getLeadStats = async (user: SafeUser, filters?: LeadFilters) => {
  let query = buildLeadsQuery(supabaseAdmin, user);

  // Apply same filters as listLeads
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.sourceId) {
    query = query.eq('source_id', filters.sourceId);
  }
  if (filters?.dateFrom) {
    query = query.gte('created_at', filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte('created_at', filters.dateTo);
  }

  const { data: leads, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch lead stats: ${error.message}`);
  }

  // Calculate statistics
  const stats = {
    total: leads?.length || 0,
    byStatus: {} as Record<string, number>,
    bySource: {} as Record<string, number>,
    qualified: 0,
    todayFollowups: 0,
  };

  const today = new Date().toISOString().split('T')[0];

  leads?.forEach((lead: any) => {
    // Count by status
    stats.byStatus[lead.status] = (stats.byStatus[lead.status] || 0) + 1;

    // Count qualified
    if (lead.is_qualified) {
      stats.qualified++;
    }

    // Count today's follow-ups
    if (lead.next_followup_at) {
      const followupDate = new Date(lead.next_followup_at).toISOString().split('T')[0];
      if (followupDate === today) {
        stats.todayFollowups++;
      }
    }
  });

  return stats;
};

