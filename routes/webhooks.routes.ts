import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { knowlarityWebhookController } from '../controllers/webhooks.controller';

export async function webhookRoutes(fastify: FastifyInstance) {
  // Test endpoint to verify webhook is accessible
  fastify.get('/webhooks/knowlarity/test', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      message: 'Webhook endpoint is accessible',
      url: '/webhooks/knowlarity',
      method: 'POST',
      timestamp: new Date().toISOString(),
    });
  });

  // Webhook endpoint - Knowlarity will POST call data here
  // No authentication required (we can add signature verification later if needed)
  fastify.post('/webhooks/knowlarity', knowlarityWebhookController);
}

