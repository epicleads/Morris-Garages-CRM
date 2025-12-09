import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  generateCSV,
  generateExcel,
  generatePDF,
  saveExportTemplate,
  getExportTemplates,
  deleteExportTemplate,
  saveExportHistory,
  getExportHistory,
  ExportRequest,
} from '../services/export.service';
import { listLeads } from '../services/leads.service';
import { getQualifiedLeadsForReview } from '../services/admin.service';
import { toSafeUser } from '../services/user.service';

const exportRequestSchema = z.object({
  exportType: z.enum(['leads', 'qualified_leads', 'all_leads', 'fresh_leads', 'unassigned_leads']),
  columns: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      enabled: z.boolean(),
    })
  ),
  filters: z.record(z.any()).optional(),
  format: z.enum(['csv', 'excel', 'pdf']),
  templateId: z.number().optional(),
});

const templateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().optional(),
  exportType: z.string(),
  columns: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      enabled: z.boolean(),
    })
  ),
  filters: z.record(z.any()).optional(),
  format: z.enum(['csv', 'excel', 'pdf']),
  isDefault: z.boolean().optional(),
});

/**
 * Export leads based on request
 * POST /export/leads
 */
export const exportLeadsController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = (request as any).authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const body = exportRequestSchema.parse(request.body);
    const safeUser = toSafeUser(user);

    // Fetch data based on export type
    let data: any[] = [];
    let rowCount = 0;

    if (body.exportType === 'qualified_leads') {
      const qualifiedLeads = await getQualifiedLeadsForReview();
      // Transform qualified leads to export format
      data = qualifiedLeads.map((row) => {
        const q = row.qualification;
        const lead = row.lead;
        const source = lead?.source;
        return {
          'Qualified Date': q.qualified_at
            ? new Date(q.qualified_at).toLocaleString('en-IN')
            : '',
          'Customer Name': lead?.full_name || '',
          'Phone': lead?.phone_number_normalized || '',
          'Source': source?.display_name || '',
          'Sub Source': source?.source_type || '',
          'Qualified For': q.qualified_category || '',
          'Model': q.model_interested || '',
          'Variant': q.variant || '',
          'Customer Location': q.customer_location || '',
          'Lead Category': q.lead_category || '',
          'Purchase Timeline': q.purchase_timeline || '',
          'Finance Option': q.finance_type || '',
          'Trade-in Make': q.exchange_vehicle_make || '',
          'Trade-in Model': q.exchange_vehicle_model || '',
          'Trade-in Year': q.exchange_vehicle_year ?? '',
          'Test Drive Done': q.TEST_DRIVE ? 'Yes' : 'No',
          'Booked': q.BOOKED ? 'Yes' : 'No',
          'Retailed / Sold': q.RETAILED ? 'Yes' : 'No',
        };
      });
    } else {
      // For other export types, use listLeads
      const filters: any = {
        ...body.filters,
        status: body.exportType === 'fresh_leads' ? 'New' : undefined,
        assignedTo: body.exportType === 'unassigned_leads' ? null : undefined,
      };

      const leadsResponse = await listLeads(safeUser, filters);
      data = leadsResponse.leads.map((lead: any) => ({
        'Created At': lead.created_at
          ? new Date(lead.created_at).toLocaleString('en-IN')
          : '',
        'Customer Name': lead.full_name || '',
        'Phone': lead.phone_number_normalized || '',
        'Source': lead.source?.display_name || '',
        'Sub Source': lead.source?.source_type || '',
        'Status': lead.status || '',
        'Assigned To':
          lead.assigned_user?.full_name ||
          lead.assigned_user?.username ||
          (lead.assigned_to ? `User #${lead.assigned_to}` : 'Unassigned'),
      }));
    }

    // Filter columns based on enabled status
    const enabledColumns = body.columns.filter((col) => col.enabled);
    const filteredData = data.map((row) => {
      const filtered: Record<string, any> = {};
      enabledColumns.forEach((col) => {
        filtered[col.label] = row[col.key] || row[col.label] || '';
      });
      return filtered;
    });

    rowCount = filteredData.length;

    // Generate file based on format
    let buffer: Buffer;
    let mimeType: string;
    let fileExtension: string;

    if (body.format === 'csv') {
      const csvContent = generateCSV(filteredData);
      buffer = Buffer.from(csvContent, 'utf-8');
      mimeType = 'text/csv';
      fileExtension = 'csv';
    } else if (body.format === 'excel') {
      buffer = generateExcel(filteredData);
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      fileExtension = 'xlsx';
    } else {
      buffer = generatePDF(filteredData);
      mimeType = 'application/pdf';
      fileExtension = 'pdf';
    }

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `export-${body.exportType}-${timestamp}.${fileExtension}`;

    // Save export history
    try {
      await saveExportHistory(user.id, {
        templateId: body.templateId,
        exportType: body.exportType,
        format: body.format,
        fileName,
        fileSize: buffer.length,
        rowCount,
        filtersApplied: body.filters || {},
        status: 'completed',
      });
    } catch (err) {
      // Log but don't fail the export
      request.log.warn({ err }, 'Failed to save export history');
    }

    // Send file
    reply
      .type(mimeType)
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(buffer);
  } catch (error: any) {
    request.log.error({ err: error }, 'Export failed');
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Invalid request', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Export failed' });
  }
};

/**
 * Save export template
 * POST /export/templates
 */
export const saveTemplateController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = (request as any).authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const body = templateSchema.parse(request.body);
    const templateId = await saveExportTemplate(user.id, {
      ...body,
      filters: body.filters || {},
    });

    return reply.status(201).send({
      message: 'Template saved successfully',
      templateId,
    });
  } catch (error: any) {
    request.log.error({ err: error }, 'Failed to save template');
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Invalid request', errors: error.errors });
    }
    return reply.status(500).send({ message: error.message || 'Failed to save template' });
  }
};

/**
 * Get export templates
 * GET /export/templates?exportType=leads
 */
export const getTemplatesController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = (request as any).authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const exportType = (request.query as any)?.exportType;
    const templates = await getExportTemplates(user.id, exportType);

    return reply.send({ templates });
  } catch (error: any) {
    request.log.error({ err: error }, 'Failed to fetch templates');
    return reply.status(500).send({ message: error.message || 'Failed to fetch templates' });
  }
};

/**
 * Delete export template
 * DELETE /export/templates/:id
 */
export const deleteTemplateController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = (request as any).authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const templateId = parseInt((request.params as any).id);
    await deleteExportTemplate(templateId, user.id);

    return reply.send({ message: 'Template deleted successfully' });
  } catch (error: any) {
    request.log.error({ err: error }, 'Failed to delete template');
    return reply.status(500).send({ message: error.message || 'Failed to delete template' });
  }
};

/**
 * Get export history
 * GET /export/history?limit=50
 */
export const getHistoryController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const user = (request as any).authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const limit = parseInt((request.query as any)?.limit || '50');
    const history = await getExportHistory(user.id, limit);

    return reply.send({ history });
  } catch (error: any) {
    request.log.error({ err: error }, 'Failed to fetch export history');
    return reply.status(500).send({ message: error.message || 'Failed to fetch export history' });
  }
};

