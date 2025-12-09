import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createUser, deleteUser, listUsers, updateUser } from '../services/user.service';
import {
  getSystemLogs,
  getErrorLogs,
  getLogStatistics,
  getSystemHealth,
  writeSystemLog,
} from '../services/logging.service';

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

/**
 * Get system logs
 * GET /developer/logs
 */
export const getSystemLogsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const querySchema = z.object({
      level: z.enum(['error', 'warn', 'info', 'debug']).optional(),
      userId: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(1000).default(100),
      offset: z.coerce.number().int().nonnegative().default(0),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      search: z.string().optional(),
    });

    const query = querySchema.parse(request.query);
    const result = await getSystemLogs(query);

    return reply.send(result);
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to fetch system logs',
    });
  }
};

/**
 * Get error logs only
 * GET /developer/errors
 */
export const getErrorLogsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const querySchema = z.object({
      limit: z.coerce.number().int().positive().max(1000).default(100),
      offset: z.coerce.number().int().nonnegative().default(0),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      search: z.string().optional(),
    });

    const query = querySchema.parse(request.query);
    const result = await getErrorLogs(query);

    return reply.send(result);
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to fetch error logs',
    });
  }
};

/**
 * Get log statistics
 * GET /developer/logs/statistics
 */
export const getLogStatisticsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const querySchema = z.object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    });

    const query = querySchema.parse(request.query);
    const stats = await getLogStatistics(query);

    return reply.send(stats);
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to fetch log statistics',
    });
  }
};

/**
 * Get system health
 * GET /developer/health
 */
export const getSystemHealthController = async (
  _request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const health = await getSystemHealth();
    return reply.send(health);
  } catch (error: any) {
    return reply.status(500).send({
      message: error.message || 'Failed to fetch system health',
    });
  }
};

/**
 * Write a system log (for testing or manual logging)
 * POST /developer/logs
 */
export const writeSystemLogController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const bodySchema = z.object({
      level: z.enum(['error', 'warn', 'info', 'debug']),
      message: z.string().min(1),
      metadata: z.record(z.any()).optional(),
    });

    const body = bodySchema.parse(request.body);
    const user = request.authUser!;

    await writeSystemLog({
      ...body,
      user_id: user.id,
    });

    return reply.send({ success: true, message: 'Log written successfully' });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to write log',
    });
  }
};

