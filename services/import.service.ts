import { supabaseAdmin } from '../config/supabase';
import { SafeUser } from '../types/user';
import { canViewAllLeads } from './permissions.service';

export interface ImportLeadRow {
    full_name: string;
    phone_number_normalized: string;
    source: string;
    sub_source: string;
}

export interface ImportResult {
    success: boolean;
    totalRows: number;
    successCount: number;
    failedCount: number;
    errors: ImportError[];
    importedLeads: any[];
}

export interface ImportError {
    row: number;
    data: ImportLeadRow;
    error: string;
    errorType?: 'validation' | 'duplicate' | 'source_not_found' | 'database_error' | 'other';
}

/**
 * Normalize phone number - remove all non-digit characters
 */
const normalizePhone = (phone: string): string => {
    return phone.replace(/\D/g, '');
};

/**
 * Import multiple leads from parsed CSV/Excel data
 */
export const importLeads = async (
    user: SafeUser,
    rows: ImportLeadRow[]
): Promise<ImportResult> => {
    const errors: ImportError[] = [];
    const importedLeads: any[] = [];
    let successCount = 0;
    let failedCount = 0;

    // Validate user has permission (only CRE_TL and Developer can import)
    if (!canViewAllLeads(user)) {
        throw new Error('Permission denied: Only Team Leads can import leads');
    }

    // Process each row
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 1; // 1-indexed for user display (skipping header)

        try {
            // Validate required fields
            if (!row.full_name || row.full_name.trim() === '') {
                errors.push({
                    row: rowNumber,
                    data: row,
                    error: 'Customer Name is required and cannot be empty',
                    errorType: 'validation',
                });
                failedCount++;
                continue;
            }

            if (!row.phone_number_normalized || row.phone_number_normalized.trim() === '') {
                errors.push({
                    row: rowNumber,
                    data: row,
                    error: 'Phone Number is required and cannot be empty',
                    errorType: 'validation',
                });
                failedCount++;
                continue;
            }

            if (!row.source || row.source.trim() === '') {
                errors.push({
                    row: rowNumber,
                    data: row,
                    error: 'Source is required and cannot be empty',
                    errorType: 'validation',
                });
                failedCount++;
                continue;
            }

            if (!row.sub_source || row.sub_source.trim() === '') {
                errors.push({
                    row: rowNumber,
                    data: row,
                    error: 'Sub Source is required and cannot be empty',
                    errorType: 'validation',
                });
                failedCount++;
                continue;
            }

            // Normalize phone
            const normalizedPhone = normalizePhone(row.phone_number_normalized);

            if (normalizedPhone.length < 10) {
                errors.push({
                    row: rowNumber,
                    data: row,
                    error: `Invalid phone number: "${row.phone_number_normalized}" must contain at least 10 digits`,
                    errorType: 'validation',
                });
                failedCount++;
                continue;
            }

            // Check for duplicate phone number
            const { data: existing } = await supabaseAdmin
                .from('leads_master')
                .select('id, full_name, status')
                .eq('phone_number_normalized', normalizedPhone)
                .maybeSingle();

            if (existing) {
                errors.push({
                    row: rowNumber,
                    data: row,
                    error: `Duplicate phone number: A lead with phone "${normalizedPhone}" already exists (Lead ID: ${existing.id}, Name: "${existing.full_name}", Status: "${existing.status}")`,
                    errorType: 'duplicate',
                });
                failedCount++;
                continue;
            }

            // Lookup source by display_name AND source_type (exact match)
            const { data: source, error: sourceError } = await supabaseAdmin
                .from('sources')
                .select('id, display_name, source_type')
                .eq('display_name', row.source.trim())
                .eq('source_type', row.sub_source.trim())
                .maybeSingle();

            if (sourceError) {
                errors.push({
                    row: rowNumber,
                    data: row,
                    error: `Database error while looking up source: ${sourceError.message}`,
                    errorType: 'database_error',
                });
                failedCount++;
                continue;
            }

            if (!source) {
                errors.push({
                    row: rowNumber,
                    data: row,
                    error: `Source not found: "${row.source}" / "${row.sub_source}". Please create this source combination in the Sources section first, or check for exact spelling/case match.`,
                    errorType: 'source_not_found',
                });
                failedCount++;
                continue;
            }

            // Insert lead
            const { data: lead, error: insertError } = await supabaseAdmin
                .from('leads_master')
                .insert({
                    full_name: row.full_name.trim(),
                    phone_number_normalized: normalizedPhone,
                    source_id: source.id,
                    status: 'New',
                    created_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (insertError) {
                errors.push({
                    row: rowNumber,
                    data: row,
                    error: `Database error while creating lead: ${insertError.message}`,
                    errorType: 'database_error',
                });
                failedCount++;
                continue;
            }

            // Create initial log entry
            await supabaseAdmin.from('leads_logs').insert({
                lead_id: lead.id,
                old_status: null,
                new_status: 'New',
                remarks: `Lead imported from file by ${user.username}`,
                created_by: user.id,
            });

            importedLeads.push(lead);
            successCount++;
        } catch (error: any) {
            // Fallback for any unexpected errors
            failedCount++;
            errors.push({
                row: rowNumber,
                data: row,
                error: error.message || 'Unknown error occurred',
                errorType: 'other',
            });
        }
    }

    return {
        success: failedCount === 0,
        totalRows: rows.length,
        successCount,
        failedCount,
        errors,
        importedLeads,
    };
};
