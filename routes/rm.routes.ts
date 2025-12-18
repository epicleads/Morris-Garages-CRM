import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import {
  listRmLeadsController,
  getRmLeadDetailController,
  updateRmQualificationController,
  createRmTestDriveController,
  createRmBookingController,
  createRmRetailController,
  listRmRemindersController,
  markRmReminderReadController
} from '../controllers/rm.controller';

const rmRoutes = async (fastify: FastifyInstance) => {
  fastify.register(async (instance) => {
    // Primary audience is RM, but allow Admin / CRE_TL / Developer for debugging or oversight.
    instance.addHook('preHandler', authorize(['RM', 'Admin', 'CRE_TL', 'Developer']));

    instance.get('/rm/leads', listRmLeadsController);
    instance.get('/rm/leads/:id', getRmLeadDetailController);
    instance.patch('/rm/leads/:id/qualification', updateRmQualificationController);
    instance.post('/rm/leads/:id/test-drive', createRmTestDriveController);
    instance.post('/rm/leads/:id/bookings', createRmBookingController);
    instance.post('/rm/leads/:id/retails', createRmRetailController);

    // Reminders
    instance.get('/rm/reminders', listRmRemindersController);
    instance.patch('/rm/reminders/:id/read', markRmReminderReadController);
  });
};

export default rmRoutes;


