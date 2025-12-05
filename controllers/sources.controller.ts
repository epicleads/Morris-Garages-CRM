import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { canViewAllLeads } from '../services/permissions.service';

const createSourceSchema = z.object({
  displayName: z.string().min(1),
  sourceType: z.string().min(1),
});

const updateSourceSchema = z.object({
  displayName: z.string().min(1).optional(),
  sourceType: z.string().min(1).optional(),
});

/**
 * Get all lead sources
 * GET /sources
 */
export const getSourcesController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;

    // Allow all authenticated users (including CREs) to view sources
    // CREs need this to create manual leads
    // Create/Update operations are still restricted to TL/Admin

    const { data, error } = await supabaseAdmin
      .from('sources')
      .select('id, display_name, source_type')
      .order('display_name', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch sources: ${error.message}`);
    }

    return reply.send({
      sources: data || [],
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to fetch sources',
    });
  }
};

/**
 * Create a new lead source
 * POST /sources
 */
export const createSourceController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;

    if (!canViewAllLeads(user)) {
      return reply.status(403).send({
        message: 'Permission denied: Only Team Leads and Admins can manage sources',
      });
    }

    const body = createSourceSchema.parse(request.body);

    const { data, error } = await supabaseAdmin
      .from('sources')
      .insert({
        display_name: body.displayName,
        source_type: body.sourceType,
      })
      .select('id, display_name, source_type')
      .single();

    if (error) {
      throw new Error(`Failed to create source: ${error.message}`);
    }

    return reply.status(201).send({
      message: 'Source created successfully',
      source: data,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    if (error.message?.includes('Permission denied')) {
      return reply.status(403).send({ message: error.message });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to create source',
    });
  }
};

/**
 * Update an existing lead source
 * PATCH /sources/:id
 */
export const updateSourceController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;

    if (!canViewAllLeads(user)) {
      return reply.status(403).send({
        message: 'Permission denied: Only Team Leads and Admins can manage sources',
      });
    }

    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);
    const body = updateSourceSchema.parse(request.body);

    const updatePayload: any = {};
    if (body.displayName !== undefined) updatePayload.display_name = body.displayName;
    if (body.sourceType !== undefined) updatePayload.source_type = body.sourceType;

    const { data, error } = await supabaseAdmin
      .from('sources')
      .update(updatePayload)
      .eq('id', id)
      .select('id, display_name, source_type')
      .single();

    if (error) {
      throw new Error(`Failed to update source: ${error.message}`);
    }

    return reply.send({
      message: 'Source updated successfully',
      source: data,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    if (error.message?.includes('Permission denied')) {
      return reply.status(403).send({ message: error.message });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to update source',
    });
  }
};

