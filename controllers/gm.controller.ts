import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  getGmBookings,
  approveGmBooking,
  rejectGmBooking,
  getGmRetails,
  approveGmRetail,
  rejectGmRetail,
  getCustomerJourney,
  sendGmReminderForBooking,
  listGmReminders,
  getRmLeadsForReminder,
  sendGmReminderForLeads,
} from '../services/gm.service';

const getBookingsSchema = z.object({
  status: z.string().optional(),
});

const approveBookingSchema = z.object({
  remarks: z.string().optional().nullable(),
});

const rejectBookingSchema = z.object({
  remarks: z.string().min(1, 'Remarks are required for rejection'),
});

const getRetailsSchema = z.object({
  status: z.string().optional(),
});

const approveRetailSchema = z.object({
  remarks: z.string().optional().nullable(),
});

const rejectRetailSchema = z.object({
  remarks: z.string().min(1, 'Remarks are required for rejection'),
});

const sendReminderSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  toRm: z.boolean().optional().default(true),
  toTl: z.boolean().optional().default(false),
});

const getRmLeadsForReminderSchema = z.object({
  rmMemberId: z.coerce.number().int().positive(),
});

const sendLeadRemindersSchema = z.object({
  rmMemberId: z.coerce.number().int().positive(),
  leadIds: z.array(z.coerce.number().int().positive()).min(1),
  message: z.string().min(1, 'Message is required'),
  toRm: z.boolean().optional().default(true),
  toTl: z.boolean().optional().default(false),
});

export const getGmRemindersController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const data = await listGmReminders(user);
    return reply.send({ reminders: data });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: error.message || 'Failed to fetch reminders' });
  }
};

export const getRmLeadsForReminderController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const query = getRmLeadsForReminderSchema.parse(request.query);
    const leads = await getRmLeadsForReminder(user, query.rmMemberId);
    return reply.send({ leads });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to fetch RM leads' });
  }
};

export const getGmBookingsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const filters = getBookingsSchema.parse(request.query);
    const data = await getGmBookings(user, filters);
    return reply.send({ bookings: data });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to fetch bookings' });
  }
};

export const approveGmBookingController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const { id } = request.params as { id: string };
    const body = approveBookingSchema.parse(request.body);
    await approveGmBooking(user, parseInt(id, 10), body.remarks || undefined);
    return reply.send({ message: 'Booking approved successfully' });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to approve booking' });
  }
};

export const rejectGmBookingController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const { id } = request.params as { id: string };
    const body = rejectBookingSchema.parse(request.body);
    await rejectGmBooking(user, parseInt(id, 10), body.remarks);
    return reply.send({ message: 'Booking rejected successfully' });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to reject booking' });
  }
};

export const getGmRetailsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const filters = getRetailsSchema.parse(request.query);
    const data = await getGmRetails(user, filters);
    return reply.send({ retails: data });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to fetch retails' });
  }
};

export const approveGmRetailController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const { id } = request.params as { id: string };
    const body = approveRetailSchema.parse(request.body);
    await approveGmRetail(user, parseInt(id, 10), body.remarks || undefined);
    return reply.send({ message: 'Retail approved successfully' });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to approve retail' });
  }
};

export const rejectGmRetailController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const { id } = request.params as { id: string };
    const body = rejectRetailSchema.parse(request.body);
    await rejectGmRetail(user, parseInt(id, 10), body.remarks);
    return reply.send({ message: 'Retail rejected successfully' });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to reject retail' });
  }
};

export const sendGmBookingReminderController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const { id } = request.params as { id: string };
    const body = sendReminderSchema.parse(request.body);

    await sendGmReminderForBooking(user, {
      bookingId: parseInt(id, 10),
      message: body.message,
      toRm: body.toRm,
      toTl: body.toTl,
    });

    return reply.send({ message: 'Reminder sent successfully' });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to send reminder' });
  }
};

export const getCustomerJourneyController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const { id } = request.params as { id: string };
    const data = await getCustomerJourney(user, parseInt(id, 10));
    return reply.send(data);
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ message: error.message || 'Failed to fetch customer journey' });
  }
};

export const sendGmLeadRemindersController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const body = sendLeadRemindersSchema.parse(request.body);

    await sendGmReminderForLeads(user, {
      rmMemberId: body.rmMemberId,
      leadIds: body.leadIds,
      message: body.message,
      toRm: body.toRm,
      toTl: body.toTl,
    });

    return reply.send({ message: 'Reminders sent successfully' });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to send reminders' });
  }
};

