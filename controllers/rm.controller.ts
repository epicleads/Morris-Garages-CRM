import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  listRmLeads,
  getRmLeadDetail,
  updateRmQualification,
  createRmTestDrive,
  createRmBooking,
  createRmRetail,
  listRmReminders,
  markRmReminderRead,
  RmLeadListFilters,
  RmQualificationUpdateInput,
  RmTestDriveInput,
  RmBookingInput,
  RmRetailInput
} from '../services/rm.service';

type AuthenticatedRequest = FastifyRequest & {
  authUser?: {
    id: number;
    role: string;
  };
};

const rmLeadListQuerySchema = z.object({
  status: z.string().optional(), // comma separated
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  branchId: z.coerce.number().int().positive().optional()
});

const rmQualificationUpdateSchema = z.object({
  age_group: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  income_group: z.string().optional().nullable(),
  profession: z.string().optional().nullable(),
  buying_for: z.string().optional().nullable(),
  daily_running_km: z.coerce.number().int().optional().nullable(),
  current_car_details: z.string().optional().nullable(),
  buyer_type: z.string().optional().nullable(),
  evaluation_required: z.boolean().optional().nullable(),
  old_car_details: z.string().optional().nullable(),
  old_car_expected_price: z.coerce.number().optional().nullable(),
  existing_mg_customer: z.boolean().optional().nullable(),
  family_members_count: z.coerce.number().int().optional().nullable(),
  next_followup_at: z.string().datetime().optional().nullable(),
  remarks: z.string().optional().nullable(),
  // RM stage / category
  qualified_category: z.string().optional().nullable(),
  model_interested: z.string().optional().nullable(),
  variant: z.string().optional().nullable(),
  customer_location: z.string().optional().nullable(),
  purchase_timeline: z.string().optional().nullable(),
  finance_type: z.string().optional().nullable()
});

const rmTestDriveSchema = z.object({
  model: z.string().min(1),
  variant: z.string().optional(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  given_by_user_id: z.coerce.number().int().positive().optional(),
  remarks: z.string().optional()
});

const rmBookingSchema = z.object({
  vehicle_price: z.coerce.number().positive(),
  discounts_offered: z.coerce.number().optional(),
  special_commitments: z.string().optional(),
  booking_amount: z.coerce.number().positive(),
  payment_mode: z.string().min(1),
  transaction_details: z.string().optional(),
  transaction_proof_url: z.string().optional(),
  expected_delivery_date: z.string().date().optional(),
  mode_of_purchase: z.string().optional()
});

const rmRetailSchema = z.object({
  invoice_number: z.string().optional(),
  invoice_date: z.string().date().optional(),
  on_road_price: z.coerce.number().optional(),
  remarks: z.string().optional()
});

const rmReminderUpdateSchema = z.object({
  status: z.enum(['read']).optional(),
});

export const listRmLeadsController = async (request: AuthenticatedRequest, reply: FastifyReply) => {
  try {
    const user = request.authUser!;
    const query = rmLeadListQuerySchema.parse(request.query);

    const filters: RmLeadListFilters = {
      status: query.status ? query.status.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      branchId: query.branchId
    };

    const result = await listRmLeads(user as any, filters);
    return reply.send(result);
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(400).send({ message: error.message || 'Failed to list RM leads' });
  }
};

export const getRmLeadDetailController = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);

    const result = await getRmLeadDetail(user as any, id);
    return reply.send(result);
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    if (error.message?.includes('Access denied')) {
      return reply.status(403).send({ message: error.message });
    }
    if (error.message?.includes('not found')) {
      return reply.status(404).send({ message: error.message });
    }
    return reply.status(400).send({ message: error.message || 'Failed to fetch RM lead detail' });
  }
};

export const updateRmQualificationController = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);
    const body = rmQualificationUpdateSchema.parse(request.body);

    const input: RmQualificationUpdateInput = body;
    const updated = await updateRmQualification(user as any, id, input);

    return reply.send({ message: 'RM qualification updated', qualification: updated });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    if (error.message?.includes('Access denied')) {
      return reply.status(403).send({ message: error.message });
    }
    if (error.message?.includes('not found')) {
      return reply.status(404).send({ message: error.message });
    }
    return reply.status(400).send({ message: error.message || 'Failed to update RM qualification' });
  }
};

export const createRmTestDriveController = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);
    const body = rmTestDriveSchema.parse(request.body);

    const input: RmTestDriveInput = body;
    const testDrive = await createRmTestDrive(user as any, id, input);

    return reply.status(201).send({ message: 'Test drive created', testDrive });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    if (error.message?.includes('Access denied')) {
      return reply.status(403).send({ message: error.message });
    }
    if (error.message?.includes('not found')) {
      return reply.status(404).send({ message: error.message });
    }
    return reply.status(400).send({ message: error.message || 'Failed to create test drive' });
  }
};

export const createRmBookingController = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);
    const body = rmBookingSchema.parse(request.body);

    const input: RmBookingInput = body;
    const booking = await createRmBooking(user as any, id, input);

    return reply.status(201).send({ message: 'Booking created', booking });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    if (error.message?.includes('Access denied')) {
      return reply.status(403).send({ message: error.message });
    }
    if (error.message?.includes('not found')) {
      return reply.status(404).send({ message: error.message });
    }
    return reply.status(400).send({ message: error.message || 'Failed to create booking' });
  }
};

export const createRmRetailController = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);
    const body = rmRetailSchema.parse(request.body);

    const input: RmRetailInput = body;
    const retail = await createRmRetail(user as any, id, input);

    return reply.status(201).send({ message: 'Retail created (pending GM approval)', retail });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    if (error.message?.includes('Access denied')) {
      return reply.status(403).send({ message: error.message });
    }
    if (error.message?.includes('Qualification not found') || error.message?.includes('booking')) {
      return reply.status(400).send({ message: error.message });
    }
    return reply.status(400).send({ message: error.message || 'Failed to create retail' });
  }
};

export const listRmRemindersController = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const reminders = await listRmReminders(user as any);
    return reply.send({ reminders });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(400).send({ message: error.message || 'Failed to list reminders' });
  }
};

export const markRmReminderReadController = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const user = request.authUser!;
    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const { id } = paramsSchema.parse(request.params);
    rmReminderUpdateSchema.parse(request.body ?? {});

    await markRmReminderRead(user as any, id);
    return reply.send({ message: 'Reminder updated' });
  } catch (error: any) {
    request.log.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Validation failed', errors: error.errors });
    }
    return reply.status(400).send({ message: error.message || 'Failed to update reminder' });
  }
};
