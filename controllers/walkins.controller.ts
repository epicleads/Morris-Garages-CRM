import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { findCustomerWithLeadsByPhone, createOrAttachWalkInLead, WalkInLeadPayload } from '../services/walkins.service';

type AuthenticatedRequest = FastifyRequest & {
  authUser?: {
    id: number;
    role: string;
  };
};

const customerByPhoneQuerySchema = z.object({
  phone: z.string().min(3, 'Phone number is required')
});

const createWalkInSchema = z.object({
  phone: z.string().min(3, 'Phone number is required'),
  fullName: z.string().max(200).nullable().optional(),
  branchId: z.coerce.number().int().positive(),
  rmMemberId: z.coerce.number().int().positive().optional(),
  sourceId: z.coerce.number().int().positive().optional(),
  model: z.string().max(200).nullable().optional(),
  variant: z.string().max(200).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  remarks: z.string().max(1000).nullable().optional()
});

/**
 * GET /customers/by-phone?phone=...
 * Used by Receptionist to quickly see if a customer already exists
 * and what leads they have across branches.
 */
export const getCustomerByPhoneController = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const query = customerByPhoneQuerySchema.parse(request.query);

    const result = await findCustomerWithLeadsByPhone(query.phone);

    return reply.send(result);
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(400).send({ message: error.message || 'Failed to fetch customer details' });
  }
};

/**
 * POST /walkins/create
 *
 * Creates a new walk-in lead for (customer, branch) OR
 * attaches the visit to an existing open lead in that branch.
 *
 * Business rules:
 * - If no customer exists → create customer + new lead
 * - If customer exists but no open lead in branch → create new lead
 * - If open lead exists in branch → log "walk_in_again" and return existing lead
 */
export const createWalkInLeadController = async (request: AuthenticatedRequest, reply: FastifyReply) => {
  try {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const body = createWalkInSchema.parse(request.body);

    const payload: WalkInLeadPayload = {
      phone: body.phone,
      fullName: body.fullName,
      branchId: body.branchId,
      rmMemberId: body.rmMemberId,
      sourceId: body.sourceId,
      model: body.model,
      variant: body.variant,
      location: body.location,
      remarks: body.remarks
    };

    const result = await createOrAttachWalkInLead(
      {
        id: user.id,
        role: user.role as any
      } as any,
      payload
    );

    return reply.status(result.created ? 201 : 200).send(result);
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(400).send({ message: error.message || 'Failed to handle walk-in lead' });
  }
};


