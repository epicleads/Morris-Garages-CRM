import { supabaseAdmin } from '../config/supabase';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
// @ts-ignore - jspdf-autotable types
import 'jspdf-autotable';

export interface ExportColumn {
  key: string;
  label: string;
  enabled: boolean;
}

export interface ExportFilters {
  dateRange?: {
    from: string;
    to: string;
  };
  sources?: number[];
  status?: string[];
  assignmentStatus?: 'all' | 'unassigned' | 'assigned';
  search?: string;
  [key: string]: any;
}

export interface ExportRequest {
  exportType: 'leads' | 'qualified_leads' | 'all_leads' | 'fresh_leads' | 'unassigned_leads';
  columns: ExportColumn[];
  filters: ExportFilters;
  format: 'csv' | 'excel' | 'pdf';
  templateId?: number;
}

export interface ExportResult {
  fileName: string;
  buffer: Buffer;
  mimeType: string;
  rowCount: number;
}

/**
 * Generate CSV from data
 */
export function generateCSV(data: Record<string, any>[]): string {
  if (!data || data.length === 0) {
    return '';
  }

  const headers = Object.keys(data[0]);
  const escape = (value: any): string => {
    if (value === null || value === undefined) return '';
    const str = String(value).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvLines = [
    headers.join(','),
    ...data.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];

  return csvLines.join('\r\n');
}

/**
 * Generate Excel file from data
 */
export function generateExcel(data: Record<string, any>[]): Buffer {
  if (!data || data.length === 0) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([[]]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Data');

  // Auto-size columns
  const maxWidth = 50;
  const colWidths = Object.keys(data[0]).map((key) => {
    const maxLength = Math.max(
      key.length,
      ...data.map((row) => String(row[key] || '').length)
    );
    return { wch: Math.min(maxLength + 2, maxWidth) };
  });
  ws['!cols'] = colWidths;

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

/**
 * Generate PDF from data
 */
export function generatePDF(data: Record<string, any>[]): Buffer {
  const doc = new jsPDF();
  
  if (!data || data.length === 0) {
    doc.text('No data to export', 10, 10);
    return Buffer.from(doc.output('arraybuffer'));
  }

  const headers = Object.keys(data[0]);
  const rows = data.map((row) => headers.map((h) => String(row[h] || '')));

  // @ts-ignore - jspdf-autotable types
  (doc as any).autoTable({
    head: [headers],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255] },
    margin: { top: 10 },
  });

  return Buffer.from(doc.output('arraybuffer'));
}

/**
 * Save export template
 */
export async function saveExportTemplate(
  userId: number,
  template: {
    name: string;
    description?: string;
    exportType: string;
    columns: ExportColumn[];
    filters: ExportFilters;
    format: 'csv' | 'excel' | 'pdf';
    isDefault?: boolean;
  }
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('export_templates')
    .insert({
      name: template.name,
      description: template.description || null,
      user_id: userId,
      export_type: template.exportType,
      columns: template.columns,
      filters: template.filters,
      format: template.format,
      is_default: template.isDefault || false,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to save export template: ${error.message}`);
  }

  return data.id;
}

/**
 * Get export templates for user
 */
export async function getExportTemplates(
  userId: number,
  exportType?: string
): Promise<any[]> {
  let query = supabaseAdmin
    .from('export_templates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (exportType) {
    query = query.eq('export_type', exportType);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch export templates: ${error.message}`);
  }

  return data || [];
}

/**
 * Delete export template
 */
export async function deleteExportTemplate(
  templateId: number,
  userId: number
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('export_templates')
    .delete()
    .eq('id', templateId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete export template: ${error.message}`);
  }
}

/**
 * Save export history
 */
export async function saveExportHistory(
  userId: number,
  history: {
    templateId?: number;
    exportType: string;
    format: string;
    fileName: string;
    fileSize?: number;
    rowCount: number;
    filtersApplied: ExportFilters;
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    errorMessage?: string;
  }
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('export_history')
    .insert({
      user_id: userId,
      template_id: history.templateId || null,
      export_type: history.exportType,
      format: history.format,
      file_name: history.fileName,
      file_size: history.fileSize || null,
      row_count: history.rowCount,
      filters_applied: history.filtersApplied,
      status: history.status || 'completed',
      error_message: history.errorMessage || null,
      completed_at: history.status === 'completed' ? new Date().toISOString() : null,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to save export history: ${error.message}`);
  }

  return data.id;
}

/**
 * Get export history for user
 */
export async function getExportHistory(
  userId: number,
  limit: number = 50
): Promise<any[]> {
  const { data, error } = await supabaseAdmin
    .from('export_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch export history: ${error.message}`);
  }

  return data || [];
}

