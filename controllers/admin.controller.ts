import { FastifyReply, FastifyRequest } from 'fastify';
import { getDashboardStats, assignLeadsToCre } from '../services/admin.service';

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
