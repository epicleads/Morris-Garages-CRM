import { FastifyReply, FastifyRequest } from 'fastify';
import { getReceptionDashboard } from '../services/reception.service';

type AuthenticatedRequest = FastifyRequest & {
  authUser?: {
    id: number;
    role: string;
  };
};

export const getReceptionDashboardController = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const result = await getReceptionDashboard({
      id: user.id,
      role: user.role as any,
    } as any);

    return reply.send(result);
  } catch (error: any) {
    request.log.error(error);
    return reply.status(400).send({
      message: error.message || 'Failed to fetch reception dashboard',
    });
  }
};


