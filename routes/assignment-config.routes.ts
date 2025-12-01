import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import {
  getAutoAssignConfigsBySourceController,
  saveAutoAssignConfigController,
  deleteAutoAssignConfigController,
  runAutoAssignController,
  getTeleinAssignmentsController,
  assignTeleinController,
} from '../controllers/assignment-config.controller';

const assignmentConfigRoutes = async (fastify: FastifyInstance) => {
  fastify.register(async (instance) => {
    instance.addHook('preHandler', authorize());

    // Auto-assign configuration routes
    instance.get('/auto-assign-configs/by-source', getAutoAssignConfigsBySourceController);
    instance.post('/auto-assign-configs', saveAutoAssignConfigController);
    instance.delete('/auto-assign-configs', deleteAutoAssignConfigController);
    instance.post('/admin/auto-assign/run', runAutoAssignController);

    // Tele-In assignment routes
    instance.get('/admin/telein-assignments', getTeleinAssignmentsController);
    instance.post('/admin/telein-assign', assignTeleinController);
  });
};

export default assignmentConfigRoutes;
