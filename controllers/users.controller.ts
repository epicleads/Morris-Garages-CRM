import { FastifyReply, FastifyRequest } from 'fastify';
import { supabaseAdmin } from '../config/supabase';
import { canViewAllLeads } from '../services/permissions.service';
import { createUser, updateUser, CreateUserInput, UpdateUserInput } from '../services/user.service';
import { z } from 'zod';

const createUserSchema = z.object({
    fullName: z.string().max(200).nullable().optional(),
    username: z.string().min(3).max(120),
    password: z.string().min(8),
    // Allow creating Admin, CRE, CRE_TL and Receptionist from the panel.
    // Developer is managed separately via ensureDeveloperAccount.
    role: z.enum(['Admin', 'CRE', 'CRE_TL', 'Receptionist']),
    phoneNumber: z.string().max(30).nullable().optional(),
    email: z.string().email().nullable().optional(),
    status: z.boolean().optional()
});

const updateUserSchema = z.object({
    fullName: z.string().max(200).nullable().optional(),
    password: z.string().min(8).optional(),
    role: z.enum(['Admin', 'CRE', 'CRE_TL', 'Receptionist']).optional(),
    phoneNumber: z.string().max(30).nullable().optional(),
    email: z.string().email().nullable().optional(),
    status: z.boolean().optional()
});

/**
 * Get all users (for TL/Admin only)
 * GET /users
 */
export const getAllUsersController = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {
    try {
        const user = request.authUser!;

        // Only TL and Admin can view all users
        if (!canViewAllLeads(user)) {
            return reply.status(403).send({
                message: 'Permission denied: Only Team Leads can view all users',
            });
        }

        const { data: users, error } = await supabaseAdmin
            .from('users')
            .select('user_id, full_name, username, role, phone_number, email, status, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(`Failed to fetch users: ${error.message}`);
        }

        return reply.send({
            users: users || [],
            total: users?.length || 0,
        });
    } catch (error: any) {
        request.log.error(error);
        return reply.status(500).send({
            message: error.message || 'Failed to fetch users',
        });
    }
};

export const createUserController = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const user = request.authUser!;
        const allowedRoles = ['admin', 'cre_tl', 'tl'];
        if (!allowedRoles.includes(user.role.toLowerCase()) && !user.isDeveloper) {
            request.log.warn({ user }, 'Permission denied for user in createUserController');
            return reply.status(403).send({ message: 'Permission denied' });
        }

        const body = createUserSchema.parse(request.body);
        const result = await createUser(body as CreateUserInput);
        return reply.status(201).send(result);
    } catch (error: any) {
        request.log.error(error);
        return reply.status(400).send({ message: error.message || 'Failed to create user' });
    }
};

export const updateUserController = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const user = request.authUser!;
        const allowedRoles = ['admin', 'cre_tl', 'tl'];
        if (!allowedRoles.includes(user.role.toLowerCase()) && !user.isDeveloper) {
            request.log.warn({ user }, 'Permission denied for user in updateUserController');
            return reply.status(403).send({ message: 'Permission denied' });
        }

        const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
        const { id } = paramsSchema.parse(request.params);
        const body = updateUserSchema.parse(request.body);

        const result = await updateUser(id, body as UpdateUserInput);
        return reply.send(result);
    } catch (error: any) {
        request.log.error(error);
        return reply.status(400).send({ message: error.message || 'Failed to update user' });
    }
};
