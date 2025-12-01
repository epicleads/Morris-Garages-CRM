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
                throw new Error('full_name is required');
            }

            if (!row.phone_number_normalized || row.phone_number_normalized.trim() === '') {
                throw new Error('phone_number_normalized is required');
            }

            if (!row.source || row.source.trim() === '') {
                throw new Error('source is required');
            }

            if (!row.sub_source || row.sub_source.trim() === '') {
                throw new Error('sub_source is required');
            }

            // Normalize phone
            const normalizedPhone = normalizePhone(row.phone_number_normalized);

            if (normalizedPhone.length < 10) {
                throw new Error('Invalid phone number: Must be at least 10 digits');
            }

            // Check for duplicate phone number
            const { data: existing } = await supabaseAdmin
                .from('leads_master')
                .select('id, full_name, status')
                .eq('phone_number_normalized', normalizedPhone)
                .maybeSingle();

            if (existing) {
                throw new Error(
                    `Duplicate: Lead with this phone already exists (ID: ${existing.id}, Status: ${existing.status})`
                );
            }

            // Lookup source by display_name AND source_type (exact match)
            const { data: source, error: sourceError } = await supabaseAdmin
                .from('sources')
                .select('id, display_name, source_type')
                .eq('display_name', row.source.trim())
                .eq('source_type', row.sub_source.trim())
                .maybeSingle();

            if (sourceError) {
                throw new Error(`Failed to lookup source: ${sourceError.message}`);
            }

            if (!source) {
                throw new Error(
                    `Unknown source/sub_source: ${row.source} / ${row.sub_source}. Please create this source combination first or check for exact case match.`
                );
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
                throw new Error(`Failed to insert lead: ${insertError.message}`);
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
            failedCount++;
            errors.push({
                row: rowNumber,
                data: row,
                error: error.message,
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
