/// <reference path="../types/fastify.d.ts" />
import { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../services/token.service';
import { getUserById, toSafeUser } from '../services/user.service';
import { UserRole } from '../types/user';

// GuardRole includes all UserRole values (which already includes 'Developer')
// Explicitly list all roles for better type inference
export type GuardRole = 
  | 'Admin' 
  | 'CRE' 
  | 'CRE_TL' 
  | 'Receptionist' 
  | 'RM' 
  | 'RM_TL' 
  | 'GM' 
  | 'Developer';

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
      
      // Store token payload for impersonation checks
      (request as any).tokenPayload = payload;

      // If impersonating, check permissions based on the admin user, not the impersonated user
      let userRecord;
      if (payload.impersonatedBy) {
        // Get the admin user who is impersonating
        userRecord = await getUserById(payload.impersonatedBy);
      } else {
        // Normal user
        userRecord = await getUserById(payload.userId);
      }

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

      // Set authUser to the actual user being viewed (impersonated user if impersonating)
      const actualUserRecord = await getUserById(payload.userId);
      if (actualUserRecord) {
        request.authUser = toSafeUser(actualUserRecord);
      } else {
        request.authUser = safeUser;
      }
    } catch (error) {
      request.log.error(error);
      return reply.status(401).send({ message: 'Invalid token' });
    }
  };

