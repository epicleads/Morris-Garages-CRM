import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import { loginController, logoutController, profileController, refreshController } from '../controllers/auth.controller';

const authRoutes = async (fastify: FastifyInstance) => {
  fastify.post('/auth/login', loginController);
  fastify.post('/auth/refresh', refreshController);
  fastify.post('/auth/logout', logoutController);
  fastify.get('/auth/profile', { preHandler: authorize() }, profileController);
};

export default authRoutes;

