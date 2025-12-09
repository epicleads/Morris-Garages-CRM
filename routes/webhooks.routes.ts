import { FastifyInstance } from 'fastify';
import { knowlarityWebhookController } from '../controllers/webhooks.controller';

export async function webhookRoutes(fastify: FastifyInstance) {
  // Webhook endpoint - Knowlarity will POST call data here
  // No authentication required (we can add signature verification later if needed)
  fastify.post('/webhooks/knowlarity', knowlarityWebhookController);
}

