import { FastifyRequest, FastifyReply } from 'fastify';
import { processKnowlarityWebhook } from '../services/webhooks.service';

export const knowlarityWebhookController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    // Log incoming webhook for debugging
    request.log.info({
      headers: request.headers,
      body: request.body,
    }, '[Webhook] Received Knowlarity webhook');

    const payload = request.body as any;

    // Process the call log immediately
    await processKnowlarityWebhook(payload);

    return reply.send({ success: true, message: 'Webhook processed successfully' });
  } catch (error: any) {
    request.log.error(error, '[Webhook] Knowlarity webhook error');
    return reply.status(500).send({
      success: false,
      message: 'Failed to process webhook',
      error: error.message,
    });
  }
};

