import { supabaseAdmin } from '../config/supabase';
import { SafeUser } from '../types/user';

export interface RmLeadListFilters {
  status?: string[]; // e.g. ['Pending', 'Qualified']
  dateFrom?: string;
  dateTo?: string;
  branchId?: number;
}

interface BranchMemberRow {
  id: number;
  branch_id: number;
}

const STATUS_BOOKED = 'Booked';

const getRmBranchMembers = async (user: SafeUser): Promise<BranchMemberRow[]> => {
  const { data, error } = await supabaseAdmin
    .from('branch_members')
    .select('id, branch_id')
    .eq('user_id', user.id)
    .eq('role', 'RM')
    .eq('is_active', true);

  if (error) {
    throw new Error(`Failed to fetch RM branch members: ${error.message}`);
  }

  return (data as BranchMemberRow[]) || [];
};

export const listRmLeads = async (user: SafeUser, filters: RmLeadListFilters) => {
  if (user.role !== 'RM' && !user.isDeveloper && user.role !== 'CRE_TL' && user.role !== 'Admin') {
    throw new Error('Permission denied: Only RM / TL / Admin / Developer can access RM leads');
  }

  const rmMembers = await getRmBranchMembers(user);

  if (!user.isDeveloper && !rmMembers.length) {
    return { leads: [], total: 0 };
  }

  const rmMemberIds = rmMembers.map((m) => m.id);

  // Fetch qualifications for this RM (and optional branch filter)
  let qualQuery = supabaseAdmin
    .from('leads_qualification')
    .select(
      `
      id,
      lead_id,
      branch_id,
      next_followup_at,
      remarks,
      qualified_category,
      TEST_DRIVE,
      BOOKED,
      RETAILED,
      rm_id,
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
    );

  if (!user.isDeveloper && user.role === 'RM') {
    qualQuery = qualQuery.in('rm_id', rmMemberIds);
  }

  if (filters.branchId) {
    qualQuery = qualQuery.eq('branch_id', filters.branchId);
  }

  const { data: qualRows, error: qualError } = await qualQuery;

  if (qualError) {
    throw new Error(`Failed to fetch RM leads: ${qualError.message}`);
  }

  let rows = (qualRows || []) as any[];

  // Apply status filter in memory (status on leads_master)
  if (filters.status && filters.status.length > 0) {
    const allowed = new Set(filters.status);
    rows = rows.filter((row) => row.leads_master && allowed.has(row.leads_master.status));
  }

  // Apply date range filter (by created_at)
  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const to = filters.dateTo ? new Date(filters.dateTo) : null;
    rows = rows.filter((row) => {
      const created = row.leads_master?.created_at ? new Date(row.leads_master.created_at) : null;
      if (!created) return false;
      if (from && created < from) return false;
      if (to && created > to) return false;
      return true;
    });
  }

  // Extract lead IDs for booking/retail flags
  const leadIds = rows.map((r) => r.leads_master?.id).filter(Boolean);

  let bookingsByLead = new Set<number>();
  let pendingBookingsByLead = new Set<number>();
  let approvedBookingsByLead = new Set<number>();
  let retailsByLead = new Set<number>();

  if (leadIds.length > 0) {
    const { data: bookingRows } = await supabaseAdmin
      .from('bookings')
      .select('lead_id, status')
      .in('lead_id', leadIds);

    (bookingRows || []).forEach((b: any) => {
      if (!b.lead_id) return;
      bookingsByLead.add(b.lead_id);
      if (b.status === 'pending_approval') {
        pendingBookingsByLead.add(b.lead_id);
      } else if (b.status === 'approved') {
        approvedBookingsByLead.add(b.lead_id);
      }
    });

    const { data: retailRows } = await supabaseAdmin
      .from('retails')
      .select('lead_id, status')
      .in('lead_id', leadIds);

    (retailRows || []).forEach((r: any) => {
      if (r.lead_id) retailsByLead.add(r.lead_id);
    });
  }

  const leads = rows.map((row) => {
    const lead = row.leads_master;
    return {
      id: lead.id,
      customer_id: lead.customer_id,
      full_name: lead.full_name,
      phone_number_normalized: lead.phone_number_normalized,
      status: lead.status,
      branch_id: lead.branch_id,
      source_id: lead.source_id,
      created_at: lead.created_at,
      latest_followup_at: row.next_followup_at,
      next_followup_at: row.next_followup_at,
      // RM stage is driven by qualification.qualified_category (Pending / Need Some Time / Qualified / Disqualified)
      rm_stage: row.qualified_category || null,
      has_booking: bookingsByLead.has(lead.id),
      has_retail: retailsByLead.has(lead.id),
      has_pending_booking: pendingBookingsByLead.has(lead.id),
      has_approved_booking: approvedBookingsByLead.has(lead.id)
    };
  });

  return {
    leads,
    total: leads.length
  };
};

export const getRmLeadDetail = async (user: SafeUser, leadId: number) => {
  if (user.role !== 'RM' && !user.isDeveloper && user.role !== 'CRE_TL' && user.role !== 'Admin') {
    throw new Error('Permission denied: Only RM / TL / Admin / Developer can access RM lead detail');
  }

  const rmMembers = await getRmBranchMembers(user);
  const rmMemberIds = rmMembers.map((m) => m.id);

  const { data: qualification, error: qualError } = await supabaseAdmin
    .from('leads_qualification')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (qualError) {
    throw new Error(`Failed to fetch qualification: ${qualError.message}`);
  }

  if (!qualification) {
    throw new Error('Qualification not found for this lead');
  }

  // Ensure RM owns this lead (unless Developer / TL / Admin)
  if (!user.isDeveloper && user.role === 'RM' && !rmMemberIds.includes(qualification.rm_id)) {
    throw new Error('Access denied: This lead does not belong to you');
  }

  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads_master')
    .select('*')
    .eq('id', leadId)
    .maybeSingle();

  if (leadError || !lead) {
    throw new Error('Lead not found');
  }

  const customerId = lead.customer_id;
  let customer = null;
  if (customerId) {
    const { data: customerRow } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .maybeSingle();
    customer = customerRow || null;
  }

  const { data: logs } = await supabaseAdmin
    .from('leads_logs')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  const { data: testDrives } = await supabaseAdmin
    .from('test_drives')
    .select('*')
    .eq('lead_id', leadId)
    .order('start_time', { ascending: false });

  const { data: bookings } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  return {
    lead,
    customer,
    qualification,
    logs: logs || [],
    testDrives: testDrives || [],
    bookings: bookings || []
  };
};

export interface RmQualificationUpdateInput {
  age_group?: string | null;
  gender?: string | null;
  income_group?: string | null;
  profession?: string | null;
  buying_for?: string | null;
  daily_running_km?: number | null;
  current_car_details?: string | null;
  buyer_type?: string | null;
  evaluation_required?: boolean | null;
  old_car_details?: string | null;
  old_car_expected_price?: number | null;
  existing_mg_customer?: boolean | null;
  family_members_count?: number | null;
  next_followup_at?: string | null;
  remarks?: string | null;
  // RM stage / category: 'Pending' | 'Need Some Time' | 'Qualified' | 'Disqualified'
  qualified_category?: string | null;
  model_interested?: string | null;
  variant?: string | null;
  customer_location?: string | null;
  purchase_timeline?: string | null;
  finance_type?: string | null;
}

export const updateRmQualification = async (
  user: SafeUser,
  leadId: number,
  input: RmQualificationUpdateInput
) => {
  if (user.role !== 'RM' && !user.isDeveloper && user.role !== 'CRE_TL' && user.role !== 'Admin') {
    throw new Error('Permission denied: Only RM / TL / Admin / Developer can update RM qualification');
  }

  const rmMembers = await getRmBranchMembers(user);
  const rmMemberIds = rmMembers.map((m) => m.id);

  const { data: existingQual, error: qualError } = await supabaseAdmin
    .from('leads_qualification')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (qualError) {
    throw new Error(`Failed to fetch qualification: ${qualError.message}`);
  }

  if (!existingQual) {
    throw new Error('Qualification not found for this lead');
  }

  if (!user.isDeveloper && user.role === 'RM' && !rmMemberIds.includes(existingQual.rm_id)) {
    throw new Error('Access denied: This lead does not belong to you');
  }

  const updateData: any = {
    updated_at: new Date().toISOString()
  };

  Object.assign(updateData, input);

  if (input.next_followup_at) {
    // Also update denormalized next_followup_at on leads_master
    await supabaseAdmin
      .from('leads_master')
      .update({ next_followup_at: input.next_followup_at })
      .eq('id', leadId);
  }

  const { data: updatedQual, error: updateError } = await supabaseAdmin
    .from('leads_qualification')
    .update(updateData)
    .eq('lead_id', leadId)
    .select('*')
    .single();

  if (updateError || !updatedQual) {
    throw new Error(`Failed to update qualification: ${updateError?.message}`);
  }

  // If RM has explicitly set a category, sync leads_master.is_qualified
  let categoryChangedSummary: string | null = null;
  if (typeof input.qualified_category === 'string') {
    const previousCategory = existingQual.qualified_category || null;
    const newCategory = input.qualified_category;
    const isQualified = newCategory === 'Qualified';

    await supabaseAdmin
      .from('leads_master')
      .update({ is_qualified: isQualified })
      .eq('id', leadId);

    if (previousCategory !== newCategory) {
      categoryChangedSummary = `Category: ${previousCategory || 'None'} → ${newCategory}`;
    }
  }

  // Build a richer remarks message
  const changes: string[] = [];
  if (categoryChangedSummary) changes.push(categoryChangedSummary);
  if (input.next_followup_at) {
    const oldFollowup = existingQual.next_followup_at
      ? new Date(existingQual.next_followup_at).toISOString()
      : 'None';
    const newFollowup = input.next_followup_at;
    changes.push(`Next follow-up: ${oldFollowup} → ${newFollowup}`);
  }

  const remarks =
    input.remarks ||
    (changes.length > 0 ? `RM updated qualification. ${changes.join(' | ')}` : 'RM updated qualification');

  // Log change
  await supabaseAdmin.from('leads_logs').insert({
    lead_id: leadId,
    old_status: existingQual.qualified_category || null,
    new_status: updatedQual.qualified_category || null,
    remarks,
    created_by: user.id,
    metadata: {
      event: 'rm_qualification_updated'
    }
  });

  return updatedQual;
};

export interface RmTestDriveInput {
  model: string;
  variant?: string;
  start_time: string;
  end_time: string;
  given_by_user_id?: number;
  remarks?: string;
}

export const createRmTestDrive = async (user: SafeUser, leadId: number, input: RmTestDriveInput) => {
  if (user.role !== 'RM' && !user.isDeveloper && user.role !== 'CRE_TL' && user.role !== 'Admin') {
    throw new Error('Permission denied: Only RM / TL / Admin / Developer can create test drives');
  }

  const rmMembers = await getRmBranchMembers(user);
  const rmMemberIds = rmMembers.map((m) => m.id);

  const { data: existingQual, error: qualError } = await supabaseAdmin
    .from('leads_qualification')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (qualError) {
    throw new Error(`Failed to fetch qualification: ${qualError.message}`);
  }

  if (!existingQual) {
    throw new Error('Qualification not found for this lead');
  }

  if (!user.isDeveloper && user.role === 'RM' && !rmMemberIds.includes(existingQual.rm_id)) {
    throw new Error('Access denied: This lead does not belong to you');
  }

  const { data: testDrive, error: insertError } = await supabaseAdmin
    .from('test_drives')
    .insert({
      lead_id: leadId,
      customer_id: existingQual.lead_id ? null : null, // customer already linked via lead
      branch_id: existingQual.branch_id || null,
      model: input.model,
      variant: input.variant || null,
      start_time: input.start_time,
      end_time: input.end_time,
      given_by_user_id: input.given_by_user_id || user.id,
      created_by_user_id: user.id,
      remarks: input.remarks || null
    })
    .select('*')
    .single();

  if (insertError || !testDrive) {
    throw new Error(`Failed to create test drive: ${insertError?.message}`);
  }

  await supabaseAdmin.from('leads_logs').insert({
    lead_id: leadId,
    old_status: null,
    new_status: 'Test Drive',
    remarks:
      input.remarks ||
      `Test drive logged by RM: ${input.model}${input.variant ? ` - ${input.variant}` : ''}`,
    created_by: user.id,
    metadata: {
      event: 'test_drive_booked',
      model: input.model,
      variant: input.variant,
      start_time: input.start_time,
      end_time: input.end_time
    }
  });

  return testDrive;
};

export interface RmBookingInput {
  vehicle_price: number;
  discounts_offered?: number;
  special_commitments?: string;
  booking_amount: number;
  payment_mode: string;
  transaction_details?: string;
  transaction_proof_url?: string;
  expected_delivery_date?: string;
  mode_of_purchase?: string;
}

export const createRmBooking = async (user: SafeUser, leadId: number, input: RmBookingInput) => {
  if (user.role !== 'RM' && !user.isDeveloper && user.role !== 'CRE_TL' && user.role !== 'Admin') {
    throw new Error('Permission denied: Only RM / TL / Admin / Developer can create bookings');
  }

  const rmMembers = await getRmBranchMembers(user);
  const rmMemberIds = rmMembers.map((m) => m.id);

  const { data: existingQual, error: qualError } = await supabaseAdmin
    .from('leads_qualification')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (qualError) {
    throw new Error(`Failed to fetch qualification: ${qualError.message}`);
  }

  if (!existingQual) {
    throw new Error('Qualification not found for this lead');
  }

  if (!user.isDeveloper && user.role === 'RM' && !rmMemberIds.includes(existingQual.rm_id)) {
    throw new Error('Access denied: This lead does not belong to you');
  }

  // Optional: block duplicate active bookings
  const { data: existingBookings } = await supabaseAdmin
    .from('bookings')
    .select('id, status')
    .eq('lead_id', leadId)
    .in('status', ['pending_approval', 'approved']);

  if (existingBookings && existingBookings.length > 0) {
    throw new Error('An active booking already exists for this lead');
  }

  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .insert({
      lead_id: leadId,
      qualification_id: existingQual.id,
      branch_id: existingQual.branch_id || null,
      rm_member_id: existingQual.rm_id || null,
      vehicle_price: input.vehicle_price,
      discounts_offered: input.discounts_offered ?? null,
      special_commitments: input.special_commitments ?? null,
      booking_amount: input.booking_amount,
      payment_mode: input.payment_mode,
      transaction_details: input.transaction_details ?? null,
      transaction_proof_url: input.transaction_proof_url ?? null,
      expected_delivery_date: input.expected_delivery_date || null,
      mode_of_purchase: input.mode_of_purchase || null,
      status: 'pending_approval',
      created_by_user_id: user.id
    })
    .select('*')
    .single();

  if (bookingError || !booking) {
    throw new Error(`Failed to create booking: ${bookingError?.message}`);
  }

  // Update qualification flags and lead status
  await supabaseAdmin
    .from('leads_qualification')
    .update({ BOOKED: true })
    .eq('id', existingQual.id);

  await supabaseAdmin
    .from('leads_master')
    .update({ status: STATUS_BOOKED })
    .eq('id', leadId);

  await supabaseAdmin.from('leads_logs').insert({
    lead_id: leadId,
    old_status: null,
    new_status: STATUS_BOOKED,
    remarks: `Booking created by RM. Amount: ${input.booking_amount}, Mode: ${input.payment_mode}`,
    created_by: user.id,
    metadata: {
      event: 'booking_created',
      booking_id: booking.id,
      vehicle_price: input.vehicle_price,
      booking_amount: input.booking_amount,
      payment_mode: input.payment_mode
    }
  });

  return booking;
};

export interface RmRetailInput {
  invoice_number?: string;
  invoice_date?: string;
  on_road_price?: number;
  remarks?: string;
}

export const createRmRetail = async (user: SafeUser, leadId: number, input: RmRetailInput) => {
  if (user.role !== 'RM' && !user.isDeveloper && user.role !== 'CRE_TL' && user.role !== 'Admin') {
    throw new Error('Permission denied: Only RM / TL / Admin / Developer can create retails');
  }

  const rmMembers = await getRmBranchMembers(user);
  const rmMemberIds = rmMembers.map((m) => m.id);

  const { data: existingQual, error: qualError } = await supabaseAdmin
    .from('leads_qualification')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (qualError) {
    throw new Error(`Failed to fetch qualification: ${qualError.message}`);
  }

  if (!existingQual) {
    throw new Error('Qualification not found for this lead');
  }

  if (!user.isDeveloper && user.role === 'RM' && !rmMemberIds.includes(existingQual.rm_id)) {
    throw new Error('Access denied: This lead does not belong to you');
  }

  // Ensure there is an approved booking for this lead
  const { data: approvedBookings, error: bookingFetchError } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('lead_id', leadId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (bookingFetchError) {
    throw new Error(`Failed to verify booking for retail: ${bookingFetchError.message}`);
  }

  if (!approvedBookings || approvedBookings.length === 0) {
    throw new Error('Cannot mark retail done until a booking is approved by GM.');
  }

  const approvedBooking = approvedBookings[0];

  // Ensure no existing active retail for this booking/lead
  const { data: existingRetail, error: retailFetchError } = await supabaseAdmin
    .from('retails')
    .select('id, status')
    .eq('lead_id', leadId)
    .eq('booking_id', approvedBooking.id)
    .in('status', ['pending_approval', 'approved'])
    .maybeSingle();

  if (retailFetchError) {
    throw new Error(`Failed to verify existing retail: ${retailFetchError.message}`);
  }

  if (existingRetail) {
    throw new Error('A retail record already exists for this booking.');
  }

  const { data: retail, error: retailError } = await supabaseAdmin
    .from('retails')
    .insert({
      booking_id: approvedBooking.id,
      lead_id: leadId,
      status: 'approved', // RM marks retail done → treat as completed
      invoice_number: input.invoice_number ?? null,
      invoice_date: input.invoice_date ? new Date(input.invoice_date) : null,
      on_road_price: input.on_road_price ?? null,
      remarks: input.remarks ?? null,
      created_by_user_id: user.id,
    })
    .select('*')
    .single();

  if (retailError || !retail) {
    throw new Error(`Failed to create retail: ${retailError?.message}`);
  }

  // Mark lead as Won and set RETAILED flag
  await supabaseAdmin
    .from('leads_master')
    .update({
      status: 'Won',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  await supabaseAdmin
    .from('leads_qualification')
    .update({
      RETAILED: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existingQual.id);

  // Auto-close other open leads for same customer in other branches
  if (approvedBooking.customer_id) {
    const { data: otherLeads } = await supabaseAdmin
      .from('leads_master')
      .select('id, branch_id, status')
      .eq('customer_id', approvedBooking.customer_id)
      .neq('id', leadId)
      .in('status', ['Open', 'Pending', 'Qualified', 'Booked']);

    if (otherLeads && otherLeads.length > 0) {
      const otherLeadIds = otherLeads.map((l: any) => l.id);
      await supabaseAdmin
        .from('leads_master')
        .update({
          status: 'Closed_due_to_sale_elsewhere',
          updated_at: new Date().toISOString(),
        })
        .in('id', otherLeadIds);

      for (const otherLead of otherLeads) {
        await supabaseAdmin.from('leads_logs').insert({
          lead_id: otherLead.id,
          old_status: otherLead.status,
          new_status: 'Closed_due_to_sale_elsewhere',
          remarks: `Lead closed because another branch retailed this customer (lead #${leadId}).`,
          created_by: user.id,
          metadata: {
            event: 'auto_closed_on_retail',
            winning_lead_id: leadId,
            winning_branch_id: existingQual.branch_id || null,
          },
        });
      }
    }
  }

  // Log retail completion on this lead
  await supabaseAdmin.from('leads_logs').insert({
    lead_id: leadId,
    old_status: approvedBooking.status,
    new_status: 'Won',
    remarks:
      input.remarks ||
      `Retail done by RM. Invoice: ${input.invoice_number || 'N/A'}, On-road: ${
        input.on_road_price ?? 'N/A'
      }`,
    created_by: user.id,
    metadata: {
      event: 'retail_done',
      booking_id: approvedBooking.id,
      retail_id: retail.id,
    },
  });

  return retail;
};


