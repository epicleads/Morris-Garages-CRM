import { FastifyReply, FastifyRequest } from 'fastify';
import {
  getDashboardStats,
  assignLeadsToCre,
  getQualifiedLeadsForReview,
  updateQualifiedLeadFlagsAdmin,
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
