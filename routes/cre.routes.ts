import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import {
  getCreDashboardSummaryController,
  updateLeadController,
  getFreshUntouchedLeadsController,
  getFreshCalledLeadsController,
  getTodaysFollowupsLeadsController,
  getPendingLeadsController,
  getQualifiedLeadsController,
  getWonLeadsController,
  getLostLeadsController,
  getFilterCountsController,
  markUnqualifiedController,
  markPendingController,
  updateQualifiedLeadStatusController,
  getLeadQualificationController,
  createVerificationCallController,
} from '../controllers/cre.controller';

const creRoutes = async (fastify: FastifyInstance) => {
  fastify.register(async (instance) => {
    instance.addHook('preHandler', authorize(['CRE']));

    // Dashboard summary
    instance.get('/cre/dashboard/summary', getCreDashboardSummaryController);

    // Update lead qualification
    instance.post('/cre/leads/update', updateLeadController);

    // Mark lead as unqualified
    instance.post('/cre/leads/unqualified', markUnqualifiedController);

    // Mark lead as pending
    instance.post('/cre/leads/pending', markPendingController);

    // Update qualified lead status (Test Drive, Booked, Retailed)
    instance.post('/cre/leads/update-status', updateQualifiedLeadStatusController);

    // Get lead qualification details
    instance.get('/cre/leads/:lead_id/qualification', getLeadQualificationController);

    // Create verification call (for qualified leads)
    instance.post('/cre/leads/verification-call', createVerificationCallController);

    // Filter counts (for tab labels)
    instance.get('/cre/leads/filter-counts', getFilterCountsController);

    // Filtered leads endpoints
    instance.get('/cre/leads/fresh/untouched', getFreshUntouchedLeadsController);
    instance.get('/cre/leads/fresh/called', getFreshCalledLeadsController);
    instance.get('/cre/leads/followups/today', getTodaysFollowupsLeadsController);
    instance.get('/cre/leads/pending', getPendingLeadsController);
    instance.get('/cre/leads/qualified', getQualifiedLeadsController);
    instance.get('/cre/leads/won', getWonLeadsController);
    instance.get('/cre/leads/lost', getLostLeadsController);
  });
};

export default creRoutes;


