import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  listLeads,
  getLeadById,
  createLead,
  updateLeadStatus,
  qualifyLead,
  updateQualification,
  getTodaysFollowups,
  getLeadTimeline,
  getLeadStats,
  CreateLeadInput,
  UpdateLeadStatusInput,
  QualifyLeadInput,
} from '../services/leads.service';
import { importLeads, ImportLeadRow } from '../services/import.service';
import { canViewAllLeads } from '../services/permissions.service';

// Validation schemas
const listLeadsSchema = z.object({
  status: z.string().optional(),
  sourceId: z.coerce.number().optional(),
  assignedTo: z.coerce.number().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  filterType: z.enum(['today', 'mtd', 'custom', 'all']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().optional(),
});

const createLeadSchema = z.object({
  fullName: z.string().min(1).max(200),
  phoneNumber: z.string().min(10),
  alternatePhoneNumber: z.string().optional(),
  sourceId: z.coerce.number().optional(),
  externalLeadId: z.string().optional(),
  rawPayload: z.any().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum([
    'New',
    'Assigned',
    'Working',
    'Pending',
    'Qualified',
    'Disqualified',
    'Lost',
    'FollowUp',
    'Booked',
    'Booked-Retail',
    'Closed',
  ]),
  remarks: z.string().optional(),
  attemptNo: z.number().int().positive().optional(),
  callDuration: z.number().int().min(0).optional(),
  nextFollowupAt: z.string().datetime().optional(),
  pendingReason: z.string().optional(),
  disqualifyReason: z.string().optional(),
  assignedTo: z.coerce.number().int().positive().optional(),
});

const qualifyLeadSchema = z.object({
  qualified_category: z.string().min(1, 'Qualified category is required'),
  model_interested: z.string().optional(),
  variant: z.string().optional(),
  profession: z.string().optional(),
  customer_location: z.string().optional(),
  purchase_timeline: z.string().optional(),
  finance_type: z.string().optional(),
  testdrive_date: z.string().optional(), // YYYY-MM-DD format
  exchange_vehicle_make: z.string().optional(),
  exchange_vehicle_model: z.string().optional(),
  exchange_vehicle_year: z.coerce.number().int().positive().max(2100).optional(),
  lead_category: z.string().optional(),
  next_followup_at: z.string().datetime('next_followup_at is required and must be a valid ISO datetime (e.g., 2024-01-16T10:00:00Z)'),
  remarks: z.string().optional(),
});

// Schema for updating qualification (all fields optional - validation done manually)
const updateQualificationSchema = z.object({
  qualifiedCategory: z.string().min(1).optional(),
  modelInterested: z.string().optional(),
  variant: z.string().optional(),
  profession: z.string().optional(),
  customerLocation: z.string().optional(),
  purchaseTimeline: z.string().optional(),
  financeType: z.string().optional(),
  testdriveDate: z.string().date().optional(),
  exchangeVehicleMake: z.string().optional(),
  exchangeVehicleModel: z.string().optional(),
  exchangeVehicleYear: z.number().int().positive().max(2100).optional(),
  leadCategory: z.string().optional(),
  nextFollowupAt: z.string().datetime().optional(),
  remarks: z.string().optional(),
});

/**
 * Qualify lead
 * POST /leads/:id/qualify
 * 
 * Process:
 * 1. CRE marks lead as Qualified
 * 2. Opens qualification form
 * 3. Fills required fields (qualified_category, next_followup_at)
 * 4. Fills optional fields
 * 5. Creates qualification record in leads_qualification
 * 6. Updates leads_master (status, is_qualified, next_followup_at, total_attempts)
 * 7. Creates lead_log entry for history
 */
export const qualifyLeadController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);
    const body = qualifyLeadSchema.parse(request.body);

    // Validate required fields
    if (!body.qualified_category || body.qualified_category.trim() === '') {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: [{ field: 'qualified_category', message: 'Qualified category is required' }],
      });
    }

    if (!body.next_followup_at) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: [{ field: 'next_followup_at', message: 'Next follow-up date is required' }],
      });
    }

    // Map snake_case body to camelCase service input
    const serviceInput: QualifyLeadInput = {
      qualifiedCategory: body.qualified_category,
      modelInterested: body.model_interested,
      variant: body.variant,
      profession: body.profession,
      customerLocation: body.customer_location,
      purchaseTimeline: body.purchase_timeline,
      financeType: body.finance_type,
      testdriveDate: body.testdrive_date,
      exchangeVehicleMake: body.exchange_vehicle_make,
      exchangeVehicleModel: body.exchange_vehicle_model,
      exchangeVehicleYear: body.exchange_vehicle_year,
      leadCategory: body.lead_category,
      nextFollowupAt: body.next_followup_at,
      remarks: body.remarks,
    };

    const qualification = await qualifyLead(user, id, serviceInput);
    return reply.send({
      message: 'Lead qualified successfully',
      qualification,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    if (error.message === 'Lead not found' || error.message.includes('Access denied')) {
      return reply.status(404).send({ message: error.message });
    }
    if (error.message.includes('required') || error.message.includes('not qualified yet') || error.message.includes('already qualified')) {
      return reply.status(400).send({ message: error.message });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to qualify lead',
    });
  }
};

