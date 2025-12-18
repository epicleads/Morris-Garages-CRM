import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import { getCustomerByPhoneController, createWalkInLeadController, createReceptionTestDriveController } from '../controllers/walkins.controller';
import { getReceptionDashboardController } from '../controllers/reception.controller';

const walkinsRoutes = async (fastify: FastifyInstance) => {
  fastify.register(async (instance) => {
    // Receptionist is the primary role here, but Admin / CRE_TL / Developer can also use for testing.
    instance.addHook('preHandler', authorize(['Receptionist', 'Admin', 'CRE_TL', 'Developer']));

    instance.get('/customers/by-phone', getCustomerByPhoneController);
    instance.post('/walkins/create', createWalkInLeadController);

    // Receptionist dashboard stats & recent activity
    instance.get('/reception/dashboard', getReceptionDashboardController);

    // Receptionist test drive entry
    instance.post('/walkins/test-drive', createReceptionTestDriveController);
  });
};

export default walkinsRoutes;


