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

/**
 * Get unassigned leads grouped by source
 * GET /assignments/unassigned-by-source
 */
export const getUnassignedLeadsBySourceController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    ensureManager(user);

    const { supabaseAdmin } = await import('../config/supabase');

    // Query to get count of unassigned leads by source
    const { data, error } = await supabaseAdmin
      .from('leads_master')
      .select('source_id')
      .is('assigned_to', null);

    if (error) {
      throw new Error(`Failed to fetch unassigned leads: ${error.message}`);
    }

    // Get unique source IDs
    const sourceIds = [...new Set(data?.map((lead: any) => lead.source_id).filter(Boolean))];

    if (sourceIds.length === 0) {
      return reply.send({
        unassignedBySource: [],
        total: 0,
      });
    }

    // Fetch source details
    const { data: sources, error: sourcesError } = await supabaseAdmin
      .from('sources')
      .select('id, display_name')
      .in('id', sourceIds);

    if (sourcesError) {
      throw new Error(`Failed to fetch sources: ${sourcesError.message}`);
    }

    // Count leads per source
    const grouped: Record<number, { source_id: number; display_name: string; count: number }> = {};

    data?.forEach((lead: any) => {
      const sourceId = lead.source_id;
      if (sourceId) {
        if (!grouped[sourceId]) {
          const source = sources?.find((s: any) => s.id === sourceId);
          grouped[sourceId] = {
            source_id: sourceId,
            display_name: source?.display_name || `Source ${sourceId}`,
            count: 0,
          };
        }
        grouped[sourceId].count++;
      }
    });

    const result = Object.values(grouped);

    return reply.send({
      unassignedBySource: result,
      total: result.reduce((sum, item) => sum + item.count, 0),
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: error.message });
  }
};

/**
 * Bulk assign all unassigned leads from a source to a CRE
 * POST /assignments/bulk-assign-by-source
 */


/**
 * Bulk assign all unassigned leads from a source to a CRE
 * POST /assignments/bulk-assign-by-source
 */
export const bulkAssignBySourceController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    ensureManager(user);

    const schema = z.object({
      sourceId: z.number().int().positive(),
      allocations: z.array(z.object({
        userId: z.number().int().positive(),
        count: z.number().int().positive()
      })).min(1)
    });

    const body = schema.parse(request.body);
    const { supabaseAdmin } = await import('../config/supabase');

    const targetUserIds = body.allocations.map(a => a.userId);

    // Verify all assigned users exist and are CREs
    const { data: targetUsers, error: userError } = await supabaseAdmin
      .from('users')
      .select('user_id, role, status, username')
      .in('user_id', targetUserIds);

    if (userError || !targetUsers || targetUsers.length !== targetUserIds.length) {
      return reply.status(404).send({
        message: 'One or more target users not found',
      });
    }

    const invalidUsers = targetUsers.filter(u => u.role !== 'CRE' || !u.status);
    if (invalidUsers.length > 0) {
      return reply.status(400).send({
        message: `Cannot assign to invalid users: ${invalidUsers.map(u => u.username).join(', ')}. Users must be active CREs.`,
      });
    }

    // Get all unassigned leads for this source
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads_master')
      .select('id')
      .eq('source_id', body.sourceId)
      .is('assigned_to', null)
      .eq('status', 'New');

    if (leadsError) {
      throw new Error(`Failed to fetch leads: ${leadsError.message}`);
    }

    const totalRequested = body.allocations.reduce((sum, a) => sum + a.count, 0);
    if (!leads || leads.length < totalRequested) {
      return reply.status(400).send({
        message: `Not enough unassigned leads. Requested: ${totalRequested}, Available: ${leads?.length || 0}`,
        available: leads?.length || 0
      });
    }

    const leadIds = leads.map((l: any) => l.id);
    let updatedCount = 0;
    let currentIndex = 0;

    // Process each allocation
    for (const allocation of body.allocations) {
      const leadsForUser = leadIds.slice(currentIndex, currentIndex + allocation.count);
      currentIndex += allocation.count;

      if (leadsForUser.length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from('leads_master')
          .update({
            assigned_to: allocation.userId,
            assigned_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .in('id', leadsForUser);

        if (updateError) {
          request.log.error(`Failed to assign batch to user ${allocation.userId}: ${updateError.message}`);
        } else {
          updatedCount += leadsForUser.length;

          // Create logs
          const logEntries = leadsForUser.map((leadId: number) => ({
            lead_id: leadId,
            old_status: 'New',
            new_status: 'New', // Status remains New
            remarks: `Bulk assigned ${allocation.count} leads from source to ${allocation.userId} by TL ${user.username}`,
            created_by: user.id,
            metadata: {
              action: 'bulk_assignment_by_source',
              source_id: body.sourceId,
              allocation_count: allocation.count
            },
          }));
          await supabaseAdmin.from('leads_logs').insert(logEntries);
        }
      }
    }

    return reply.send({
      message: `Successfully assigned ${updatedCount} leads`,
      assignedCount: updatedCount,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(500).send({ message: error.message });
  }
};

/**
 * Auto-assign all unassigned leads from a source using assignment rules
 * POST /assignments/auto-assign-by-source
 */
export const autoAssignBySourceController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    ensureManager(user);

    const schema = z.object({
      sourceId: z.number().int().positive(),
    });

    const body = schema.parse(request.body);
    const { supabaseAdmin } = await import('../config/supabase');

    // Get all unassigned leads for this source
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads_master')
      .select('id')
      .eq('source_id', body.sourceId)
      .is('assigned_to', null)
      .eq('status', 'New');

    if (leadsError) {
      throw new Error(`Failed to fetch leads: ${leadsError.message}`);
    }

    if (!leads || leads.length === 0) {
      return reply.send({
        message: 'No unassigned leads found for this source',
        assignedCount: 0,
      });
    }

    let assignedCount = 0;

    for (const lead of leads) {
      const result = await autoAssignLead(lead.id, body.sourceId);
      if (result?.assignedTo) {
        assignedCount += 1;
      }
    }

    return reply.send({
      message: `Auto-assignment completed. Assigned ${assignedCount} leads.`,
      assignedCount,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(500).send({ message: error.message });
  }
};