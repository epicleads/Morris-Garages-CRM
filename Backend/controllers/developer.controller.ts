import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createUser, deleteUser, listUsers, updateUser } from '../services/user.service';

const baseUserSchema = {
  fullName: z.string().max(200).nullable().optional(),
  username: z.string().min(3).max(120),
  password: z.string().min(8),
  role: z.enum(['Admin', 'CRE', 'CRE_TL']),
  phoneNumber: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  status: z.boolean().optional()
};

const createSchema = z.object(baseUserSchema);

const updateSchema = z
  .object({
    fullName: z.string().max(200).nullable().optional(),
    password: z.string().min(8).optional(),
    role: z.enum(['Admin', 'CRE', 'CRE_TL']).optional(),
    phoneNumber: z.string().max(30).nullable().optional(),
    email: z.string().email().nullable().optional(),
    status: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

export const createUserController = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = createSchema.parse(request.body);
  const result = await createUser(body);
  return reply.status(201).send(result);
};

export const listUsersController = async (_request: FastifyRequest, reply: FastifyReply) => {
  const users = await listUsers();
  return reply.send(users);
};

export const updateUserController = async (request: FastifyRequest, reply: FastifyReply) => {
  const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
  const { id } = paramsSchema.parse(request.params);
  const body = updateSchema.parse(request.body);

  if (request.authUser?.id === id) {
    return reply.status(400).send({ message: 'Use profile endpoint to update self' });
  }

  const result = await updateUser(id, body);
  return reply.send(result);
};

export const deleteUserController = async (request: FastifyRequest, reply: FastifyReply) => {
  const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
  const { id } = paramsSchema.parse(request.params);

  if (request.authUser?.id === id) {
    return reply.status(400).send({ message: 'Cannot delete developer session' });
  }

  await deleteUser(id);
  return reply.status(204).send();
};

