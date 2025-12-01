import { FastifyInstance } from 'fastify';
import {
  getDashboardStatsController,
  getQualifiedLeadsForReviewController,
  updateQualifiedLeadFlagsAdminController,
} from '../controllers/admin.controller';
import { authorize } from '../middleware/authGuard';

export const adminRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/admin/stats', {
    preHandler: [authorize(['Admin', 'CRE_TL'])],
  }, getDashboardStatsController);

  fastify.get('/admin/qualified-leads', {
    preHandler: [authorize(['Admin', 'CRE_TL'])],
  }, getQualifiedLeadsForReviewController);

  fastify.patch('/admin/qualified-leads/:leadId/status', {
    preHandler: [authorize(['Admin', 'CRE_TL'])],
  }, updateQualifiedLeadFlagsAdminController);
};
