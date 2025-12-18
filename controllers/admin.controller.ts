import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  getDashboardStats,
  assignLeadsToCre,
  getQualifiedLeadsForReview,
  updateQualifiedLeadFlagsAdmin,
  listVehicleModels,
  createVehicleModel,
  updateVehicleModel,
  listVehicleVariants,
  createVehicleVariant,
  updateVehicleVariant,
  listLocations,
  createLocation,
  updateLocation,
  listPendingReasons,
  createPendingReason,
  updatePendingReason,
  listUnqualifiedReasons,
  createUnqualifiedReason,
  updateUnqualifiedReason,
} from '../services/admin.service';

export const getDashboardStatsController = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const stats = await getDashboardStats();
        return reply.send(stats);
    } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ message: 'Failed to fetch admin dashboard stats' });
    }
};

export const assignLeadsController = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const { leadIds, creId } = request.body as { leadIds: number[], creId: number };

        if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
            return reply.status(400).send({ message: 'Invalid leadIds provided' });
        }

        if (!creId) {
            return reply.status(400).send({ message: 'Invalid creId provided' });
        }

        const result = await assignLeadsToCre(leadIds, creId);
        return reply.send(result);
    } catch (error: any) {
        request.log.error(error);
        return reply.status(500).send({ message: error.message || 'Failed to assign leads' });
    }
};

export const getQualifiedLeadsForReviewController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    // authGuard already ensures Admin / CRE_TL roles; just fetch data
    const items = await getQualifiedLeadsForReview();
    return reply.send({ items });
  } catch (error: any) {
    request.log.error(error);
    return reply
      .status(500)
      .send({ message: error.message || 'Failed to fetch qualified leads for review' });
  }
};

export const updateQualifiedLeadFlagsAdminController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const leadId = Number((request.params as any).leadId);
    if (!leadId || Number.isNaN(leadId)) {
      return reply.status(400).send({ message: 'Invalid leadId' });
    }

    const { testDrive, booked, retailed } = request.body as {
      testDrive?: boolean | null;
      booked?: boolean | null;
      retailed?: boolean | null;
    };

    request.log.info(
      { leadId, body: request.body },
      'updateQualifiedLeadFlagsAdminController: incoming payload'
    );

    if (
      testDrive === undefined &&
      booked === undefined &&
      retailed === undefined
    ) {
      return reply.status(400).send({
        message: 'At least one of testDrive, booked, or retailed must be provided',
      });
    }

    await updateQualifiedLeadFlagsAdmin(leadId, { testDrive, booked, retailed });

    request.log.info(
      { leadId, testDrive, booked, retailed },
      'updateQualifiedLeadFlagsAdminController: update successful'
    );
    return reply.send({ message: 'Qualified lead flags updated successfully' });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to update qualified lead flags',
    });
  }
};

// ============================================================================
// Master Data Controllers (Admin-only; guarded in routes)
// ============================================================================

// 1. Vehicle Models
export const listVehicleModelsController = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const models = await listVehicleModels();
    return reply.send({ models });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: error.message || 'Failed to fetch vehicle models' });
  }
};

const createVehicleModelSchema = z.object({
  name: z.string().min(1),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().nullable().optional(),
});

export const createVehicleModelController = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const body = createVehicleModelSchema.parse(request.body);
    const model = await createVehicleModel({
      name: body.name,
      isActive: body.isActive,
      displayOrder: body.displayOrder ?? null,
    });
    return reply.status(201).send({ model });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to create vehicle model' });
  }
};

const updateVehicleModelSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().nullable().optional(),
});

export const updateVehicleModelController = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);
    const body = updateVehicleModelSchema.parse(request.body);

    const model = await updateVehicleModel(id, {
      name: body.name,
      isActive: body.isActive,
      displayOrder: body.displayOrder ?? null,
    });

    return reply.send({ model });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to update vehicle model' });
  }
};

// 2. Vehicle Variants
export const listVehicleVariantsController = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const querySchema = z.object({
      modelId: z.coerce.number().int().positive().optional(),
    });
    const query = querySchema.parse(request.query);
    const variants = await listVehicleVariants(query.modelId);
    return reply.send({ variants });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: error.message || 'Failed to fetch vehicle variants' });
  }
};

const createVehicleVariantSchema = z.object({
  modelId: z.coerce.number().int().positive(),
  name: z.string().min(1),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().nullable().optional(),
});

export const createVehicleVariantController = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const body = createVehicleVariantSchema.parse(request.body);
    const variant = await createVehicleVariant({
      modelId: body.modelId,
      name: body.name,
      isActive: body.isActive,
      displayOrder: body.displayOrder ?? null,
    });
    return reply.status(201).send({ variant });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to create vehicle variant' });
  }
};

