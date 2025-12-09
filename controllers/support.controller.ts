import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  createTicket,
  getTickets,
  getTicketById,
  addTicketReply,
  updateTicketStatus,
  getTicketStatistics,
  cleanupOldTickets,
} from '../services/support.service';
import { uploadTicketImage } from '../services/storage.service';

const createTicketSchema = z.object({
  category: z.enum(['bug', 'feature', 'question', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  subject: z.string().min(1, 'Subject is required').max(200),
  description: z.string().min(1, 'Description is required'),
  attachments: z.array(z.string().url()).optional(),
});

const addReplySchema = z.object({
  message: z.string().min(1, 'Message is required'),
  attachments: z.array(z.string().url()).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
  assigned_to: z.number().int().positive().optional(),
});

/**
 * Create a new support ticket
 * POST /support/tickets
 */
export const createTicketController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const body = createTicketSchema.parse(request.body);

    const ticket = await createTicket({
      created_by: user.id,
      category: body.category,
      priority: body.priority,
      subject: body.subject,
      description: body.description,
      attachments: body.attachments,
    });

    return reply.status(201).send({
      success: true,
      message: 'Ticket created successfully',
      ticket,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to create ticket',
    });
  }
};

/**
 * Get all tickets (with filters)
 * GET /support/tickets
 */
export const getTicketsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const querySchema = z.object({
      status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
      category: z.enum(['bug', 'feature', 'question', 'other']).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      limit: z.coerce.number().int().positive().max(100).default(50),
      offset: z.coerce.number().int().nonnegative().default(0),
    });

    const query = querySchema.parse(request.query);

    // If user is not Developer, only show their own tickets
    const userId = user.role === 'Developer' ? undefined : user.id;

    const result = await getTickets({
      userId,
      ...query,
    });

    return reply.send(result);
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to fetch tickets',
    });
  }
};

/**
 * Get ticket by ID
 * GET /support/tickets/:id
 */
export const getTicketByIdController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({
      id: z.coerce.number().int().positive(),
    });

    const { id } = paramsSchema.parse(request.params);
    const ticket = await getTicketById(id);

    // Check permissions: user can only see their own tickets unless they're a Developer
    if (user.role !== 'Developer' && ticket.created_by !== user.id) {
      return reply.status(403).send({
        message: 'You do not have permission to view this ticket',
      });
    }

    return reply.send(ticket);
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to fetch ticket',
    });
  }
};

/**
 * Add reply to a ticket
 * POST /support/tickets/:id/replies
 */
export const addTicketReplyController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({
      id: z.coerce.number().int().positive(),
    });

    const { id } = paramsSchema.parse(request.params);
    const body = addReplySchema.parse(request.body);

    // Verify user has permission to reply
    const ticket = await getTicketById(id);
    if (user.role !== 'Developer' && ticket.created_by !== user.id) {
      return reply.status(403).send({
        message: 'You do not have permission to reply to this ticket',
      });
    }

    const replyData = await addTicketReply({
      ticket_id: id,
      replied_by: user.id,
      message: body.message,
      attachments: body.attachments,
    });

    return reply.status(201).send({
      success: true,
      message: 'Reply added successfully',
      reply: replyData,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to add reply',
    });
  }
};

/**
 * Update ticket status
 * PATCH /support/tickets/:id/status
 */
export const updateTicketStatusController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({
      id: z.coerce.number().int().positive(),
    });

    const { id } = paramsSchema.parse(request.params);
    const body = updateStatusSchema.parse(request.body);

    // Only Developers can update ticket status
    if (user.role !== 'Developer') {
      return reply.status(403).send({
        message: 'Only developers can update ticket status',
      });
    }

    const ticket = await updateTicketStatus(id, {
      status: body.status,
      assigned_to: body.assigned_to,
    });

    return reply.send({
      success: true,
      message: 'Ticket status updated successfully',
      ticket,
    });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    return reply.status(500).send({
      message: error.message || 'Failed to update ticket status',
    });
  }
};

/**
 * Get ticket statistics (Developer only)
 * GET /support/tickets/statistics
 */
export const getTicketStatisticsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;

    if (user.role !== 'Developer') {
      return reply.status(403).send({
        message: 'Only developers can view ticket statistics',
      });
    }

    const stats = await getTicketStatistics();
    return reply.send(stats);
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to fetch statistics',
    });
  }
};

/**
 * Upload image for ticket attachment
 * POST /support/upload-image
 */
export const uploadImageController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    
    // Fastify multipart handling
    if (!request.file) {
      return reply.status(400).send({
        message: 'Multipart plugin not registered',
      });
    }

    const data = await request.file();

    if (!data) {
      return reply.status(400).send({
        message: 'No file provided',
      });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    const mimetype = data.mimetype || '';
    if (!allowedTypes.some(type => mimetype.includes(type.split('/')[1]))) {
      return reply.status(400).send({
        message: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP, SVG) are allowed.',
      });
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    const buffer = await data.toBuffer();
    if (buffer.length > maxSize) {
      return reply.status(400).send({
        message: 'File size exceeds 5MB limit',
      });
    }

    const imageUrl = await uploadTicketImage(buffer, data.filename, user.id);

    return reply.send({
      success: true,
      url: imageUrl,
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to upload image',
    });
  }
};

/**
 * Cleanup old tickets (Developer only, typically called via cron)
 * POST /support/tickets/cleanup
 */
export const cleanupOldTicketsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;

    if (user.role !== 'Developer') {
      return reply.status(403).send({
        message: 'Only developers can run cleanup',
      });
    }

    const deletedCount = await cleanupOldTickets();

    return reply.send({
      success: true,
      message: `Cleaned up ${deletedCount} old tickets`,
      deletedCount,
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({
      message: error.message || 'Failed to cleanup old tickets',
    });
  }
};

