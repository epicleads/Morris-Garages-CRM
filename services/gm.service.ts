import { supabaseAdmin } from '../config/supabase';
import { SafeUser } from '../types/user';

export interface GmBooking {
  id: number;
  lead_id: number;
  qualification_id: number | null;
  branch_id: number | null;
  rm_member_id: number | null;
  vehicle_price: number | null;
  discounts_offered: number | null;
  special_commitments: string | null;
  booking_amount: number | null;
  payment_mode: string | null;
  transaction_details: string | null;
  transaction_proof_url: string | null;
  expected_delivery_date: string | null;
  mode_of_purchase: string | null;
  status: string;
  gm_approved_by: number | null;
  gm_approved_at: string | null;
  gm_remarks: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  lead?: {
    id: number;
    customer_id: number | null;
    full_name: string;
    phone_number_normalized: string;
    status: string;
    branch_id: number | null;
  };
  branch?: {
    id: number;
    name: string;
  };
  rm_member?: {
    id: number;
    contact_name: string;
    user_id: number;
  };
  customer?: {
    id: number;
    full_name: string | null;
    phone_number_normalized: string;
    email: string | null;
    city: string | null;
  };
}

export interface GmRetail {
  id: number;
  booking_id: number;
  lead_id: number;
  status: string;
  invoice_number: string | null;
  invoice_date: string | null;
  on_road_price: number | null;
  remarks: string | null;
  gm_approved_by: number | null;
  gm_approved_at: string | null;
  gm_remarks: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  booking?: GmBooking;
  lead?: {
    id: number;
    customer_id: number | null;
    full_name: string;
    phone_number_normalized: string;
    status: string;
  };
  customer?: {
    id: number;
    full_name: string | null;
    phone_number_normalized: string;
  };
}

export interface CustomerJourney {
  customer: {
    id: number;
    full_name: string | null;
    phone_number_normalized: string;
    email: string | null;
    city: string | null;
  };
  leads: Array<{
    id: number;
    full_name: string;
    phone_number_normalized: string;
    status: string;
    branch_id: number | null;
    source_id: number | null;
    created_at: string;
    updated_at: string;
    branch?: { id: number; name: string };
    source?: { id: number; display_name: string };
    qualification?: {
      id: number;
      rm_id: number | null;
      tl_id: number | null;
      qualified_category: string | null;
      model_interested: string | null;
      variant: string | null;
    };
    rm_member?: { id: number; contact_name: string };
    test_drives?: Array<{
      id: number;
      model: string | null;
      variant: string | null;
      start_time: string;
      end_time: string;
    }>;
    bookings?: Array<{
      id: number;
      status: string;
      vehicle_price: number | null;
      booking_amount: number | null;
      created_at: string;
    }>;
    retails?: Array<{
      id: number;
      status: string;
      invoice_number: string | null;
      on_road_price: number | null;
      created_at: string;
    }>;
  }>;
}

export interface GmReminderInput {
  bookingId: number;
  message: string;
  toRm?: boolean;
  toTl?: boolean;
}

export interface GmSentReminder {
  id: number;
  type: string;
  title: string | null;
  message: string | null;
  status: string;
  created_at: string;
  read_at: string | null;
  target_user?: {
    user_id: number;
    full_name: string | null;
    role: string | null;
  } | null;
  lead?: {
    id: number;
    full_name: string;
    phone_number_normalized: string;
  } | null;
  booking?: {
    id: number;
    status: string;
  } | null;
}

export interface GmRmLeadSummary {
  id: number;
  customer_id: number | null;
  full_name: string;
  phone_number_normalized: string;
  status: string;
  branch_id: number | null;
  branch_name?: string | null;
  created_at: string;
  next_followup_at: string | null;
  rm_stage: string | null;
  has_booking: boolean;
  has_retail: boolean;
  has_pending_booking: boolean;
  has_approved_booking: boolean;
}

/**
 * Get bookings for GM approval
 */
