import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import {
  createUserController,
  deleteUserController,
  listUsersController,
  updateUserController,
  getSystemLogsController,
  getErrorLogsController,
  getLogStatisticsController,
  getSystemHealthController,
  writeSystemLogController,
} from '../controllers/developer.controller';

const developerRoutes = async (fastify: FastifyInstance) => {
  fastify.register(async (instance) => {
    instance.addHook('preHandler', authorize(['Developer']));

    // User management routes
    instance.post('/developer/users', createUserController);
    instance.get('/developer/users', listUsersController);
    instance.patch('/developer/users/:id', updateUserController);
    instance.delete('/developer/users/:id', deleteUserController);

    // Developer panel routes
    instance.get('/developer/logs', getSystemLogsController);
    instance.get('/developer/errors', getErrorLogsController);
    instance.get('/developer/logs/statistics', getLogStatisticsController);
    instance.get('/developer/health', getSystemHealthController);
    instance.post('/developer/logs', writeSystemLogController);
  });
};

export default developerRoutes;