/**
 * List leads with filters
 * GET /leads
 */
export const listLeadsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const filters = listLeadsSchema.parse(request.query);
    const result = await listLeads(user, filters);
    return reply.send(result);
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to list leads',
    });
  }
};

/**
 * Get single lead with timeline
 * GET /leads/:id
 */
export const getLeadController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);

    const lead = await getLeadById(user, id);
    const timeline = await getLeadTimeline(user, id);

    return reply.send({
      lead,
      timeline: timeline.timeline,
      summary: timeline.summary,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error.message === 'Lead not found' || error.message.includes('Access denied')) {
      return reply.status(404).send({ message: error.message });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to get lead',
    });
  }
};

/**
 * Create lead (Admin/CRE_TL only)
 * POST /leads
 */
export const createLeadController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;

    if (!canViewAllLeads(user)) {
      return reply.status(403).send({
        message: 'Permission denied: Only Team Leads can create leads',
      });
    }

    const body = createLeadSchema.parse(request.body);
    const lead = await createLead(user, body);
    return reply.status(201).send({
      message: 'Lead created successfully',
      lead,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    if (error.message.includes('already exists')) {
      return reply.status(409).send({ message: error.message });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to create lead',
    });
  }
};

/**
 * Update lead status
 * PATCH /leads/:id/status
 */
export const updateLeadStatusController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);
    const body = updateStatusSchema.parse(request.body);

    const updatedLead = await updateLeadStatus(user, id, body);
    return reply.send({
      message: 'Lead status updated successfully',
      lead: updatedLead,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    if (error.message.includes('required')) {
      return reply.status(400).send({ message: error.message });
    }
    if (error.message === 'Lead not found' || error.message.includes('Access denied')) {
      return reply.status(404).send({ message: error.message });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to update lead status',
    });
  }
};

/**
 * Update qualification
 * PATCH /leads/:id/qualification
 * 
 * Updates existing qualification record
 */
export const updateQualificationController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);

    // Debug: Log the raw request body
    console.log('=== UPDATE QUALIFICATION DEBUG ===');
    console.log('Request body type:', typeof request.body);
    console.log('Request body:', JSON.stringify(request.body, null, 2));
    console.log('Request body keys:', request.body ? Object.keys(request.body) : 'null/undefined');
    console.log('Request body values:', request.body ? Object.values(request.body) : 'null/undefined');

    // Check if body exists
    if (!request.body) {
      console.log('ERROR: Request body is null/undefined');
      return reply.status(400).send({
        message: 'Validation failed',
        errors: [{ field: 'body', message: 'Request body is required. At least one field must be provided for update.' }],
      });
    }

    // Check if body is empty object
    if (typeof request.body === 'object' && Object.keys(request.body).length === 0) {
      console.log('ERROR: Request body is empty object');
      return reply.status(400).send({
        message: 'Validation failed',
        errors: [{ field: 'body', message: 'Request body cannot be empty. At least one field must be provided for update.' }],
      });
    }

    // Parse and validate body
    console.log('Attempting to parse body with Zod schema...');
    let body;
    try {
      body = updateQualificationSchema.parse(request.body);
      console.log('Parsed body:', JSON.stringify(body, null, 2));
      console.log('Parsed body keys:', Object.keys(body));
      console.log('Parsed body values:', Object.values(body));
    } catch (parseError: any) {
      console.log('Zod parse error:', parseError);
      console.log('Zod parse error details:', JSON.stringify(parseError.errors, null, 2));
      throw parseError;
    }

    // Check if at least one field has a value
    const hasValue = Object.values(body).some(value => value !== undefined && value !== null && value !== '');
    console.log('Has at least one value:', hasValue);
    console.log('All values:', Object.values(body));

    if (!hasValue) {
      console.log('ERROR: No fields with values found');
      return reply.status(400).send({
        message: 'Validation failed',
        errors: [{ field: 'body', message: 'At least one field must be provided with a value for update.' }],
      });
    }

    console.log('Validation passed, calling updateQualification service...');

    const qualification = await updateQualification(user, id, body);
    console.log('Update successful, qualification:', qualification?.id);
    console.log('=== END DEBUG ===');
    return reply.send({
      message: 'Qualification updated successfully',
      qualification,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    if (error.message === 'Lead not found' || error.message.includes('Access denied')) {
      return reply.status(404).send({ message: error.message });
    }
    if (error.message.includes('required') || error.message.includes('not qualified yet')) {
      return reply.status(400).send({ message: error.message });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to update qualification',
    });
  }
};

