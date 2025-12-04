import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { canViewAllLeads } from '../services/permissions.service';
import { supabaseAdmin } from '../config/supabase';
import { autoAssignLead } from '../services/assignment.service';

const ensureManager = (user: any) => {
  if (!canViewAllLeads(user)) {
    throw new Error('Permission denied: Only Team Leads and Admins can manage assignments');
  }
};

/**
 * Get auto-assign configurations grouped by source
 * GET /auto-assign-configs/by-source
 */
export const getAutoAssignConfigsBySourceController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    ensureManager(user);

    // Query auto_assign_configs table (we'll create this if it doesn't exist)
    // For now, return empty config - the table structure needs to be defined
    const { data: configs, error } = await supabaseAdmin
      .from('auto_assign_configs')
      .select(`
        id,
        source,
        sub_source,
        cre_id,
        cre_name,
        percentage,
        is_active,
        created_at,
        updated_at
      `);

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = table doesn't exist - that's ok for now
      request.log.error(error);
      // Return empty config instead of error
      return reply.send({});
    }

    // Group by source (source + sub_source combination)
    const grouped: Record<string, any[]> = {};

    configs?.forEach((config: any) => {
      const sourceKey = config.sub_source
        ? `${config.source} + ${config.sub_source}`
        : config.source;
      
      if (!grouped[sourceKey]) {
        grouped[sourceKey] = [];
      }

      grouped[sourceKey].push({
        cre_id: config.cre_id,
        cre_name: config.cre_name,
        percentage: config.percentage,
        is_active: config.is_active,
      });
    });

    return reply.send(grouped);
  } catch (error: any) {
    request.log.error(error);
    if (error.message.includes('Permission denied')) {
      return reply.status(403).send({ message: error.message });
    }
    // Return empty config on error
    return reply.send({});
  }
};

const saveAutoAssignConfigSchema = z.object({
  source: z.string(),
  sub_source: z.string().nullable().optional(),
  is_active: z.boolean(),
  configs: z.array(
    z.object({
      cre_id: z.string().or(z.number()),
      cre_name: z.string(),
      percentage: z.number().min(0).max(100),
    })
  ),
});

/**
 * Save auto-assign configuration for a source
 * POST /auto-assign-configs
 */
export const saveAutoAssignConfigController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    ensureManager(user);

    const body = saveAutoAssignConfigSchema.parse(request.body);

    // Delete existing configs for this source
    let deleteQuery = supabaseAdmin
      .from('auto_assign_configs')
      .delete()
      .eq('source', body.source);
    
    if (body.sub_source) {
      deleteQuery = deleteQuery.eq('sub_source', body.sub_source);
    } else {
      deleteQuery = deleteQuery.is('sub_source', null);
    }

    await deleteQuery;

    // Insert new configs
    if (body.configs && body.configs.length > 0) {
      const configsToInsert = body.configs.map((config) => ({
        source: body.source,
        sub_source: body.sub_source || null,
        cre_id: String(config.cre_id),
        cre_name: config.cre_name,
        percentage: config.percentage,
        is_active: body.is_active,
      }));

      const { error: insertError } = await supabaseAdmin
        .from('auto_assign_configs')
        .insert(configsToInsert);

      if (insertError) {
        throw new Error(`Failed to save config: ${insertError.message}`);
      }
    }

    return reply.send({
      message: 'Configuration saved successfully',
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    if (error.message.includes('Permission denied')) {
      return reply.status(403).send({ message: error.message });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to save configuration',
    });
  }
};

const deleteAutoAssignConfigSchema = z.object({
  source: z.string(),
  sub_source: z.string().nullable().optional(),
});

/**
 * Delete auto-assign configuration for a source
 * DELETE /auto-assign-configs
 */