export const getGmBookings = async (
  user: SafeUser,
  filters?: { status?: string }
): Promise<GmBooking[]> => {
  if (user.role !== 'GM' && !user.isDeveloper && user.role !== 'Admin') {
    throw new Error('Permission denied: Only GM / Admin / Developer can access bookings');
  }

  let query = supabaseAdmin
    .from('bookings')
    .select(
      `
      *,
      leads_master (
        id,
        customer_id,
        full_name,
        phone_number_normalized,
        status,
        branch_id
      ),
      branches (
        id,
        name
      ),
      branch_members (
        id,
        contact_name,
        user_id
      )
    `
    )
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch bookings: ${error.message}`);
  }

  // Enrich with customer data
  const bookings = (data || []) as any[];
  const customerIds = [...new Set(bookings.map((b) => b.leads_master?.customer_id).filter(Boolean))];

  let customers: any[] = [];
  if (customerIds.length > 0) {
    const { data: customerData } = await supabaseAdmin
      .from('customers')
      .select('*')
      .in('id', customerIds);
    customers = customerData || [];
  }

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  return bookings.map((b: any) => ({
    // base booking fields
    ...b,
    // normalize joined relations to match frontend expectations
    lead: b.leads_master || null,
    branch: b.branches || null,
    rm_member: b.branch_members || null,
    customer: b.leads_master?.customer_id
      ? customerMap.get(b.leads_master.customer_id)
      : null,
  }));
};

/**
 * Approve a booking
 */
export const approveGmBooking = async (
  user: SafeUser,
  bookingId: number,
  remarks?: string
): Promise<void> => {
  if (user.role !== 'GM' && !user.isDeveloper && user.role !== 'Admin') {
    throw new Error('Permission denied: Only GM / Admin / Developer can approve bookings');
  }

  // Get booking with lead info
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .select('*, leads_master(customer_id, id, status)')
    .eq('id', bookingId)
    .single();

  if (bookingError || !booking) {
    throw new Error(`Booking not found: ${bookingError?.message || 'Unknown error'}`);
  }

  const lead = (booking as any).leads_master;
  if (!lead) {
    throw new Error('Lead not found for booking');
  }

  // Update booking status
  const { error: updateError } = await supabaseAdmin
    .from('bookings')
    .update({
      status: 'approved',
      gm_approved_by: user.id,
      gm_approved_at: new Date().toISOString(),
      gm_remarks: remarks || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId);

  if (updateError) {
    throw new Error(`Failed to approve booking: ${updateError.message}`);
  }

  // Mark lead as Booked (but NOT Won yet – won is set when RM marks retail done)
  await supabaseAdmin
    .from('leads_master')
    .update({
      status: 'Booked',
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id);

  // Update qualification BOOKED flag
  await supabaseAdmin
    .from('leads_qualification')
    .update({
      BOOKED: true,
      updated_at: new Date().toISOString(),
    })
    .eq('lead_id', lead.id);

  // Create notification for RM/TL (if needed)
  // This is extended in sendGmReminderForBooking
};

/**
 * Reject a booking
 */
export const rejectGmBooking = async (
  user: SafeUser,
  bookingId: number,
  remarks: string
): Promise<void> => {
  if (user.role !== 'GM' && !user.isDeveloper && user.role !== 'Admin') {
    throw new Error('Permission denied: Only GM / Admin / Developer can reject bookings');
  }

  const { error } = await supabaseAdmin
    .from('bookings')
    .update({
      status: 'rejected',
      gm_approved_by: user.id,
      gm_approved_at: new Date().toISOString(),
      gm_remarks: remarks,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId);

  if (error) {
    throw new Error(`Failed to reject booking: ${error.message}`);
  }
};

/**
 * Create reminder notifications for RM / TL for a specific booking.
 * Used by GM from the approvals screen.
 */
export const sendGmReminderForBooking = async (
  user: SafeUser,
  input: GmReminderInput
): Promise<void> => {
  if (user.role !== 'GM' && !user.isDeveloper && user.role !== 'Admin') {
    throw new Error('Permission denied: Only GM / Admin / Developer can send reminders');
  }

  const { bookingId, message, toRm = true, toTl = false } = input;

  // Fetch booking to get lead and RM member
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .select('id, lead_id, rm_member_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingError || !booking) {
    throw new Error(`Booking not found for reminder: ${bookingError?.message || 'Unknown error'}`);
  }

  const leadId = (booking as any).lead_id as number | null;
  const rmMemberId = (booking as any).rm_member_id as number | null;

  if (!rmMemberId) {
    throw new Error('Cannot send reminder: booking is not linked to an RM member');
  }

  // Resolve RM member
  const { data: rmMember, error: rmError } = await supabaseAdmin
    .from('branch_members')
    .select('id, user_id, manager_id')
    .eq('id', rmMemberId)
    .maybeSingle();

  if (rmError || !rmMember) {
    throw new Error(`Failed to resolve RM member for reminder: ${rmError?.message || 'Unknown error'}`);
  }

  // Resolve TL (manager of RM) if requested
  let tlUserId: number | null = null;
  if (toTl && rmMember.manager_id) {
    const { data: tlMember } = await supabaseAdmin
      .from('branch_members')
      .select('user_id')
      .eq('id', rmMember.manager_id)
      .maybeSingle();
    tlUserId = tlMember?.user_id ?? null;
  }

  const notificationsPayload: any[] = [];

  if (toRm && rmMember.user_id) {
    notificationsPayload.push({
      user_id: rmMember.user_id,
      type: 'gm_reminder_rm',
      title: 'GM Reminder - Booking',
      message,
      related_lead_id: leadId,
      related_booking_id: bookingId,
      status: 'unread',
    });
  }

  if (toTl && tlUserId) {
    notificationsPayload.push({
      user_id: tlUserId,
      type: 'gm_reminder_tl',
      title: 'GM Reminder - Team Booking',
      message,
      related_lead_id: leadId,
      related_booking_id: bookingId,
      status: 'unread',
    });
  }

  if (!notificationsPayload.length) {
    // Nothing to send (e.g. missing user mappings)
    return;
  }

  const { error: notifError } = await supabaseAdmin
    .from('notifications')
    .insert(notificationsPayload);

  if (notifError) {
    throw new Error(`Failed to create reminders: ${notifError.message}`);
  }
};

/**
 * List all leads for a specific RM member, for GM reminder workflow.
 */
export const getRmLeadsForReminder = async (
  user: SafeUser,
  rmMemberId: number
): Promise<GmRmLeadSummary[]> => {
  if (user.role !== 'GM' && !user.isDeveloper && user.role !== 'Admin') {
    throw new Error('Permission denied: Only GM / Admin / Developer can view RM leads for reminders');
  }

  // Fetch qualifications for this RM and join basic lead + branch info
  const { data, error } = await supabaseAdmin
    .from('leads_qualification')
    .select(
      `
      id,
      lead_id,
      branch_id,
      next_followup_at,
      qualified_category,
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
        created_at,
        next_followup_at
      ),
      branches:branch_id (
        id,
        name
      )
    `
    )
    .eq('rm_id', rmMemberId);

  if (error) {
    throw new Error(`Failed to fetch RM leads for reminders: ${error.message}`);
  }

  const rows = (data || []) as any[];

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

  const leads: GmRmLeadSummary[] = rows.map((row: any) => {
    const lead = row.leads_master;
    const branch = row.branches;
    return {
      id: lead.id,
      customer_id: lead.customer_id,
      full_name: lead.full_name,
      phone_number_normalized: lead.phone_number_normalized,
      status: lead.status,
      branch_id: lead.branch_id,
      branch_name: branch?.name ?? null,
      created_at: lead.created_at,
      next_followup_at: row.next_followup_at || lead.next_followup_at || null,
      rm_stage: row.qualified_category || null,
      has_booking: bookingsByLead.has(lead.id),
      has_retail: retailsByLead.has(lead.id),
      has_pending_booking: pendingBookingsByLead.has(lead.id),
      has_approved_booking: approvedBookingsByLead.has(lead.id),
    };
  });

  // Newest first
  leads.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return leads;
};

/**
 * Send reminders for multiple leads of a given RM.
 */
export const sendGmReminderForLeads = async (
  user: SafeUser,
  params: { rmMemberId: number; leadIds: number[]; message: string; toRm?: boolean; toTl?: boolean }
): Promise<void> => {
  if (user.role !== 'GM' && !user.isDeveloper && user.role !== 'Admin') {
    throw new Error('Permission denied: Only GM / Admin / Developer can send reminders');
  }

  const { rmMemberId, leadIds, message, toRm = true, toTl = false } = params;

  if (!leadIds.length) return;

  const { data: rmMember, error: rmError } = await supabaseAdmin
    .from('branch_members')
    .select('id, user_id, manager_id')
    .eq('id', rmMemberId)
    .maybeSingle();

  if (rmError || !rmMember) {
    throw new Error(`Failed to resolve RM member for reminder: ${rmError?.message || 'Unknown error'}`);
  }

  let tlUserId: number | null = null;
  if (toTl && rmMember.manager_id) {
    const { data: tlMember } = await supabaseAdmin
      .from('branch_members')
      .select('user_id')
      .eq('id', rmMember.manager_id)
      .maybeSingle();
    tlUserId = tlMember?.user_id ?? null;
  }

  const notificationsPayload: any[] = [];

  for (const leadId of leadIds) {
    if (toRm && rmMember.user_id) {
      notificationsPayload.push({
        user_id: rmMember.user_id,
        type: 'gm_reminder_rm',
        title: 'GM Reminder - Lead',
        message,
        related_lead_id: leadId,
        related_booking_id: null,
        status: 'unread',
      });
    }
    if (toTl && tlUserId) {
      notificationsPayload.push({
        user_id: tlUserId,
        type: 'gm_reminder_tl',
        title: 'GM Reminder - Team Lead',
        message,
        related_lead_id: leadId,
        related_booking_id: null,
        status: 'unread',
      });
    }
  }

  if (!notificationsPayload.length) return;

  const { error } = await supabaseAdmin.from('notifications').insert(notificationsPayload);

  if (error) {
    throw new Error(`Failed to create reminders: ${error.message}`);
  }
};

/**
 * List all reminders sent by GM (or all reminders of GM-type if Admin/Developer).
 */
export const listGmReminders = async (user: SafeUser): Promise<GmSentReminder[]> => {
  if (user.role !== 'GM' && !user.isDeveloper && user.role !== 'Admin') {
    throw new Error('Permission denied: Only GM / Admin / Developer can view reminders');
  }

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select(
      `
      id,
      type,
      title,
      message,
      status,
      created_at,
      read_at,
      user_id,
      users!notifications_user_id_fkey (
        user_id,
        full_name,
        role
      ),
      leads_master:related_lead_id (
        id,
        full_name,
        phone_number_normalized
      ),
      bookings:related_booking_id (
        id,
        status
      )
    `
    )
    .in('type', ['gm_reminder_rm', 'gm_reminder_tl'])
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch reminders: ${error.message}`);
  }

  const rows = (data || []) as any[];

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    status: row.status,
    created_at: row.created_at,
    read_at: row.read_at,
    target_user: row.users || null,
    lead: row.leads_master || null,
    booking: row.bookings || null,
  }));
};

