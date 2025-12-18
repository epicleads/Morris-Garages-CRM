import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import { getTlDashboardController, getTlTeamLeadsController } from '../controllers/tl.controller';

const tlRoutes = async (fastify: FastifyInstance) => {
  fastify.register(async (instance) => {
    // Only RM_TL, Admin, CRE_TL, Developer can access these routes
    instance.addHook('preHandler', authorize(['RM_TL', 'Admin', 'CRE_TL', 'Developer'] as const));

    instance.get('/tl/dashboard', getTlDashboardController);
    instance.get('/tl/team-leads', getTlTeamLeadsController);
  });
};

export default tlRoutes;

