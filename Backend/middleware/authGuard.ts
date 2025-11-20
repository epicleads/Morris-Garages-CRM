/// <reference path="../types/fastify.d.ts" />
import { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../services/token.service';
import { getUserById, toSafeUser } from '../services/user.service';
import { UserRole } from '../types/user';

type GuardRole = UserRole | 'Developer';

export const authorize =
  (allowedRoles?: GuardRole[]) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;

      if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ message: 'Missing Authorization header' });
      }

      const token = authHeader.replace('Bearer ', '').trim();
      const payload = verifyAccessToken(token);
      const userRecord = await getUserById(payload.userId);

      if (!userRecord || !userRecord.status) {
        return reply.status(401).send({ message: 'User disabled' });
      }

      const safeUser = toSafeUser(userRecord);

      if (allowedRoles && allowedRoles.length > 0) {
        const permitted = allowedRoles.some((role) => {
          if (role === 'Developer') {
            return safeUser.isDeveloper;
          }
          return safeUser.role === role;
        });

        if (!permitted) {
          return reply.status(403).send({ message: 'Forbidden' });
        }
      }

      request.authUser = safeUser;
    } catch (error) {
      request.log.error(error);
      return reply.status(401).send({ message: 'Invalid token' });
    }
  };

