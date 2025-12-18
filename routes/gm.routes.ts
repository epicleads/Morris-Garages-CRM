import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import {
  getGmBookingsController,
  approveGmBookingController,
  rejectGmBookingController,
  getGmRetailsController,
  approveGmRetailController,
  rejectGmRetailController,
  getCustomerJourneyController,
  getGmRemindersController,
  sendGmBookingReminderController,
  getRmLeadsForReminderController,
  sendGmLeadRemindersController,
} from '../controllers/gm.controller';

const gmRoutes = async (fastify: FastifyInstance) => {
  fastify.register(async (instance) => {
    // Only GM, Admin, Developer can access these routes
    instance.addHook('preHandler', authorize(['GM', 'Admin', 'Developer']));

    // Bookings
    instance.get('/gm/bookings', getGmBookingsController);
    instance.patch('/gm/bookings/:id/approve', approveGmBookingController);
    instance.patch('/gm/bookings/:id/reject', rejectGmBookingController);
    instance.post('/gm/bookings/:id/reminders', sendGmBookingReminderController);

    // Reminders
    instance.get('/gm/reminders', getGmRemindersController);
    instance.get('/gm/reminders/rm-leads', getRmLeadsForReminderController);
    instance.post('/gm/reminders/send', sendGmLeadRemindersController);

    // Retails
    instance.get('/gm/retails', getGmRetailsController);
    instance.patch('/gm/retails/:id/approve', approveGmRetailController);
    instance.patch('/gm/retails/:id/reject', rejectGmRetailController);

    // Customer Journey
    instance.get('/gm/customers/:id/journey', getCustomerJourneyController);
  });
};

export default gmRoutes;

