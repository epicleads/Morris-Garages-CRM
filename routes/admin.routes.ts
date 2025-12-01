import { FastifyInstance } from 'fastify';
import { getDashboardStatsController } from '../controllers/admin.controller';
import { authorize } from '../middleware/authGuard';

export const adminRoutes = async (fastify: FastifyInstance) => {
    fastify.get('/admin/stats', { preHandler: [authorize(['Admin', 'CRE_TL'])] }, getDashboardStatsController);
};
