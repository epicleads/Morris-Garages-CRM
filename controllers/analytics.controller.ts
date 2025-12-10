import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  getDashboardMetrics,
  getSourceDistribution,
  getCrePerformance,
  getBranchDistribution,
  getQualificationDistribution,
  getTopPerformingCres,
  getConversionFunnel,
  getAdvancedAnalytics,
  AdvancedAnalyticsFilters,
  DateRange,
} from '../services/analytics.service';

// Date range schema
const dateRangeSchema = z.object({
  type: z.enum(['today', 'mtd', 'ytd', 'all', 'custom']),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * GET /analytics/dashboard
 * Get comprehensive dashboard metrics
 */
export const getDashboardMetricsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    // Only Admin and CRE_TL can access analytics
    if (user.role !== 'Admin' && user.role !== 'CRE_TL') {
      return reply.status(403).send({ message: 'Forbidden: Analytics access restricted' });
    }

    const query = request.query as any;
    const dateRange: DateRange = {
      type: query.type || 'today',
      startDate: query.startDate,
      endDate: query.endDate,
    };

    // Validate date range
    const validated = dateRangeSchema.parse(dateRange);
    if (validated.type === 'custom' && (!validated.startDate || !validated.endDate)) {
      return reply.status(400).send({ message: 'Custom date range requires startDate and endDate' });
    }

    const metrics = await getDashboardMetrics(validated);

    return reply.send({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    console.error('Error fetching dashboard metrics:', error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Invalid date range parameters', errors: error.errors });
    }
    return reply.status(500).send({ message: 'Failed to fetch dashboard metrics', error: error.message });
  }
};

/**
 * GET /analytics/sources
 * Get source-wise leads distribution
 */
export const getSourceDistributionController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    if (user.role !== 'Admin' && user.role !== 'CRE_TL') {
      return reply.status(403).send({ message: 'Forbidden: Analytics access restricted' });
    }

    const query = request.query as any;
    const dateRange: DateRange = {
      type: query.type || 'today',
      startDate: query.startDate,
      endDate: query.endDate,
    };

    const validated = dateRangeSchema.parse(dateRange);
    if (validated.type === 'custom' && (!validated.startDate || !validated.endDate)) {
      return reply.status(400).send({ message: 'Custom date range requires startDate and endDate' });
    }

    const distribution = await getSourceDistribution(validated);

    return reply.send({
      success: true,
      data: distribution,
    });
  } catch (error: any) {
    console.error('Error fetching source distribution:', error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Invalid date range parameters', errors: error.errors });
    }
    return reply.status(500).send({ message: 'Failed to fetch source distribution', error: error.message });
  }
};

/**
 * GET /analytics/cre-performance
 * Get CRE-wise leads distribution
 */
export const getCrePerformanceController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    if (user.role !== 'Admin' && user.role !== 'CRE_TL') {
      return reply.status(403).send({ message: 'Forbidden: Analytics access restricted' });
    }

    const query = request.query as any;
    const dateRange: DateRange = {
      type: query.type || 'today',
      startDate: query.startDate,
      endDate: query.endDate,
    };

    const validated = dateRangeSchema.parse(dateRange);
    if (validated.type === 'custom' && (!validated.startDate || !validated.endDate)) {
      return reply.status(400).send({ message: 'Custom date range requires startDate and endDate' });
    }

    const performance = await getCrePerformance(validated);

    return reply.send({
      success: true,
      data: performance,
    });
  } catch (error: any) {
    console.error('Error fetching CRE performance:', error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Invalid date range parameters', errors: error.errors });
    }
    return reply.status(500).send({ message: 'Failed to fetch CRE performance', error: error.message });
  }
};

/**
 * GET /analytics/branches
 * Get branch-wise lead distribution (ETBR)
 */
export const getBranchDistributionController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    if (user.role !== 'Admin' && user.role !== 'CRE_TL') {
      return reply.status(403).send({ message: 'Forbidden: Analytics access restricted' });
    }

    const query = request.query as any;
    const dateRange: DateRange = {
      type: query.type || 'today',
      startDate: query.startDate,
      endDate: query.endDate,
    };

    const validated = dateRangeSchema.parse(dateRange);
    if (validated.type === 'custom' && (!validated.startDate || !validated.endDate)) {
      return reply.status(400).send({ message: 'Custom date range requires startDate and endDate' });
    }

    const distribution = await getBranchDistribution(validated);

    return reply.send({
      success: true,
      data: distribution,
    });
  } catch (error: any) {
    console.error('Error fetching branch distribution:', error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Invalid date range parameters', errors: error.errors });
    }
    return reply.status(500).send({ message: 'Failed to fetch branch distribution', error: error.message });
  }
};

/**
 * GET /analytics/qualification-categories
 * Get qualification category distribution
 */
