import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import { getAllUsersController, createUserController, updateUserController } from '../controllers/users.controller';

const usersRoutes = async (fastify: FastifyInstance) => {
    // All routes require authentication
    fastify.register(async (instance) => {
        instance.addHook('preHandler', authorize());

        // Get all users (TL/Admin only)
        instance.get('/users', getAllUsersController);
        instance.post('/users', createUserController);
        instance.patch('/users/:id', updateUserController);
    });
};

export default usersRoutes;
