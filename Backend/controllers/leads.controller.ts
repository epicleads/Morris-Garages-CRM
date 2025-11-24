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
});

const qualifyLeadSchema = z.object({
  qualifiedCategory: z.string().min(1, 'Qualified category is required'),
  modelInterested: z.string().optional(),
  variant: z.string().optional(),
  profession: z.string().optional(),
  customerLocation: z.string().optional(),
  purchaseTimeline: z.string().optional(),
  financeType: z.string().optional(),
  testdriveDate: z.string().date().optional(), // YYYY-MM-DD format
  exchangeVehicleMake: z.string().optional(),
  exchangeVehicleModel: z.string().optional(),
  exchangeVehicleYear: z.number().int().positive().max(2100).optional(),
  leadCategory: z.string().optional(),
  nextFollowupAt: z.string().datetime('nextFollowupAt is required and must be a valid ISO datetime (e.g., 2024-01-16T10:00:00Z)'),
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
 * Qualify lead
 * POST /leads/:id/qualify
 * 
 * Process:
 * 1. CRE marks lead as Qualified
 * 2. Opens qualification form
 * 3. Fills required fields (qualifiedCategory, nextFollowupAt)
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
    if (!body.qualifiedCategory || body.qualifiedCategory.trim() === '') {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: [{ field: 'qualifiedCategory', message: 'Qualified category is required' }],
      });
    }

    if (!body.nextFollowupAt) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: [{ field: 'nextFollowupAt', message: 'Next follow-up date is required' }],
      });
    }

    const qualification = await qualifyLead(user, id, body);
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

