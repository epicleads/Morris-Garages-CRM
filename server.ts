import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import authRoutes from './routes/auth.routes';
import developerRoutes from './routes/developer.routes';
import leadsRoutes from './routes/leads.routes';
import assignmentRoutes from './routes/assignment.routes';
import assignmentConfigRoutes from './routes/assignment-config.routes';
import sourcesRoutes from './routes/sources.routes';
import branchesRoutes from './routes/branches.routes';
import creRoutes from './routes/cre.routes';
import usersRoutes from './routes/users.routes';
import { adminRoutes } from './routes/admin.routes';
import analyticsRoutes from './routes/analytics.routes';
import { webhookRoutes } from './routes/webhooks.routes';
import { env } from './config/env';
import { ensureDeveloper } from './services/auth.service';
import { startSyncWorker } from './services/sync-worker.service';

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
  fastify.register(assignmentRoutes);
  fastify.register(assignmentConfigRoutes);
  fastify.register(sourcesRoutes);
  fastify.register(creRoutes);
  fastify.register(usersRoutes);
  fastify.register(adminRoutes);
  fastify.register(branchesRoutes);
  fastify.register(analyticsRoutes);
  fastify.register(webhookRoutes);

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
  try {
    await ensureDeveloper();
  } catch (error: any) {
    server.log.warn(
      `ensureDeveloper failed: ${error?.message || 'unknown error'}. Continuing startup.`
    );
  }

  try {
    await server.listen({ port: env.port, host: '0.0.0.0' });
    server.log.info(`Server listening on port ${env.port}`);
    
    // Start sync worker for real-time lead syncing (backup method)
    // Only start if SYNC_WORKER_ENABLED is not explicitly set to false
    // Note: Webhooks are the primary sync method, sync worker is backup
    const syncWorkerEnv = (process.env.SYNC_WORKER_ENABLED || '').trim().toLowerCase();
    const syncWorkerEnabled = syncWorkerEnv !== 'false';
    
    if (syncWorkerEnabled) {
      server.log.info('Sync worker enabled - starting initialization...');
      startSyncWorker().catch(err => {
        server.log.warn('Sync worker failed to start (this is OK if using webhooks):', err);
      });
    } else {
      server.log.info('==========================================');
      server.log.info('Sync worker DISABLED (SYNC_WORKER_ENABLED=false)');
      server.log.info('Using webhooks as primary sync method ✓');
      server.log.info('GitHub Actions as backup (1-minute sync) ✓');
      server.log.info('==========================================');
    }
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
};

// Start server if this file is run directly
if (require.main === module || process.env.NODE_ENV === 'production') {
  startServer();
}

export default buildServer;

