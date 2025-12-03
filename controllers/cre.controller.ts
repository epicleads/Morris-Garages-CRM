import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  getCreDashboardSummary,
  updateLeadQualification,
  UpdateLeadQualificationInput,
  getFreshUntouchedLeads,
  getFreshCalledLeads,
  getTodaysFollowupsLeads,
  getPendingLeads,
  getQualifiedLeads,
  getWonLeads,
  getLostLeads,
  getFilterCounts,
  markLeadUnqualified,
  MarkUnqualifiedInput,
  markLeadPending,
  MarkPendingInput,
  updateQualifiedLeadStatus,
  getLeadQualification,
  createVerificationCall,
  VerificationCallInput,
} from '../services/cre.service';

export const getCreDashboardSummaryController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = request.authUser;

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  const summary = await getCreDashboardSummary(user.id);
  return reply.send(summary);
};

// Validation schema for update lead qualification
const updateLeadQualificationSchema = z.object({
  lead_id: z.coerce.number().int().positive(),
  qualified_category: z.string().min(1, 'Qualified category is required'),
  model_interested: z.string().min(1, 'Model is required'),
  variant: z.string().min(1, 'Variant is required'),
  profession: z.string().nullable().optional(),
  customer_location: z.string().nullable().optional(),
  purchase_timeline: z.string().nullable().optional(),
  finance_type: z.string().nullable().optional(),
  testdrive_date: z.string().date().nullable().optional(), // YYYY-MM-DD format
  exchange_vehicle_make: z.string().nullable().optional(),
  exchange_vehicle_model: z.string().nullable().optional(),
  exchange_vehicle_year: z.coerce.number().int().positive().max(2100).nullable().optional(),
  lead_category: z.string().min(1, 'Lead category is required'),
  next_followup_at: z.string().datetime('nextFollowupAt is required and must be a valid ISO datetime'),
  remarks: z.string().min(1, 'Remarks is required'),
  qualified_by: z.coerce.number().int().positive(),
});

export const updateLeadController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = request.authUser;

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  try {
    // Validate request body
    const body = updateLeadQualificationSchema.parse(request.body);
    const leadId = body.lead_id;

    // Verify qualified_by matches the authenticated user
    if (body.qualified_by !== user.id) {
      return reply.status(403).send({
        message: 'You can only qualify leads as yourself',
      });
    }

    // Map request body to service input
    const input: UpdateLeadQualificationInput = {
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

    const qualification = await updateLeadQualification(user, leadId, input);

    return reply.send({
      message: 'Lead qualification updated successfully',
      qualification,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation error',
        errors: error.errors,
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to update lead qualification',
    });
  }
};

// Validation schema for filtered leads queries
const filteredLeadsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

// Get Fresh Leads - Untouched
export const getFreshUntouchedLeadsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = request.authUser;

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const query = filteredLeadsQuerySchema.parse(request.query);
    const result = await getFreshUntouchedLeads(user.id, query);
    return reply.send(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation error',
        errors: error.errors,
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to fetch fresh untouched leads',
    });
  }
};

// Get Fresh Leads - Called
export const getFreshCalledLeadsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = request.authUser;

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const query = filteredLeadsQuerySchema.parse(request.query);
    const result = await getFreshCalledLeads(user.id, query);
    return reply.send(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation error',
        errors: error.errors,
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to fetch fresh called leads',
    });
  }
};

// Get Today's Follow-ups
export const getTodaysFollowupsLeadsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = request.authUser;

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const query = filteredLeadsQuerySchema.parse(request.query);
    const result = await getTodaysFollowupsLeads(user.id, query);
    return reply.send(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation error',
        errors: error.errors,
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to fetch today\'s follow-ups',
    });
  }
};

// Get Pending Leads
export const getPendingLeadsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = request.authUser;

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const query = filteredLeadsQuerySchema.parse(request.query);
    const result = await getPendingLeads(user.id, query);
    return reply.send(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation error',
        errors: error.errors,
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to fetch pending leads',
    });
  }
};

// Get Qualified Leads
export const getQualifiedLeadsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = request.authUser;

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const query = filteredLeadsQuerySchema.parse(request.query);
    const result = await getQualifiedLeads(user.id, query);
    return reply.send(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation error',
        errors: error.errors,
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to fetch qualified leads',
    });
  }
};