export const getQualificationDistributionController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    if (user.role !== 'Admin' && user.role !== 'CRE_TL') {
      return reply.status(403).send({ message: 'Forbidden: Analytics access restricted' });
    }

    const query = request.query as any;
    const dateRange: DateRange = {
      type: query.type || 'today',
      startDate: query.startDate,
      endDate: query.endDate,
    };

    const validated = dateRangeSchema.parse(dateRange);
    if (validated.type === 'custom' && (!validated.startDate || !validated.endDate)) {
      return reply.status(400).send({ message: 'Custom date range requires startDate and endDate' });
    }

    const distribution = await getQualificationDistribution(validated);

    return reply.send({
      success: true,
      data: distribution,
    });
  } catch (error: any) {
    console.error('Error fetching qualification distribution:', error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Invalid date range parameters', errors: error.errors });
    }
    return reply.status(500).send({ message: 'Failed to fetch qualification distribution', error: error.message });
  }
};

/**
 * GET /analytics/top-cres
 * Get top performing CREs (leaderboard)
 */
export const getTopPerformingCresController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    if (user.role !== 'Admin' && user.role !== 'CRE_TL') {
      return reply.status(403).send({ message: 'Forbidden: Analytics access restricted' });
    }

    const query = request.query as any;
    const limit = parseInt(query.limit || '10', 10);
    const dateRange: DateRange = {
      type: query.type || 'today',
      startDate: query.startDate,
      endDate: query.endDate,
    };

    const validated = dateRangeSchema.parse(dateRange);
    if (validated.type === 'custom' && (!validated.startDate || !validated.endDate)) {
      return reply.status(400).send({ message: 'Custom date range requires startDate and endDate' });
    }

    const leaderboard = await getTopPerformingCres(limit, validated);

    return reply.send({
      success: true,
      data: leaderboard,
    });
  } catch (error: any) {
    console.error('Error fetching top CREs:', error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Invalid date range parameters', errors: error.errors });
    }
    return reply.status(500).send({ message: 'Failed to fetch top CREs', error: error.message });
  }
};

/**
 * GET /analytics/funnel
 * Get conversion funnel
 */
export const getConversionFunnelController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    if (user.role !== 'Admin' && user.role !== 'CRE_TL') {
      return reply.status(403).send({ message: 'Forbidden: Analytics access restricted' });
    }

    const query = request.query as any;
    const dateRange: DateRange = {
      type: query.type || 'today',
      startDate: query.startDate,
      endDate: query.endDate,
    };

    const validated = dateRangeSchema.parse(dateRange);
    if (validated.type === 'custom' && (!validated.startDate || !validated.endDate)) {
      return reply.status(400).send({ message: 'Custom date range requires startDate and endDate' });
    }

    const funnel = await getConversionFunnel(validated);

    return reply.send({
      success: true,
      data: funnel,
    });
  } catch (error: any) {
    console.error('Error fetching conversion funnel:', error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Invalid date range parameters', errors: error.errors });
    }
    return reply.status(500).send({ message: 'Failed to fetch conversion funnel', error: error.message });
  }
};

// Advanced analytics filters schema
const advancedAnalyticsSchema = z.object({
  dateRange: dateRangeSchema.optional(),
  sourceIds: z.array(z.number().int().positive()).optional(),
  subSources: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  creIds: z.array(z.number().int().positive()).optional(),
  branchIds: z.array(z.number().int().positive()).optional(),
  statuses: z.array(z.string()).optional(),
  models: z.array(z.string()).optional(),
  variants: z.array(z.string()).optional(),
  qualificationCategories: z.array(z.string()).optional(),
  testDrive: z.boolean().nullable().optional(),
  booked: z.boolean().nullable().optional(),
  retailed: z.boolean().nullable().optional(),
});

/**
 * POST /analytics/advanced
 * Get advanced analytics with comprehensive filters
 */
export const getAdvancedAnalyticsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    if (user.role !== 'Admin' && user.role !== 'CRE_TL') {
      return reply.status(403).send({ message: 'Forbidden: Analytics access restricted' });
    }

    const body = request.body as any;
    const validated = advancedAnalyticsSchema.parse(body);

    // Validate custom date range if provided
    if (validated.dateRange?.type === 'custom' && (!validated.dateRange.startDate || !validated.dateRange.endDate)) {
      return reply.status(400).send({ message: 'Custom date range requires startDate and endDate' });
    }

    const filters: AdvancedAnalyticsFilters = {
      dateRange: validated.dateRange,
      sourceIds: validated.sourceIds,
      subSources: validated.subSources,
      locations: validated.locations,
      creIds: validated.creIds,
      branchIds: validated.branchIds,
      statuses: validated.statuses,
      models: validated.models,
      variants: validated.variants,
      qualificationCategories: validated.qualificationCategories,
      testDrive: validated.testDrive,
      booked: validated.booked,
      retailed: validated.retailed,
    };

    const result = await getAdvancedAnalytics(filters);

    return reply.send({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error fetching advanced analytics:', error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Invalid filter parameters', errors: error.errors });
    }
    return reply.status(500).send({ message: 'Failed to fetch advanced analytics', error: error.message });
  }
};

