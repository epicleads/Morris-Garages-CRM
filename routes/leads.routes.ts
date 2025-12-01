import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import {
    listLeadsController,
    getLeadController,
    createLeadController,
    updateLeadStatusController,
    qualifyLeadController,
    updateQualificationController,
    getTodaysFollowupsController,
    getLeadTimelineController,
    getLeadStatsController,
    importLeadsController,
    getUnassignedLeadsController,
    getUnassignedLeadsGroupedBySourceController,
    getUnassignedLeadsBySourceController,
} from '../controllers/leads.controller';

const leadsRoutes = async (fastify: FastifyInstance) => {
    // All routes require authentication
    fastify.register(async (instance) => {
        instance.addHook('preHandler', authorize());

        // Get unassigned leads summary
        instance.get('/leads/unassigned', getUnassignedLeadsController);

        // Get unassigned leads grouped by source (with source names)
        instance.get('/leads/unassigned/by-source', getUnassignedLeadsGroupedBySourceController);

        // Get unassigned leads for a specific source by source name
        instance.get('/leads/unassigned/:source', getUnassignedLeadsBySourceController);

        // List leads with filters
        instance.get('/leads', listLeadsController);

        // Get lead statistics
        instance.get('/leads/stats', getLeadStatsController);

        // Get today's follow-ups
        instance.get('/leads/followups/today', getTodaysFollowupsController);

        // Get single lead with timeline
        instance.get('/leads/:id', getLeadController);

        // Get lead timeline/history
        instance.get('/leads/:id/timeline', getLeadTimelineController);

        // Create lead (Admin/CRE_TL only - checked in controller)
        instance.post('/leads', createLeadController);

        // Import leads from CSV/Excel (CRE_TL only - checked in controller)
        instance.post('/leads/import', importLeadsController);

        // Update lead status
        instance.patch('/leads/:id/status', updateLeadStatusController);

        // Qualify lead (create)
        instance.post('/leads/:id/qualify', qualifyLeadController);

        // Update qualification
        instance.patch('/leads/:id/qualification', updateQualificationController);
    });
};

export default leadsRoutes;