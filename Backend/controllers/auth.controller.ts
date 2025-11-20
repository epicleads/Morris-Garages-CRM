import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticateUser, getProfile, logoutSession, refreshSession } from '../services/auth.service';

const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10)
});

export const loginController = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = loginSchema.parse(request.body);
  const result = await authenticateUser(body.username, body.password);
  return reply.send(result);
};

export const refreshController = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = refreshSchema.parse(request.body);
  const result = await refreshSession(body.refreshToken);
  return reply.send(result);
};

export const logoutController = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = refreshSchema.parse(request.body);
  await logoutSession(body.refreshToken);
  return reply.status(204).send();
};

export const profileController = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.authUser) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }
  const user = await getProfile(request.authUser.id);
  return reply.send(user);
};

