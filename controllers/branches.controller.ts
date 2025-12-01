import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { canViewAllLeads } from '../services/permissions.service';

const createBranchSchema = z.object({
  name: z.string().min(1),
  city: z.string().optional(),
});

const updateBranchSchema = z.object({
  name: z.string().min(1).optional(),
  city: z.string().optional(),
  isActive: z.boolean().optional(),
});

const branchMemberSchema = z.object({
  branchId: z.number().int().positive(),
  role: z.enum(['TL', 'RM', 'CRE']),
  userId: z.number().int().positive().optional(), // required only for CRE
  contactName: z.string().min(1).optional(), // used for TL/RM
  managerId: z.number().int().positive().nullable().optional(), // for RM -> TL mapping
  isActive: z.boolean().optional(),
});

const updateBranchMemberSchema = z.object({
  role: z.enum(['TL', 'RM', 'CRE']).optional(),
  contactName: z.string().min(1).optional(),
  managerId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const listBranchesController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    if (!canViewAllLeads(user)) {
      return reply
        .status(403)
        .send({ message: 'Permission denied: Only TL/Admin can manage branches' });
    }

    const { data, error } = await supabaseAdmin
      .from('branches')
      .select('id, name, city, is_active, created_at, updated_at')
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch branches: ${error.message}`);
    }

    return reply.send({ branches: data || [] });
  } catch (error: any) {
    request.log.error(error);
    return reply
      .status(500)
      .send({ message: error.message || 'Failed to fetch branches' });
  }
};

export const createBranchController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    if (!canViewAllLeads(user)) {
      return reply
        .status(403)
        .send({ message: 'Permission denied: Only TL/Admin can manage branches' });
    }

    const body = createBranchSchema.parse(request.body);
    const { data, error } = await supabaseAdmin
      .from('branches')
      .insert({
        name: body.name,
        city: body.city || null,
      })
      .select('id, name, city, is_active, created_at, updated_at')
      .single();

    if (error) {
      throw new Error(`Failed to create branch: ${error.message}`);
    }

    return reply.status(201).send({
      message: 'Branch created',
      branch: data,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply
        .status(400)
        .send({ message: 'Validation failed', errors: error.errors });
    }
    return reply
      .status(500)
      .send({ message: error.message || 'Failed to create branch' });
  }
};

export const updateBranchController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    if (!canViewAllLeads(user)) {
      return reply
        .status(403)
        .send({ message: 'Permission denied: Only TL/Admin can manage branches' });
    }

    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);
    const body = updateBranchSchema.parse(request.body);

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.city !== undefined) updateData.city = body.city;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;

    const { data, error } = await supabaseAdmin
      .from('branches')
      .update(updateData)
      .eq('id', id)
      .select('id, name, city, is_active, created_at, updated_at')
      .single();

    if (error) {
      throw new Error(`Failed to update branch: ${error.message}`);
    }

    return reply.send({
      message: 'Branch updated',
      branch: data,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply
        .status(400)
        .send({ message: 'Validation failed', errors: error.errors });
    }
    return reply
      .status(500)
      .send({ message: error.message || 'Failed to update branch' });
  }
};

export const listBranchMembersController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    if (!canViewAllLeads(user)) {
      return reply
        .status(403)
        .send({ message: 'Permission denied: Only TL/Admin can manage branches' });
    }

    const querySchema = z.object({
      branchId: z.coerce.number().int().positive().optional(),
    });
    const query = querySchema.parse(request.query);

    let q = supabaseAdmin
      .from('branch_members')
      .select(
        `
        id,
        branch_id,
        user_id,
        contact_name,
        manager_id,
        role,
        is_active,
        created_at,
        updated_at
      `
      );

    if (query.branchId) {
      q = q.eq('branch_id', query.branchId);
    }

    const { data, error } = await q;

    if (error) {
      throw new Error(`Failed to fetch branch members: ${error.message}`);
    }

    return reply.send({ members: data || [] });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply
        .status(400)
        .send({ message: 'Validation failed', errors: error.errors });
    }
    return reply
      .status(500)
      .send({ message: error.message || 'Failed to fetch branch members' });
  }
};

export const addBranchMemberController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    if (!canViewAllLeads(user)) {
      return reply
        .status(403)
        .send({ message: 'Permission denied: Only TL/Admin can manage branches' });
    }

    const body = branchMemberSchema.parse(request.body);

    // Business rules:
    // - CRE: must be linked to an existing user (userId required)
    // - TL/RM: free-text name (contactName required), userId is optional and usually null
    if (body.role === 'CRE' && !body.userId) {
      return reply.status(400).send({
        message: 'userId is required when role is CRE',
      });
    }
    if (body.role !== 'CRE' && !body.contactName) {
      return reply.status(400).send({
        message: 'contactName is required when role is TL or RM',
      });
    }
    // For RM, if managerId provided, ensure it points to a TL in the same branch
    if (body.role === 'RM' && body.managerId) {
      const { data: manager, error: managerError } = await supabaseAdmin
        .from('branch_members')
        .select('id, branch_id, role')
        .eq('id', body.managerId)
        .maybeSingle();
      if (managerError) {
        throw new Error(`Failed to verify manager: ${managerError.message}`);
      }
      if (!manager || manager.branch_id !== body.branchId || manager.role !== 'TL') {
        return reply.status(400).send({
          message: 'managerId must reference a TL in the same branch',
        });
      }
    }

    // Ensure branch exists
    const { data: branch } = await supabaseAdmin
      .from('branches')
      .select('id, is_active')
      .eq('id', body.branchId)
      .maybeSingle();
    if (!branch) {
      return reply.status(400).send({ message: 'Branch not found' });
    }

    const { data, error } = await supabaseAdmin
      .from('branch_members')
      .insert({
        branch_id: body.branchId,
        user_id: body.role === 'CRE' ? body.userId! : null,
        contact_name: body.role === 'CRE' ? null : body.contactName || null,
        manager_id: body.role === 'RM' ? body.managerId || null : null,
        role: body.role,
        is_active: body.isActive ?? true,
      })
      .select(
        `
        id,
        branch_id,
        user_id,
        contact_name,
        manager_id,
        role,
        is_active,
        created_at,
        updated_at
      `
      )
      .single();

    if (error) {
      throw new Error(`Failed to add branch member: ${error.message}`);
    }

    return reply.status(201).send({
      message: 'Branch member added',
      member: data,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply
        .status(400)
        .send({ message: 'Validation failed', errors: error.errors });
    }
    return reply
      .status(500)
      .send({ message: error.message || 'Failed to add branch member' });
  }
};

export const updateBranchMemberController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    if (!canViewAllLeads(user)) {
      return reply
        .status(403)
        .send({ message: 'Permission denied: Only TL/Admin can manage branches' });
    }

    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);
    const body = updateBranchMemberSchema.parse(request.body);

    const updateData: any = {};
    if (body.role !== undefined) updateData.role = body.role;
    if (body.contactName !== undefined) updateData.contact_name = body.contactName;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;

    const { data, error } = await supabaseAdmin
      .from('branch_members')
      .update(updateData)
      .eq('id', id)
      .select(
        `
        id,
        branch_id,
        user_id,
        contact_name,
        role,
        is_active,
        created_at,
        updated_at
      `
      )
      .single();

    if (error) {
      throw new Error(`Failed to update branch member: ${error.message}`);
    }

    return reply.send({
      message: 'Branch member updated',
      member: data,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply
        .status(400)
        .send({ message: 'Validation failed', errors: error.errors });
    }
    return reply
      .status(500)
      .send({ message: error.message || 'Failed to update branch member' });
  }
};

export const deleteBranchMemberController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    if (!canViewAllLeads(user)) {
      return reply
        .status(403)
        .send({ message: 'Permission denied: Only TL/Admin can manage branches' });
    }

    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);

    const { error } = await supabaseAdmin
      .from('branch_members')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete branch member: ${error.message}`);
    }

    return reply.send({ message: 'Branch member deleted' });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply
        .status(400)
        .send({ message: 'Validation failed', errors: error.errors });
    }
    return reply
      .status(500)
      .send({ message: error.message || 'Failed to delete branch member' });
  }
};


