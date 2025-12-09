import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import {
  exportLeadsController,
  saveTemplateController,
  getTemplatesController,
  deleteTemplateController,
  getHistoryController,
} from '../controllers/export.controller';

const exportRoutes = async (fastify: FastifyInstance) => {
  // All routes require authentication and Admin/CRE_TL/Developer role
  fastify.register(async (instance) => {
    instance.addHook('preHandler', authorize(['Admin', 'CRE_TL', 'Developer']));

    // Export leads
    instance.post('/export/leads', exportLeadsController);

    // Export templates
    instance.post('/export/templates', saveTemplateController);
    instance.get('/export/templates', getTemplatesController);
    instance.delete('/export/templates/:id', deleteTemplateController);

    // Export history
    instance.get('/export/history', getHistoryController);
  });
};

export default exportRoutes;

