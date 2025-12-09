import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import {
  createTicketController,
  getTicketsController,
  getTicketByIdController,
  addTicketReplyController,
  updateTicketStatusController,
  getTicketStatisticsController,
  uploadImageController,
  cleanupOldTicketsController,
} from '../controllers/support.controller';

const supportRoutes = async (fastify: FastifyInstance) => {
  // Register multipart plugin for file uploads
  await fastify.register(require('@fastify/multipart'), {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
  });

  // All routes require authentication
  fastify.register(async (instance) => {
    instance.addHook('preHandler', authorize(['Admin', 'CRE', 'CRE_TL', 'Developer']));

    // Ticket CRUD
    instance.post('/support/tickets', createTicketController);
    instance.get('/support/tickets', getTicketsController);
    instance.get('/support/tickets/:id', getTicketByIdController);
    instance.patch('/support/tickets/:id/status', updateTicketStatusController);

    // Replies
    instance.post('/support/tickets/:id/replies', addTicketReplyController);

    // Image upload
    instance.post('/support/upload-image', uploadImageController);

    // Statistics (Developer only)
    instance.get('/support/tickets/statistics', getTicketStatisticsController);

    // Cleanup (Developer only)
    instance.post('/support/tickets/cleanup', cleanupOldTicketsController);
  });
};

export default supportRoutes;