// Get Won Leads
export const getWonLeadsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = request.authUser;

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const query = filteredLeadsQuerySchema.parse(request.query);
    const result = await getWonLeads(user.id, query);
    return reply.send(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation error',
        errors: error.errors,
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to fetch won leads',
    });
  }
};

// Get Lost Leads
export const getLostLeadsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = request.authUser;

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const query = filteredLeadsQuerySchema.parse(request.query);
    const result = await getLostLeads(user.id, query);
    return reply.send(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation error',
        errors: error.errors,
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to fetch lost leads',
    });
  }
};

// Get Filter Counts
export const getFilterCountsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = request.authUser;

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const counts = await getFilterCounts(user.id);
    return reply.send(counts);
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to fetch filter counts',
    });
  }
};

// Validation schema for mark unqualified
const markUnqualifiedSchema = z.object({
  lead_id: z.coerce.number().int().positive(),
  status: z.string().min(1, 'Status (reason lost) is required'),
  remarks: z.string().nullable().optional(),
});

export const markUnqualifiedController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = request.authUser;

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const body = markUnqualifiedSchema.parse(request.body);
    const result = await markLeadUnqualified(user.id, body);
    return reply.send(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation error',
        errors: error.errors,
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to mark lead as unqualified',
    });
  }
};

// Validation schema for mark pending
const markPendingSchema = z.object({
  lead_id: z.coerce.number().int().positive(),
  next_followup_at: z.string().datetime('next_followup_at is required and must be a valid ISO datetime'),
  remarks: z.string().nullable().optional(),
});

export const markPendingController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = request.authUser;

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const body = markPendingSchema.parse(request.body);
    const result = await markLeadPending(user.id, body);
    return reply.send(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation error',
        errors: error.errors,
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to mark lead as pending',
    });
  }
};



// Validation schema for update qualified lead status
const updateQualifiedLeadStatusSchema = z.object({
  lead_id: z.coerce.number().int().positive(),
  test_drive: z.boolean(),
  booked: z.boolean(),
  retailed: z.boolean(),
});

export const updateQualifiedLeadStatusController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = request.authUser;

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  try {
    request.log.info(
      { body: request.body },
      'updateQualifiedLeadStatusController: incoming payload'
    );

    const body = updateQualifiedLeadStatusSchema.parse(request.body);
    request.log.info(
      { userId: user.id, leadId: body.lead_id, body },
      'updateQualifiedLeadStatusController: parsed payload'
    );

    await updateQualifiedLeadStatus(user.id, body);
    request.log.info(
      { userId: user.id, leadId: body.lead_id },
      'updateQualifiedLeadStatusController: update successful'
    );
    return reply.send({ message: 'Qualified lead status updated successfully' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation error',
        errors: error.errors,
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to update qualified lead status',
    });
  }
};

// Validation schema for get lead qualification
const getLeadQualificationSchema = z.object({
  lead_id: z.coerce.number().int().positive(),
});

export const getLeadQualificationController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = request.authUser;

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const params = getLeadQualificationSchema.parse(request.params);
    const result = await getLeadQualification(user.id, params.lead_id);
    return reply.send(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation error',
        errors: error.errors,
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to fetch lead qualification details',
    });
  }
};

// Validation schema for verification call
const verificationCallSchema = z.object({
  lead_id: z.coerce.number().int().positive(),
  // High-level dropdown outcome, e.g. 'RNR', 'Call Disconnected', 'Still Thinking', etc.
  call_outcome: z.string().min(1, 'Call outcome is required'),
  remarks: z.string().min(1, 'Remarks is required'),
  next_followup_at: z.string().datetime().nullable().optional(),
  test_drive: z.boolean().optional(),
  booked: z.boolean().optional(),
  retailed: z.boolean().optional(),
});

export const createVerificationCallController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const user = request.authUser;

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  try {
    const body = verificationCallSchema.parse(request.body);
    
    const input: VerificationCallInput = {
      lead_id: body.lead_id,
      call_outcome: body.call_outcome,
      remarks: body.remarks,
      next_followup_at: body.next_followup_at ?? null,
      test_drive: body.test_drive ?? false,
      booked: body.booked ?? false,
      retailed: body.retailed ?? false,
    };

    await createVerificationCall(user.id, input);
    return reply.send({ message: 'Verification call recorded successfully' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation error',
        errors: error.errors,
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to create verification call',
    });
  }
};
