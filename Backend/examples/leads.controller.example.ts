/**
 * EXAMPLE: Leads Controller with Role-Based Access Control
 * 
 * This is an example showing how to use the permission system
 * and query helpers in your leads controllers.
 * 
 * Copy and adapt this pattern when creating your actual leads.controller.ts
 */

import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { buildLeadsQuery, buildTodaysFollowupsQuery } from '../services/queryHelpers';
import { checkLeadAccess } from '../middleware/roleGuard';
import { canReassignLeads, canBulkAssignLeads } from '../services/permissions.service';

// ============================================================
// LIST LEADS (automatically filtered by role)
// ============================================================
const listLeadsSchema = z.object({
  status: z.enum(['New', 'Assigned', 'Working', 'Pending', 'Qualified', 'FollowUp', 'Booked', 'Booked-Retail', 'Lost', 'Disqualified', 'Closed']).optional(),
  sourceId: z.coerce.number().optional(),
  assignedTo: z.coerce.number().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50)
});

export const listLeadsController = async (request: FastifyRequest, reply: FastifyReply) => {
  const user = request.authUser!;
  const queryParams = listLeadsSchema.parse(request.query);

  // Build query with role-based filtering (CRE sees only assigned, CRE_TL/Dev see all)
  let query = buildLeadsQuery(supabaseAdmin, user);

  // Apply additional filters
  if (queryParams.status) {
    query = query.eq('status', queryParams.status);
  }

  if (queryParams.sourceId) {
    query = query.eq('source_id', queryParams.sourceId);
  }

  // CRE_TL can filter by assigned_to, CRE cannot (they only see their own)
  if (queryParams.assignedTo && (user.role === 'CRE_TL' || user.isDeveloper)) {
    query = query.eq('assigned_to', queryParams.assignedTo);
  }

  // Pagination
  const offset = (queryParams.page - 1) * queryParams.limit;
  query = query.range(offset, offset + queryParams.limit - 1);

  // Order by created_at desc
  query = query.order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    return reply.status(500).send({ message: 'Failed to fetch leads', error: error.message });
  }

  return reply.send({
    leads: data,
    pagination: {
      page: queryParams.page,
      limit: queryParams.limit,
      total: count || 0
    }
  });
};

// ============================================================
// GET SINGLE LEAD (with access check)
// ============================================================
export const getLeadController = async (request: FastifyRequest, reply: FastifyReply) => {
  const user = request.authUser!;
  const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
  const { id } = paramsSchema.parse(request.params);

  // Fetch lead
  const { data: lead, error } = await supabaseAdmin
    .from('leads_master')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !lead) {
    return reply.status(404).send({ message: 'Lead not found' });
  }

  // Check if user can access this lead
  if (!checkLeadAccess(user, lead.assigned_to)) {
    return reply.status(403).send({ message: 'Access denied: You can only view leads assigned to you' });
  }

  // Fetch related data (logs, qualification, attachments)
  const [logs, qualification, attachments] = await Promise.all([
    supabaseAdmin.from('leads_logs').select('*').eq('lead_id', id).order('created_at', { ascending: false }),
    supabaseAdmin.from('leads_qualification').select('*').eq('lead_id', id).maybeSingle(),
    supabaseAdmin.from('lead_attachments').select('*').eq('lead_id', id)
  ]);

  return reply.send({
    lead,
    logs: logs.data || [],
    qualification: qualification.data,
    attachments: attachments.data || []
  });
};

// ============================================================
// ASSIGN/REASSIGN LEAD (requires permission)
// ============================================================
const assignLeadSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1),
  assignedTo: z.number().int().positive()
});

export const assignLeadController = async (request: FastifyRequest, reply: FastifyReply) => {
  const user = request.authUser!;
  const body = assignLeadSchema.parse(request.body);

  // Check permission
  if (!canReassignLeads(user)) {
    return reply.status(403).send({ message: 'Permission denied: Only Team Leads can reassign leads' });
  }

  // Verify target user exists and is CRE
  const { data: targetUser } = await supabaseAdmin
    .from('users')
    .select('user_id, role, status')
    .eq('user_id', body.assignedTo)
    .single();

  if (!targetUser || targetUser.role !== 'CRE' || !targetUser.status) {
    return reply.status(400).send({ message: 'Invalid target user: Must be an active CRE' });
  }

  // Update leads
  const { data, error } = await supabaseAdmin
    .from('leads_master')
    .update({
      assigned_to: body.assignedTo,
      assigned_at: new Date().toISOString(),
      status: 'Assigned'
    })
    .in('id', body.leadIds)
    .select();

  if (error) {
    return reply.status(500).send({ message: 'Failed to assign leads', error: error.message });
  }

  // Log assignment activity
  // TODO: Create activity logs for reassignments

  return reply.send({
    message: `Successfully assigned ${data?.length || 0} lead(s)`,
    leads: data
  });
};

// ============================================================
// UPDATE LEAD STATUS (CRE can update own, CRE_TL can update any)
// ============================================================
const updateStatusSchema = z.object({
  status: z.enum(['Working', 'Pending', 'Qualified', 'Disqualified', 'Lost']),
  remarks: z.string().optional(),
  attemptNo: z.number().int().positive().optional(),
  nextFollowupAt: z.string().datetime().optional()
});