/**
 * Get today's follow-ups
 * GET /leads/followups/today
 */
export const getTodaysFollowupsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const followups = await getTodaysFollowups(user);
    return reply.send({
      followups,
      count: followups.length,
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to fetch follow-ups',
    });
  }
};

/**
 * Get lead timeline/history
 * GET /leads/:id/timeline
 */
export const getLeadTimelineController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);

    const timeline = await getLeadTimeline(user, id);
    return reply.send(timeline);
  } catch (error: any) {
    request.log.error(error);
    if (error.message === 'Lead not found' || error.message.includes('Access denied')) {
      return reply.status(404).send({ message: error.message });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to fetch timeline',
    });
  }
};

/**
 * Get lead statistics
 * GET /leads/stats
 */
export const getLeadStatsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const filters = listLeadsSchema.parse(request.query);
    const stats = await getLeadStats(user, filters);
    return reply.send(stats);
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to fetch statistics',
    });
  }
};

/**
 * Import leads from CSV/Excel
 * POST /leads/import
 */
export const importLeadsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;

    // Only TL and Admin can import leads
    if (!canViewAllLeads(user)) {
      return reply.status(403).send({
        message: 'Permission denied: Only Team Leads can import leads',
      });
    }

    // Validate request body
    const importLeadSchema = z.object({
      leads: z.array(
        z.object({
          full_name: z.string().min(1),
          phone_number_normalized: z.string().min(1),
          source: z.string().min(1),
          sub_source: z.string().min(1),
        })
      ).min(1).max(1000),
    });

    const body = importLeadSchema.parse(request.body);

    // Call import service
    const result = await importLeads(user, body.leads);

    return reply.send({
      message: result.success
        ? 'All leads imported successfully'
        : 'Import completed with some errors',
      result,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to import leads',
    });
  }
};

/**
 * Get unassigned leads summary grouped by source
 * GET /leads/unassigned
 */
export const getUnassignedLeadsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;

    // Check permissions
    if (!canViewAllLeads(user)) {
      return reply.status(403).send({
        message: 'Permission denied: Only Team Leads and Admins can view unassigned leads',
      });
    }

    const { supabaseAdmin } = await import('../config/supabase');

    // Get unassigned leads with source information and raw_payload for sub_source
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads_master')
      .select(`
        id,
        source_id,
        raw_payload,
        sources (
          id,
          display_name
        )
      `)
      .is('assigned_to', null);

    if (leadsError) {
      request.log.error(leadsError);
      return reply.status(500).send({
        message: `Failed to fetch unassigned leads: ${leadsError.message}`,
      });
    }

    // Group by source + sub_source combination
    const by_source: Record<string, number> = {};
    let total_unassigned = 0;

    leads?.forEach((lead: any) => {
      const sourceName = lead.sources?.display_name || 'Unknown';

      // Extract sub_source from raw_payload
      let subSource: string | null = null;
      if (lead.raw_payload && typeof lead.raw_payload === 'object') {
        subSource = lead.raw_payload.sub_source || lead.raw_payload.subsource || null;
      }

      // Create source key: "SourceName" or "SourceName + SubSource"
      const sourceKey = subSource ? `${sourceName} + ${subSource}` : sourceName;

      by_source[sourceKey] = (by_source[sourceKey] || 0) + 1;
      total_unassigned++;
    });

    return reply.send({
      by_source,
      total_unassigned,
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to fetch unassigned leads',
    });
  }
};

/**
 * Get unassigned leads grouped by source with source names
 * GET /leads/unassigned/by-source
 * Returns: [{ source_id: number, source_name: string, total_unassigned_leads: number }]
 */