/**
 * Get retails for GM approval
 */
export const getGmRetails = async (
  user: SafeUser,
  filters?: { status?: string }
): Promise<GmRetail[]> => {
  if (user.role !== 'GM' && !user.isDeveloper && user.role !== 'Admin') {
    throw new Error('Permission denied: Only GM / Admin / Developer can access retails');
  }

  let query = supabaseAdmin
    .from('retails')
    .select(
      `
      *,
      bookings (*),
      leads_master (
        id,
        customer_id,
        full_name,
        phone_number_normalized,
        status
      )
    `
    )
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch retails: ${error.message}`);
  }

  // Enrich with customer data
  const retails = (data || []) as any[];
  const customerIds = [...new Set(retails.map((r) => r.leads_master?.customer_id).filter(Boolean))];

  let customers: any[] = [];
  if (customerIds.length > 0) {
    const { data: customerData } = await supabaseAdmin
      .from('customers')
      .select('*')
      .in('id', customerIds);
    customers = customerData || [];
  }

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  return retails.map((r: any) => ({
    ...r,
    customer: r.leads_master?.customer_id ? customerMap.get(r.leads_master.customer_id) : null,
  }));
};

/**
 * Approve a retail
 */
export const approveGmRetail = async (
  user: SafeUser,
  retailId: number,
  remarks?: string
): Promise<void> => {
  if (user.role !== 'GM' && !user.isDeveloper && user.role !== 'Admin') {
    throw new Error('Permission denied: Only GM / Admin / Developer can approve retails');
  }

  const { error } = await supabaseAdmin
    .from('retails')
    .update({
      status: 'approved',
      gm_approved_by: user.id,
      gm_approved_at: new Date().toISOString(),
      gm_remarks: remarks || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', retailId);

  if (error) {
    throw new Error(`Failed to approve retail: ${error.message}`);
  }

  // Update qualification RETAILED flag
  const { data: retail } = await supabaseAdmin
    .from('retails')
    .select('lead_id')
    .eq('id', retailId)
    .single();

  if (retail) {
    await supabaseAdmin
      .from('leads_qualification')
      .update({
        RETAILED: true,
        updated_at: new Date().toISOString(),
      })
      .eq('lead_id', retail.lead_id);
  }
};

/**
 * Reject a retail
 */
export const rejectGmRetail = async (
  user: SafeUser,
  retailId: number,
  remarks: string
): Promise<void> => {
  if (user.role !== 'GM' && !user.isDeveloper && user.role !== 'Admin') {
    throw new Error('Permission denied: Only GM / Admin / Developer can reject retails');
  }

  const { error } = await supabaseAdmin
    .from('retails')
    .update({
      status: 'rejected',
      gm_approved_by: user.id,
      gm_approved_at: new Date().toISOString(),
      gm_remarks: remarks,
      updated_at: new Date().toISOString(),
    })
    .eq('id', retailId);

  if (error) {
    throw new Error(`Failed to reject retail: ${error.message}`);
  }
};

/**
 * Get complete customer journey across all branches
 */
export const getCustomerJourney = async (
  user: SafeUser,
  customerId: number
): Promise<CustomerJourney> => {
  if (user.role !== 'GM' && !user.isDeveloper && user.role !== 'Admin') {
    throw new Error('Permission denied: Only GM / Admin / Developer can view customer journey');
  }

  // Get customer
  const { data: customer, error: customerError } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single();

  if (customerError || !customer) {
    throw new Error(`Customer not found: ${customerError?.message || 'Unknown error'}`);
  }

  // Get all leads for this customer
  const { data: leads, error: leadsError } = await supabaseAdmin
    .from('leads_master')
    .select(
      `
      *,
      branches (id, name),
      sources (id, display_name)
    `
    )
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (leadsError) {
    throw new Error(`Failed to fetch leads: ${leadsError.message}`);
  }

  const leadIds = (leads || []).map((l) => l.id);

  // Get qualifications, test drives, bookings, retails for all leads
  const [qualifications, testDrives, bookings, retails] = await Promise.all([
    supabaseAdmin
      .from('leads_qualification')
      .select(
        `
        id,
        lead_id,
        rm_id,
        tl_id,
        qualified_category,
        model_interested,
        variant,
        branch_members (id, contact_name)
      `
      )
      .in('lead_id', leadIds),
    supabaseAdmin
      .from('test_drives')
      .select('id, lead_id, model, variant, start_time, end_time')
      .in('lead_id', leadIds),
    supabaseAdmin
      .from('bookings')
      .select('id, lead_id, status, vehicle_price, booking_amount, created_at')
      .in('lead_id', leadIds),
    supabaseAdmin
      .from('retails')
      .select('id, lead_id, status, invoice_number, on_road_price, created_at')
      .in('lead_id', leadIds),
  ]);

  // Organize data by lead
  const qualMap = new Map(
    (qualifications.data || []).map((q: any) => [q.lead_id, q])
  );
  const testDriveMap = new Map<number, any[]>();
  (testDrives.data || []).forEach((td: any) => {
    if (!testDriveMap.has(td.lead_id)) {
      testDriveMap.set(td.lead_id, []);
    }
    testDriveMap.get(td.lead_id)!.push(td);
  });
  const bookingMap = new Map<number, any[]>();
  (bookings.data || []).forEach((b: any) => {
    if (!bookingMap.has(b.lead_id)) {
      bookingMap.set(b.lead_id, []);
    }
    bookingMap.get(b.lead_id)!.push(b);
  });
  const retailMap = new Map<number, any[]>();
  (retails.data || []).forEach((r: any) => {
    if (!retailMap.has(r.lead_id)) {
      retailMap.set(r.lead_id, []);
    }
    retailMap.get(r.lead_id)!.push(r);
  });

  const enrichedLeads = (leads || []).map((lead: any) => {
    const qual = qualMap.get(lead.id);
    return {
      ...lead,
      qualification: qual || null,
      rm_member: qual?.branch_members || null,
      test_drives: testDriveMap.get(lead.id) || [],
      bookings: bookingMap.get(lead.id) || [],
      retails: retailMap.get(lead.id) || [],
    };
  });

  return {
    customer: customer as any,
    leads: enrichedLeads,
  };
};

