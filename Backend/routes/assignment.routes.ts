import { FastifyInstance } from 'fastify';
import { authorize } from '../middleware/authGuard';
import {
  addRuleMemberController,
  createAssignmentRuleController,
  deleteAssignmentRuleController,
  listAssignmentRulesController,
  manualAssignController,
  removeRuleMemberController,
  triggerAutoAssignmentController,
  updateAssignmentRuleController,
  updateRuleMemberController,
  recentAssignmentsController,
  ruleStatsController,
} from '../controllers/assignment.controller';

const assignmentRoutes = async (fastify: FastifyInstance) => {
  fastify.register(async (instance) => {
    instance.addHook('preHandler', authorize());

    // Manual assignment (single/bulk)
    instance.post('/admin/leads/assign', manualAssignController);

    // Assignment rules CRUD
    instance.post('/assignment-rules', createAssignmentRuleController);
    instance.get('/assignment-rules', listAssignmentRulesController);
    instance.patch('/assignment-rules/:id', updateAssignmentRuleController);
    instance.delete('/assignment-rules/:id', deleteAssignmentRuleController);
    instance.get('/assignment-rules/:id/stats', ruleStatsController);

    // Rule members
    instance.post('/assignment-rules/members', addRuleMemberController);
    instance.patch(
      '/assignment-rules/members/:memberId',
      updateRuleMemberController
    );
    instance.delete(
      '/assignment-rules/members/:memberId',
      removeRuleMemberController
    );

    // Manual trigger for auto assignment (diagnostics)
    instance.post(
      '/assignment-rules/test/assign',
      triggerAutoAssignmentController
    );

    // Monitoring
    instance.get('/admin/leads/assignments', recentAssignmentsController);
  });
};

export default assignmentRoutes;

