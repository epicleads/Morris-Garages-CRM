import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getCrePerformanceMetrics, getCreLeaderboard } from '../services/cre-analytics.service';
import { DateRange } from '../services/analytics.service';

const dateRangeSchema = z.object({
  type: z.enum(['today', 'mtd', 'ytd', 'all', 'custom']),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * GET /cre/analytics/performance
 * Get performance metrics for the current CRE
 */
export const getCrePerformanceController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = (request as any).authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    if (user.role !== 'CRE') {
      return reply.status(403).send({ message: 'Forbidden: Only CRE users can access this endpoint' });
    }

    const query = z.object({
      dateRange: dateRangeSchema.optional(),
    }).parse(request.query);

    const dateRange: DateRange = query.dateRange || { type: 'mtd' };

    const metrics = await getCrePerformanceMetrics(user.id, dateRange);

    return reply.send({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    request.log.error({ err: error }, 'Failed to get CRE performance metrics');
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Invalid query parameters', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to get CRE performance metrics' });
  }
};

/**
 * GET /cre/analytics/leaderboard
 * Get CRE leaderboard (Admin/CRE_TL only)
 */
export const getCreLeaderboardController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = (request as any).authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    if (user.role !== 'Admin' && user.role !== 'CRE_TL' && !user.isDeveloper) {
      return reply.status(403).send({ message: 'Forbidden: Only Admin/CRE_TL can access leaderboard' });
    }

    // Parse query parameters (can be nested object or flat)
    const queryParams = request.query as any;
    let dateRange: DateRange = { type: 'mtd' };
    
    if (queryParams.dateRange && typeof queryParams.dateRange === 'object') {
      dateRange = dateRangeSchema.parse(queryParams.dateRange);
    } else if (queryParams['dateRange[type]']) {
      // Handle flat query params
      dateRange = {
        type: queryParams['dateRange[type]'] as DateRangeType,
        startDate: queryParams['dateRange[startDate]'],
        endDate: queryParams['dateRange[endDate]'],
      };
      dateRange = dateRangeSchema.parse(dateRange);
    } else {
      dateRange = { type: 'mtd' };
    }
    
    const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : 50;

    const leaderboard = await getCreLeaderboard(dateRange, limit);

    return reply.send({
      success: true,
      data: leaderboard,
    });
  } catch (error: any) {
    request.log.error({ err: error }, 'Failed to get CRE leaderboard');
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Invalid query parameters', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to get CRE leaderboard' });
  }
};

