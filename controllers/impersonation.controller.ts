import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  startImpersonation,
  endImpersonation,
  getActiveImpersonationSession,
  getImpersonationHistory,
} from '../services/impersonation.service';
import { getUserById } from '../services/user.service';

const startImpersonationSchema = z.object({
  targetUserId: z.number().int().positive(),
});

/**
 * Start impersonation
 * POST /impersonation/start
 */
export const startImpersonationController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = (request as any).authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const body = startImpersonationSchema.parse(request.body);
    const result = await startImpersonation(user.id, body.targetUserId);

    return reply.send({
      message: 'Impersonation started successfully',
      accessToken: result.accessToken,
      impersonatedUser: result.impersonatedUser,
      sessionId: result.sessionId,
    });
  } catch (error: any) {
    request.log.error({ err: error }, 'Failed to start impersonation');
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Invalid request', errors: error.errors });
    }
    return reply.status(400).send({ message: error.message || 'Failed to start impersonation' });
  }
};

/**
 * End impersonation
 * POST /impersonation/end
 */
export const endImpersonationController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = (request as any).authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    // Get session ID and admin user ID from token
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ message: 'Missing Authorization header' });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { verifyAccessToken } = await import('../services/token.service');
    const tokenPayload = verifyAccessToken(token);

    let sessionId = tokenPayload.impersonationSessionId;
    let adminUserId = tokenPayload.impersonatedBy;

    // If token doesn't have impersonation metadata (e.g., after refresh),
    // try to find active session for the current user (if they're an admin)
    if (!sessionId || !adminUserId) {
      // Check if current user is admin/CRE_TL and has an active session
      if (user.role === 'Admin' || user.role === 'CRE_TL' || user.isDeveloper) {
        const { getActiveImpersonationSession } = await import('../services/impersonation.service');
        const activeSession = await getActiveImpersonationSession(user.id);
        if (activeSession) {
          sessionId = activeSession.id;
          adminUserId = activeSession.admin_user_id;
        }
      }
    }

    if (!sessionId || !adminUserId) {
      return reply.status(400).send({ message: 'No active impersonation session found' });
    }

    await endImpersonation(sessionId, adminUserId);

    // Get admin user to generate new token
    const adminUser = await getUserById(adminUserId);
    if (!adminUser) {
      return reply.status(404).send({ message: 'Admin user not found' });
    }

    // Generate new access token for admin
    const { generateAccessToken } = await import('../services/token.service');
    const { toSafeUser } = await import('../services/user.service');
    const safeUser = toSafeUser(adminUser);
    const accessToken = generateAccessToken({
      userId: safeUser.id,
      role: safeUser.role,
      username: safeUser.username,
      isDeveloper: safeUser.isDeveloper,
    });

    return reply.send({
      message: 'Impersonation ended successfully',
      accessToken,
      user: safeUser,
    });
  } catch (error: any) {
    request.log.error({ err: error }, 'Failed to end impersonation');
    return reply.status(400).send({ message: error.message || 'Failed to end impersonation' });
  }
};

/**
 * Get active impersonation session
 * GET /impersonation/active
 */
export const getActiveSessionController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = (request as any).authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    // Get admin user ID from token
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ message: 'Missing Authorization header' });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { verifyAccessToken } = await import('../services/token.service');
    const tokenPayload = verifyAccessToken(token);
    const adminUserId = tokenPayload.impersonatedBy || user.id;

    const session = await getActiveImpersonationSession(adminUserId);

    if (!session) {
      return reply.send({ session: null });
    }

    // Get impersonated user details
    const impersonatedUser = await getUserById(session.impersonated_user_id);

    return reply.send({
      session: {
        ...session,
        impersonatedUser: impersonatedUser
          ? {
              id: impersonatedUser.user_id,
              full_name: impersonatedUser.full_name,
              username: impersonatedUser.username,
            }
          : null,
      },
    });
  } catch (error: any) {
    request.log.error({ err: error }, 'Failed to get active session');
    return reply.status(500).send({ message: error.message || 'Failed to get active session' });
  }
};

/**
 * Get impersonation history
 * GET /impersonation/history
 */
export const getHistoryController = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const user = (request as any).authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const limit = parseInt((request.query as any)?.limit || '50');
    const history = await getImpersonationHistory(user.id, limit);

    // Enrich with user details
    const enrichedHistory = await Promise.all(
      history.map(async (session) => {
        const impersonatedUser = await getUserById(session.impersonated_user_id);
        return {
          ...session,
          impersonatedUser: impersonatedUser
            ? {
                id: impersonatedUser.user_id,
                full_name: impersonatedUser.full_name,
                username: impersonatedUser.username,
              }
            : null,
        };
      })
    );

    return reply.send({ history: enrichedHistory });
  } catch (error: any) {
    request.log.error({ err: error }, 'Failed to get impersonation history');
    return reply
      .status(500)
      .send({ message: error.message || 'Failed to get impersonation history' });
  }
};

