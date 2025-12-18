import { FastifyInstance } from 'fastify';
import {
  getDashboardStatsController,
  getQualifiedLeadsForReviewController,
  updateQualifiedLeadFlagsAdminController,
  listVehicleModelsController,
  createVehicleModelController,
  updateVehicleModelController,
  listVehicleVariantsController,
  createVehicleVariantController,
  updateVehicleVariantController,
  listLocationsController,
  createLocationController,
  updateLocationController,
  listPendingReasonsController,
  createPendingReasonController,
  updatePendingReasonController,
  listUnqualifiedReasonsController,
  createUnqualifiedReasonController,
  updateUnqualifiedReasonController,
} from '../controllers/admin.controller';
import { authorize } from '../middleware/authGuard';

export const adminRoutes = async (fastify: FastifyInstance) => {
  // Dashboard & qualified leads
  fastify.get('/admin/stats', {
    preHandler: [authorize(['Admin', 'CRE_TL'])],
  }, getDashboardStatsController);

  fastify.get('/admin/qualified-leads', {
    preHandler: [authorize(['Admin', 'CRE_TL'])],
  }, getQualifiedLeadsForReviewController);

  fastify.patch('/admin/qualified-leads/:leadId/status', {
    preHandler: [authorize(['Admin', 'CRE_TL'])],
  }, updateQualifiedLeadFlagsAdminController);

  // Master data – vehicle models
  fastify.get('/admin/models', {
    preHandler: [authorize(['Admin', 'Developer'])],
  }, listVehicleModelsController);

  fastify.post('/admin/models', {
    preHandler: [authorize(['Admin', 'Developer'])],
  }, createVehicleModelController);

  fastify.patch('/admin/models/:id', {
    preHandler: [authorize(['Admin', 'Developer'])],
  }, updateVehicleModelController);

  // Master data – vehicle variants
  fastify.get('/admin/variants', {
    preHandler: [authorize(['Admin', 'Developer'])],
  }, listVehicleVariantsController);

  fastify.post('/admin/variants', {
    preHandler: [authorize(['Admin', 'Developer'])],
  }, createVehicleVariantController);

  fastify.patch('/admin/variants/:id', {
    preHandler: [authorize(['Admin', 'Developer'])],
  }, updateVehicleVariantController);

  // Master data – locations
  fastify.get('/admin/locations', {
    preHandler: [authorize(['Admin', 'Developer'])],
  }, listLocationsController);

  fastify.post('/admin/locations', {
    preHandler: [authorize(['Admin', 'Developer'])],
  }, createLocationController);

  fastify.patch('/admin/locations/:id', {
    preHandler: [authorize(['Admin', 'Developer'])],
  }, updateLocationController);

  // Master data – pending reasons
  fastify.get('/admin/pending-reasons', {
    preHandler: [authorize(['Admin', 'Developer'])],
  }, listPendingReasonsController);

  fastify.post('/admin/pending-reasons', {
    preHandler: [authorize(['Admin', 'Developer'])],
  }, createPendingReasonController);

  fastify.patch('/admin/pending-reasons/:id', {
    preHandler: [authorize(['Admin', 'Developer'])],
  }, updatePendingReasonController);

  // Master data – unqualified reasons
  fastify.get('/admin/unqualified-reasons', {
    preHandler: [authorize(['Admin', 'Developer'])],
  }, listUnqualifiedReasonsController);

  fastify.post('/admin/unqualified-reasons', {
    preHandler: [authorize(['Admin', 'Developer'])],
  }, createUnqualifiedReasonController);

  fastify.patch('/admin/unqualified-reasons/:id', {
    preHandler: [authorize(['Admin', 'Developer'])],
  }, updateUnqualifiedReasonController);
};
