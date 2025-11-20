import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import {
  createUserController,
  deleteUserController,
  listUsersController,
  updateUserController
} from '../controllers/developer.controller';

const developerRoutes = async (fastify: FastifyInstance) => {
  fastify.register(async (instance) => {
    instance.addHook('preHandler', authorize(['Developer']));

    instance.post('/developer/users', createUserController);
    instance.get('/developer/users', listUsersController);
    instance.patch('/developer/users/:id', updateUserController);
    instance.delete('/developer/users/:id', deleteUserController);
  });
};

export default developerRoutes;

