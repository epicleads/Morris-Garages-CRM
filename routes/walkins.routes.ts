import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import { getCustomerByPhoneController, createWalkInLeadController } from '../controllers/walkins.controller';

const walkinsRoutes = async (fastify: FastifyInstance) => {
  fastify.register(async (instance) => {
    // Receptionist is the primary role here, but Admin / CRE_TL / Developer can also use for testing.
    instance.addHook('preHandler', authorize(['Receptionist', 'Admin', 'CRE_TL', 'Developer']));

    instance.get('/customers/by-phone', getCustomerByPhoneController);
    instance.post('/walkins/create', createWalkInLeadController);
  });
};

export default walkinsRoutes;