export const updateLeadStatusController = async (request: FastifyRequest, reply: FastifyReply) => {
  const user = request.authUser!;
  const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
  const { id } = paramsSchema.parse(request.params);
  const body = updateStatusSchema.parse(request.body);

  // Fetch current lead
  const { data: lead, error: fetchError } = await supabaseAdmin
    .from('leads_master')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !lead) {
    return reply.status(404).send({ message: 'Lead not found' });
  }

  // Check access
  if (!checkLeadAccess(user, lead.assigned_to)) {
    return reply.status(403).send({ message: 'Access denied' });
  }

  // Update lead status
  const updateData: any = {
    status: body.status,
    updated_at: new Date().toISOString()
  };

  if (body.nextFollowupAt) {
    updateData.next_followup_at = body.nextFollowupAt;
  }

  if (body.status === 'Pending' && !body.nextFollowupAt) {
    return reply.status(400).send({ message: 'nextFollowupAt is required for Pending status' });
  }

  const { data: updatedLead, error: updateError } = await supabaseAdmin
    .from('leads_master')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    return reply.status(500).send({ message: 'Failed to update lead', error: updateError.message });
  }

  // Create lead log entry
  await supabaseAdmin.from('leads_logs').insert({
    lead_id: id,
    old_status: lead.status,
    new_status: body.status,
    remarks: body.remarks || null,
    attempt_no: body.attemptNo || (lead.total_attempts + 1),
    created_by: user.id,
    metadata: {
      next_followup_at: body.nextFollowupAt || null
    }
  });

  // Update total attempts
  await supabaseAdmin
    .from('leads_master')
    .update({ total_attempts: lead.total_attempts + 1 })
    .eq('id', id);

  return reply.send({
    message: 'Lead status updated successfully',
    lead: updatedLead
  });
};

// ============================================================
// GET TODAY'S FOLLOW-UPS (role-based)
// ============================================================
export const getTodaysFollowupsController = async (request: FastifyRequest, reply: FastifyReply) => {
  const user = request.authUser!;

  // Build query with role-based filtering
  const query = buildTodaysFollowupsQuery(supabaseAdmin, user);
  const { data, error } = await query.order('next_followup_at', { ascending: true });

  if (error) {
    return reply.status(500).send({ message: 'Failed to fetch follow-ups', error: error.message });
  }

  return reply.send({
    followups: data || [],
    count: data?.length || 0
  });
};

// ============================================================
// QUALIFY LEAD (CRE can qualify own leads)
// ============================================================
const qualifyLeadSchema = z.object({
  qualifiedCategory: z.string(),
  modelInterested: z.string().optional(),
  variant: z.string().optional(),
  profession: z.string().optional(),
  customerLocation: z.string().optional(),
  purchaseTimeline: z.string().optional(),
  financeType: z.string().optional(),
  testdriveDate: z.string().date().optional(),
  exchangeVehicleMake: z.string().optional(),
  exchangeVehicleModel: z.string().optional(),
  exchangeVehicleYear: z.number().int().optional(),
  leadCategory: z.string().optional(),
  qualifiedFor: z.array(z.string()).optional(), // ['Test Drive', 'Showroom Visit', 'More Details']
  tradeInDetails: z.string().optional(),
  nextFollowupAt: z.string().datetime(),
  remarks: z.string().optional()
});

export const qualifyLeadController = async (request: FastifyRequest, reply: FastifyReply) => {
  const user = request.authUser!;
  const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
  const { id } = paramsSchema.parse(request.params);
  const body = qualifyLeadSchema.parse(request.body);

  // Fetch lead
  const { data: lead, error: fetchError } = await supabaseAdmin
    .from('leads_master')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !lead) {
    return reply.status(404).send({ message: 'Lead not found' });
  }

  // Check access (CRE can only qualify own leads)
  if (!checkLeadAccess(user, lead.assigned_to)) {
    return reply.status(403).send({ message: 'Access denied' });
  }

  // Update lead status
  const { error: updateError } = await supabaseAdmin
    .from('leads_master')
    .update({
      status: 'Qualified',
      is_qualified: true,
      next_followup_at: body.nextFollowupAt,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (updateError) {
    return reply.status(500).send({ message: 'Failed to update lead', error: updateError.message });
  }

  // Create qualification record
  const { data: qualification, error: qualError } = await supabaseAdmin
    .from('leads_qualification')
    .insert({
      lead_id: id,
      qualified_category: body.qualifiedCategory,
      model_interested: body.modelInterested || null,
      variant: body.variant || null,
      profession: body.profession || null,
      customer_location: body.customerLocation || null,
      purchase_timeline: body.purchaseTimeline || null,
      finance_type: body.financeType || null,
      testdrive_date: body.testdriveDate || null,
      exchange_vehicle_make: body.exchangeVehicleMake || null,
      exchange_vehicle_model: body.exchangeVehicleModel || null,
      exchange_vehicle_year: body.exchangeVehicleYear || null,
      lead_category: body.leadCategory || null,
      qualified_for: body.qualifiedFor || null,
      trade_in_details: body.tradeInDetails || null,
      next_followup_at: body.nextFollowupAt,
      remarks: body.remarks || null,
      qualified_by: user.id,
      review_status: 'pending' // Awaiting TL review
    })
    .select()
    .single();

  if (qualError) {
    return reply.status(500).send({ message: 'Failed to create qualification', error: qualError.message });
  }

  // Create lead log
  await supabaseAdmin.from('leads_logs').insert({
    lead_id: id,
    old_status: lead.status,
    new_status: 'Qualified',
    remarks: body.remarks || 'Lead qualified',
    created_by: user.id
  });

  return reply.send({
    message: 'Lead qualified successfully',
    qualification
  });
};