const updateVehicleVariantSchema = z.object({
  modelId: z.coerce.number().int().positive().optional(),
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().nullable().optional(),
});

export const updateVehicleVariantController = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);
    const body = updateVehicleVariantSchema.parse(request.body);

    const variant = await updateVehicleVariant(id, {
      modelId: body.modelId,
      name: body.name,
      isActive: body.isActive,
      displayOrder: body.displayOrder ?? null,
    });

    return reply.send({ variant });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to update vehicle variant' });
  }
};

// 3. Locations
export const listLocationsController = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const querySchema = z.object({
      branchId: z.coerce.number().int().positive().optional(),
    });
    const query = querySchema.parse(request.query);
    const locations = await listLocations(query.branchId);
    return reply.send({ locations });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: error.message || 'Failed to fetch locations' });
  }
};

const createLocationSchema = z.object({
  name: z.string().min(1),
  city: z.string().nullable().optional(),
  branchId: z.coerce.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().nullable().optional(),
});

export const createLocationController = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const body = createLocationSchema.parse(request.body);
    const location = await createLocation({
      name: body.name,
      city: body.city ?? null,
      branchId: body.branchId ?? null,
      isActive: body.isActive,
      displayOrder: body.displayOrder ?? null,
    });
    return reply.status(201).send({ location });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to create location' });
  }
};

const updateLocationSchema = z.object({
  name: z.string().min(1).optional(),
  city: z.string().nullable().optional(),
  branchId: z.coerce.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().nullable().optional(),
});

export const updateLocationController = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);
    const body = updateLocationSchema.parse(request.body);

    const location = await updateLocation(id, {
      name: body.name,
      city: body.city ?? null,
      branchId: body.branchId ?? null,
      isActive: body.isActive,
      displayOrder: body.displayOrder ?? null,
    });

    return reply.send({ location });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to update location' });
  }
};

// 4. Pending Reasons
export const listPendingReasonsController = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const reasons = await listPendingReasons();
    return reply.send({ reasons });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: error.message || 'Failed to fetch pending reasons' });
  }
};

const createPendingReasonSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  appliesToStage: z.string().nullable().optional(),
});

export const createPendingReasonController = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const body = createPendingReasonSchema.parse(request.body);
    const reason = await createPendingReason({
      code: body.code,
      label: body.label,
      description: body.description ?? null,
      isActive: body.isActive,
      appliesToStage: body.appliesToStage ?? null,
    });
    return reply.status(201).send({ reason });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to create pending reason' });
  }
};

const updatePendingReasonSchema = z.object({
  code: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  appliesToStage: z.string().nullable().optional(),
});

export const updatePendingReasonController = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);
    const body = updatePendingReasonSchema.parse(request.body);

    const reason = await updatePendingReason(id, {
      code: body.code,
      label: body.label,
      description: body.description ?? null,
      isActive: body.isActive,
      appliesToStage: body.appliesToStage ?? null,
    });

    return reply.send({ reason });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to update pending reason' });
  }
};

// 5. Unqualified / Lost Reasons
export const listUnqualifiedReasonsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const reasons = await listUnqualifiedReasons();
    return reply.send({ reasons });
  } catch (error: any) {
    request.log.error(error);
    return reply
      .status(500)
      .send({ message: error.message || 'Failed to fetch unqualified reasons' });
  }
};

const createUnqualifiedReasonSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  appliesToStage: z.string().nullable().optional(),
});

export const createUnqualifiedReasonController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const body = createUnqualifiedReasonSchema.parse(request.body);
    const reason = await createUnqualifiedReason({
      code: body.code,
      label: body.label,
      description: body.description ?? null,
      category: body.category ?? null,
      isActive: body.isActive,
      appliesToStage: body.appliesToStage ?? null,
    });
    return reply.status(201).send({ reason });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply
      .status(500)
      .send({ message: error.message || 'Failed to create unqualified reason' });
  }
};

const updateUnqualifiedReasonSchema = z.object({
  code: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  appliesToStage: z.string().nullable().optional(),
});

export const updateUnqualifiedReasonController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);
    const body = updateUnqualifiedReasonSchema.parse(request.body);

    const reason = await updateUnqualifiedReason(id, {
      code: body.code,
      label: body.label,
      description: body.description ?? null,
      category: body.category ?? null,
      isActive: body.isActive,
      appliesToStage: body.appliesToStage ?? null,
    });

    return reply.send({ reason });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply
      .status(500)
      .send({ message: error.message || 'Failed to update unqualified reason' });
  }
};

