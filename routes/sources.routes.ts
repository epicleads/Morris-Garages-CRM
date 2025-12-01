import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import {
  getSourcesController,
  createSourceController,
  updateSourceController,
} from '../controllers/sources.controller';

const sourcesRoutes = async (fastify: FastifyInstance) => {
  fastify.register(async (instance) => {
    instance.addHook('preHandler', authorize());

    instance.get('/sources', getSourcesController);
    instance.post('/sources', createSourceController);
    instance.patch('/sources/:id', updateSourceController);
  });
};

export default sourcesRoutes;