export const deleteAutoAssignConfigController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    ensureManager(user);

    const query = deleteAutoAssignConfigSchema.parse(request.query);

    let deleteQuery = supabaseAdmin
      .from('auto_assign_configs')
      .delete()
      .eq('source', query.source);

    if (query.sub_source) {
      deleteQuery = deleteQuery.eq('sub_source', query.sub_source);
    } else {
      deleteQuery = deleteQuery.is('sub_source', null);
    }

    const { error } = await deleteQuery;

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to delete config: ${error.message}`);
    }

    return reply.send({
      message: 'Configuration deleted successfully',
      deleted: true,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    if (error.message.includes('Permission denied')) {
      return reply.status(403).send({ message: error.message });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to delete configuration',
    });
  }
};

/**
 * Run auto-assign for all active assignment rules (per source)
 * POST /admin/auto-assign/run
 *
 * This endpoint is a convenience wrapper around the existing assignment_rules
 * + autoAssignLead logic. It does NOT depend on auto_assign_configs, so it
 * works with the rules you configure in the Assignment Rules UI.
 */
export const runAutoAssignController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    ensureManager(user);

    // 1. Get all active assignment rules that are linked to a source
    const { data: rules, error: rulesError } = await supabaseAdmin
      .from('assignment_rules')
      .select('id, source_id, is_active')
      .eq('is_active', true)
      .not('source_id', 'is', null);

    if (rulesError) {
      request.log.error(rulesError);
      return reply.status(500).send({
        message: `Failed to fetch assignment rules: ${rulesError.message}`,
      });
    }

    if (!rules || rules.length === 0) {
      return reply.send({
        message: 'No active assignment rules found',
        total_assigned: 0,
      });
    }

    // 2. Get distinct source IDs from rules
    const sourceIds = Array.from(
      new Set(rules.map((r: any) => r.source_id).filter((id: any) => id != null))
    ) as number[];

    let totalAssigned = 0;

    // 3. For each source, find unassigned "New" leads and run autoAssignLead
    for (const sourceId of sourceIds) {
      const { data: leads, error: leadsError } = await supabaseAdmin
        .from('leads_master')
        .select('id')
        .eq('source_id', sourceId)
        .is('assigned_to', null)
        .eq('status', 'New');

      if (leadsError) {
        request.log.error(leadsError);
        continue;
      }

      if (!leads || leads.length === 0) continue;

      for (const lead of leads) {
        const result = await autoAssignLead(lead.id, sourceId);
        if (result?.assignedTo) {
          totalAssigned += 1;
        }
      }
    }

    return reply.send({
      message: `Auto-assignment completed. Assigned ${totalAssigned} leads.`,
      total_assigned: totalAssigned,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error.message?.includes('Permission denied')) {
      return reply.status(403).send({ message: error.message });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to run auto-assign',
    });
  }
};

/**
 * Get Tele-In number assignments
 * GET /admin/telein-assignments
 */
export const getTeleinAssignmentsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    ensureManager(user);

    // Query telein_assignments table (create if doesn't exist)
    const { data: assignments, error } = await supabaseAdmin
      .from('telein_assignments')
      .select(`
        id,
        telein_no,
        cre_id,
        users:cre_id (
          user_id,
          full_name,
          username
        )
      `);

    if (error && error.code !== 'PGRST116') {
      request.log.error(error);
      // Return empty assignments if table doesn't exist
      return reply.send({
        assignments: [],
      });
    }

    // Transform to expected format
    const transformed = (assignments || []).map((assignment: any) => ({
      telein_no: assignment.telein_no,
      cre_id: assignment.cre_id,
      id: assignment.cre_id,
      username: assignment.users?.username || '',
      full_name: assignment.users?.full_name || '',
    }));

    return reply.send({
      assignments: transformed,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error.message.includes('Permission denied')) {
      return reply.status(403).send({ message: error.message });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to fetch Tele-In assignments',
    });
  }
};

const assignTeleinSchema = z.object({
  telein_no: z.string(),
  cre_id: z.string().or(z.number()),
});

/**
 * Assign Tele-In number to a CRE
 * POST /admin/telein-assign
 */
export const assignTeleinController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    ensureManager(user);

    const body = assignTeleinSchema.parse(request.body);

    // Verify CRE exists
    const { data: cre, error: creError } = await supabaseAdmin
      .from('users')
      .select('user_id, full_name, username, role')
      .eq('user_id', body.cre_id)
      .eq('role', 'CRE')
      .maybeSingle();

    if (creError || !cre) {
      return reply.status(404).send({
        message: `CRE with ID ${body.cre_id} not found`,
      });
    }

    // Upsert assignment
    const { error: upsertError } = await supabaseAdmin
      .from('telein_assignments')
      .upsert(
        {
          telein_no: body.telein_no,
          cre_id: String(body.cre_id),
        },
        {
          onConflict: 'telein_no',
        }
      );

    if (upsertError && upsertError.code !== 'PGRST116') {
      throw new Error(`Failed to assign Tele-In: ${upsertError.message}`);
    }

    return reply.send({
      message: 'Tele-In assigned successfully',
      assignment: {
        telein_no: body.telein_no,
        cre_id: String(body.cre_id),
        full_name: cre.full_name,
        username: cre.username,
      },
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    if (error.message.includes('Permission denied')) {
      return reply.status(403).send({ message: error.message });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to assign Tele-In',
    });
  }
};