export const getUnassignedLeadsGroupedBySourceController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;

    // Check permissions
    if (!canViewAllLeads(user)) {
      return reply.status(403).send({
        message: 'Permission denied: Only Team Leads and Admins can view unassigned leads',
      });
    }

    const { supabaseAdmin } = await import('../config/supabase');

    // Use Supabase query builder with join to get unassigned leads grouped by source
    const { data: leadsData, error: leadsError } = await supabaseAdmin
      .from('leads_master')
      .select(`
        source_id,
        sources!inner(
          id,
          display_name
        )
      `)
      .is('assigned_to', null)
      .eq('status', 'New');

    if (leadsError) {
      request.log.error(leadsError);
      return reply.status(500).send({
        message: `Failed to fetch unassigned leads by source: ${leadsError.message}`,
      });
    }

    // Group by source_id and count
    const groupedBySource: Record<string, { source_id: number; source_name: string; total_unassigned: number }> = {};

    leadsData?.forEach((lead: any) => {
      const sourceName = lead.sources?.display_name || 'Unknown';
      const sourceId = lead.source_id;

      if (!groupedBySource[sourceName]) {
        groupedBySource[sourceName] = {
          source_id: sourceId,
          source_name: sourceName,
          total_unassigned: 0,
        };
      }

      groupedBySource[sourceName].total_unassigned++;
    });

    // Convert to array sorted by total_unassigned DESC
    const result = Object.values(groupedBySource).sort((a, b) =>
      b.total_unassigned - a.total_unassigned
    );

    return reply.send(result);
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to fetch unassigned leads by source',
    });
  }
};

/**
 * Get unassigned leads for a specific source by source name
 * GET /leads/unassigned/:source
 */
export const getUnassignedLeadsBySourceController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;

    // Check permissions
    if (!canViewAllLeads(user)) {
      return reply.status(403).send({
        message: 'Permission denied: Only Team Leads and Admins can view unassigned leads',
      });
    }

    const paramsSchema = z.object({
      source: z.string(),
    });
    const { source } = paramsSchema.parse(request.params);

    const { supabaseAdmin } = await import('../config/supabase');

    // Handle source names that might include " + SubSource"
    const [sourceName, subSource] = source.includes(' + ')
      ? source.split(' + ', 2).map((s) => s.trim())
      : [source, null];

    // First, find the source by display_name
    const { data: sourceRecord, error: sourceError } = await supabaseAdmin
      .from('sources')
      .select('id, display_name')
      .eq('display_name', sourceName)
      .maybeSingle();

    if (sourceError || !sourceRecord) {
      return reply.status(404).send({
        message: `Source "${sourceName}" not found`,
      });
    }

    // Build query for unassigned leads from this source
    let query = supabaseAdmin
      .from('leads_master')
      .select(`
        id,
        full_name,
        phone_number_normalized,
        source_id,
        created_at,
        raw_payload,
        sources (
          id,
          display_name
        )
      `)
      .eq('source_id', sourceRecord.id)
      .is('assigned_to', null);

    const { data: leads, error: leadsError } = await query;

    if (leadsError) {
      request.log.error(leadsError);
      return reply.status(500).send({
        message: `Failed to fetch unassigned leads: ${leadsError.message}`,
      });
    }

    // Transform to expected format
    let transformedLeads = (leads || []).map((lead: any) => {
      // Extract sub_source from raw_payload if it exists, otherwise null
      let leadSubSource: string | null = null;
      if (lead.raw_payload && typeof lead.raw_payload === 'object') {
        leadSubSource = lead.raw_payload.sub_source || lead.raw_payload.subsource || null;
      }

      return {
        id: String(lead.id),
        uid: String(lead.id),
        customer_name: lead.full_name || '',
        customer_mobile_number: lead.phone_number_normalized || '',
        source: lead.sources?.display_name || sourceName,
        sub_source: leadSubSource,
        created_at: lead.created_at || new Date().toISOString(),
      };
    });

    // If sub_source filtering was requested, filter leads
    if (subSource) {
      const expectedSubSourceNormalized = subSource.trim();
      transformedLeads = transformedLeads.filter((lead) => {
        const leadSubSourceNormalized = (lead.sub_source || '').trim();
        return leadSubSourceNormalized === expectedSubSourceNormalized;
      });
    }

    return reply.send(transformedLeads);
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to fetch unassigned leads by source',
    });
  }
};

