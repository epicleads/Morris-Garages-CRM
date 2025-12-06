import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import {
  getDashboardMetricsController,
  getSourceDistributionController,
  getCrePerformanceController,
  getBranchDistributionController,
  getQualificationDistributionController,
  getTopPerformingCresController,
  getConversionFunnelController,
} from '../controllers/analytics.controller';

const analyticsRoutes = async (fastify: FastifyInstance) => {
  // All analytics routes require authentication
  fastify.register(async (instance) => {
    instance.addHook('preHandler', authorize(['Admin', 'CRE_TL']));

    // Dashboard metrics
    instance.get('/analytics/dashboard', getDashboardMetricsController);

    // Source distribution
    instance.get('/analytics/sources', getSourceDistributionController);

    // CRE performance
    instance.get('/analytics/cre-performance', getCrePerformanceController);

    // Branch distribution
    instance.get('/analytics/branches', getBranchDistributionController);

    // Qualification category distribution
    instance.get('/analytics/qualification-categories', getQualificationDistributionController);

    // Top performing CREs
    instance.get('/analytics/top-cres', getTopPerformingCresController);

    // Conversion funnel
    instance.get('/analytics/funnel', getConversionFunnelController);
  });
};

export default analyticsRoutes;

