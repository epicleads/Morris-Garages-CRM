import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import authRoutes from './routes/auth.routes';
import developerRoutes from './routes/developer.routes';
import leadsRoutes from './routes/leads.routes';
import { env } from './config/env';
import { ensureDeveloper } from './services/auth.service';

const buildServer = () => {
  const fastify = Fastify({
    logger: true
  });

  fastify.register(helmet);
  fastify.register(cors, {
    origin: true,
    credentials: true
  });

  fastify.register(authRoutes);
  fastify.register(developerRoutes);
  fastify.register(leadsRoutes);

  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error instanceof Error && 'issues' in error) {
      return reply.status(400).send({ message: 'Validation failed', details: (error as any).issues });
    }

    const statusCode = error.statusCode ?? 500;
    return reply.status(statusCode).send({ message: error.message ?? 'Internal Server Error' });
  });

  return fastify;
};

export const startServer = async () => {
  const server = buildServer();
  await ensureDeveloper();
  try {
    await server.listen({ port: env.port, host: '0.0.0.0' });
    server.log.info(`Server listening on port ${env.port}`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

export default buildServer;

