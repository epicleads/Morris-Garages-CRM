import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { canViewAllLeads } from '../services/permissions.service';
import { SafeUser } from '../types/user';
import {
  addRuleMember,
  assignLeadsManually,
  autoAssignLead,
  createAssignmentRule,
  deleteAssignmentRule,
  listAssignmentRules,
  getRecentAssignments,
  getRuleStats,
  removeRuleMember,
  updateAssignmentRule,
  updateRuleMember,
} from '../services/assignment.service';

const manualAssignSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1),
  assignedTo: z.number().int().positive(),
  remarks: z.string().optional(),
});

const assignmentRuleSchema = z.object({
  name: z.string().min(1),
  sourceId: z.number().int().positive().optional(),
  ruleType: z.enum(['round_robin', 'weighted']),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.any()).optional(),
  activeFrom: z.string().optional(),
  activeTo: z.string().optional(),
  activeDays: z.array(z.number().int().min(0).max(6)).optional(),
  fallbackRuleId: z.string().uuid().optional(),
  fallbackToManual: z.boolean().optional(),
});

const ruleMemberSchema = z.object({
  ruleId: z.string().uuid(),
  userId: z.number().int().positive(),
  percentage: z.number().positive().max(100).optional(),
  weight: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export const manualAssignController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const body = manualAssignSchema.parse(request.body);

    const result = await assignLeadsManually(user, body);
    return reply.send({
      message: 'Leads assigned successfully',
      result,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(400).send({ message: error.message });
  }
};

export const createAssignmentRuleController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const body = assignmentRuleSchema.parse(request.body);

    const rule = await createAssignmentRule(user, body);
    return reply.status(201).send({
      message: 'Assignment rule created',
      rule,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(400).send({ message: error.message });
  }
};

export const listAssignmentRulesController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const rules = await listAssignmentRules(user);
    return reply.send({ rules });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(400).send({ message: error.message });
  }
};

export const updateAssignmentRuleController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ id: z.string().uuid() });
    const { id } = paramsSchema.parse(request.params);
    const body = assignmentRuleSchema.partial().parse(request.body);

    const rule = await updateAssignmentRule(user, id, body);
    return reply.send({
      message: 'Assignment rule updated',
      rule,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(400).send({ message: error.message });
  }
};

export const deleteAssignmentRuleController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ id: z.string().uuid() });
    const { id } = paramsSchema.parse(request.params);

    await deleteAssignmentRule(user, id);
    return reply.send({ message: 'Assignment rule deleted' });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(400).send({ message: error.message });
  }
};

export const addRuleMemberController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const body = ruleMemberSchema.parse(request.body);

    const member = await addRuleMember(user, body);
    return reply.status(201).send({
      message: 'Rule member added',
      member,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(400).send({ message: error.message });
  }
};

export const updateRuleMemberController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ memberId: z.string().uuid() });
    const { memberId } = paramsSchema.parse(request.params);
    const body = ruleMemberSchema.partial().parse(request.body);

    const member = await updateRuleMember(user, memberId, body);
    return reply.send({
      message: 'Rule member updated',
      member,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(400).send({ message: error.message });
  }
};

export const removeRuleMemberController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ memberId: z.string().uuid() });
    const { memberId } = paramsSchema.parse(request.params);

    await removeRuleMember(user, memberId);
    return reply.send({ message: 'Rule member removed' });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(400).send({ message: error.message });
  }
};

// Utility endpoint for debugging auto assignment manually (optional)
export const triggerAutoAssignmentController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    ensureManager(user);

    const schema = z.object({
      leadId: z.number().int().positive(),
      sourceId: z.number().int().positive().optional(),
    });
    const body = schema.parse(request.body);

    const result = await autoAssignLead(body.leadId, body.sourceId);
    return reply.send({
      message: result
        ? 'Lead auto-assigned successfully'
        : 'No matching rule. Lead left unassigned.',
      result,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(400).send({ message: error.message });
  }
};

const ensureManager = (user: SafeUser) => {
  if (!canViewAllLeads(user)) {
    throw new Error('Permission denied: Only Team Leads can manage assignments');
  }
};

export const recentAssignmentsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const querySchema = z.object({
      limit: z.coerce.number().int().positive().max(200).optional(),
      assignedTo: z.coerce.number().int().positive().optional(),
      action: z.enum(['manual_assignment', 'auto_assignment']).optional(),
    });
    const query = querySchema.parse(request.query);

    const assignments = await getRecentAssignments(user, query);
    return reply.send({ assignments });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(400).send({ message: error.message });
  }
};

export const ruleStatsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ id: z.string().uuid() });
    const { id } = paramsSchema.parse(request.params);

    const stats = await getRuleStats(user, id);
    return reply.send({ stats });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(400).send({ message: error.message });
  }
};

