import 'fastify';
import { AuthenticatedUser } from './user';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthenticatedUser;
  }
}

