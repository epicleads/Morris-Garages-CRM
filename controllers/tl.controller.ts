import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getTlDashboard, getTlTeamLeads } from '../services/tl.service';

const getTlDashboardSchema = z.object({
  // No query params needed for now, but can add filters later
});

const getTlTeamLeadsSchema = z.object({
  rmMemberId: z.coerce.number().int().positive().optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const getTlDashboardController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const data = await getTlDashboard(user);
    return reply.send(data);
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: error.message || 'Failed to fetch TL dashboard' });
  }
};

export const getTlTeamLeadsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const filters = getTlTeamLeadsSchema.parse(request.query);
    const data = await getTlTeamLeads(user, filters);
    return reply.send(data);
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to fetch team leads' });
  }
};

