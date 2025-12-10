import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import {
  startImpersonationController,
  endImpersonationController,
  getActiveSessionController,
  getHistoryController,
} from '../controllers/impersonation.controller';

const impersonationRoutes = async (fastify: FastifyInstance) => {
  // All routes require authentication
  fastify.register(async (instance) => {
    // Start impersonation - only Admin/CRE_TL
    instance.post(
      '/impersonation/start',
      {
        preHandler: authorize(['Admin', 'CRE_TL']),
      },
      startImpersonationController
    );

    // End impersonation - can be called by anyone with active session
    instance.post('/impersonation/end', endImpersonationController);

    // Get active session
    instance.get('/impersonation/active', getActiveSessionController);

    // Get history - only Admin/CRE_TL
    instance.get(
      '/impersonation/history',
      {
        preHandler: authorize(['Admin', 'CRE_TL']),
      },
      getHistoryController
    );
  });
};

export default impersonationRoutes;

