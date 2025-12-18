import { supabaseAdmin } from '../config/supabase';
import { findOrCreateCustomerByPhone, normalizePhone } from './customer.service';

// Ensure Knowlarity source exists
async function ensureSourceRow(): Promise<{ id: number; total_leads_count: number; todays_leads_count: number }> {
  const DISPLAY = 'Knowlarity';
  const TYPE = 'knowlarity_call';

  const { data: rows, error } = await supabaseAdmin
    .from('sources')
    .select('id, total_leads_count, todays_leads_count')
    .eq('display_name', DISPLAY)
    .eq('source_type', TYPE)
    .limit(1);

  if (error) {
    throw new Error(`Error reading sources: ${error.message}`);
  }

  if (rows && rows.length > 0) {
    return {
      id: rows[0].id,
      total_leads_count: rows[0].total_leads_count || 0,
      todays_leads_count: rows[0].todays_leads_count || 0,
    };
  }

  // Create source if doesn't exist
  const { data: newSource, error: insertError } = await supabaseAdmin
    .from('sources')
    .insert({
      display_name: DISPLAY,
      source_type: TYPE,
      total_leads_count: 0,
      todays_leads_count: 0,
    })
    .select('id, total_leads_count, todays_leads_count')
    .single();

  if (insertError || !newSource) {
    throw new Error(`Failed to create Knowlarity source: ${insertError?.message}`);
  }

  return {
    id: newSource.id,
    total_leads_count: newSource.total_leads_count || 0,
    todays_leads_count: newSource.todays_leads_count || 0,
  };
}

// Update source counts
async function updateSourceCounts(sourceId: number, incTotal: number, incToday: number): Promise<void> {
  const { data: source, error: fetchError } = await supabaseAdmin
    .from('sources')
    .select('total_leads_count, todays_leads_count')
    .eq('id', sourceId)
    .single();

  if (fetchError) {
    throw new Error(`Error reading source counts: ${fetchError.message}`);
  }

  const newTotal = (source?.total_leads_count || 0) + incTotal;
  const newToday = (source?.todays_leads_count || 0) + incToday;

  const { error: updateError } = await supabaseAdmin
    .from('sources')
    .update({
      total_leads_count: newTotal,
      todays_leads_count: newToday,
    })
    .eq('id', sourceId);

  if (updateError) {
    throw new Error(`Error updating source counts: ${updateError.message}`);
  }
}

// Check if date is today (IST)
function isToday(dateStr: string | null | undefined): boolean {
  if (!dateStr) return true; // Assume today if unclear
  
  try {
    const date = new Date(dateStr);
    const today = new Date();
    return (
      date.getUTCFullYear() === today.getUTCFullYear() &&
      date.getUTCMonth() === today.getUTCMonth() &&
      date.getUTCDate() === today.getUTCDate()
    );
  } catch {
    return true; // Assume today if parsing fails
  }
}

export async function processKnowlarityWebhook(payload: any) {
  console.log('[Webhook Service] Processing webhook payload:', JSON.stringify(payload, null, 2));

  // Extract call data - Knowlarity might send it directly or wrapped
  const callData = payload.data || payload;

  // Extract phone number
  const rawPhone = callData.customer_number || callData.caller_id || callData.customer_number_normalized;
  
  if (!rawPhone) {
    throw new Error('No valid phone number in webhook payload');
  }

  // Step 1: Ensure customer exists (new pattern - uses customers table)
  const { normalizedPhone, customer } = await findOrCreateCustomerByPhone({
    rawPhone,
    fullName: `Knowlarity Lead ${normalizePhone(rawPhone)}`, // Default name if not provided
    city: null // Can be enhanced later if location data is available
  });

  console.log(`[Webhook Service] Customer ensured: ID=${customer.id}, Phone=${normalizedPhone}`);

  // Step 2: Ensure Knowlarity source exists
  const sourceRow = await ensureSourceRow();
  const sourceId = sourceRow.id;

  // Step 3: Check for existing leads for this customer (by customer_id, not just phone)
  const { data: existingLeads, error: queryError } = await supabaseAdmin
    .from('leads_master')
    .select('id, source_id, created_at, customer_id')
    .eq('customer_id', customer.id);

  if (queryError) {
    throw new Error(`Failed to query existing leads: ${queryError.message}`);
  }

  // Determine if this call is from today
  const callDate = callData.start_time || callData.created_at || callData.received_at;
  const isTodayCall = isToday(callDate);

  if (!existingLeads || existingLeads.length === 0) {
    // Case A: New lead for this customer - create immediately
    console.log(`[Webhook Service] Creating new lead for customer ID: ${customer.id}, phone: ${normalizedPhone}`);

    const { error: insertError } = await supabaseAdmin
      .from('leads_master')
      .insert({
        customer_id: customer.id, // NEW: Link to customers table
        full_name: customer.full_name || `Knowlarity Lead ${normalizedPhone}`,
        phone_number_normalized: normalizedPhone,
        source_id: sourceId,
        external_lead_id: callData.uuid || callData.id?.toString() || null,
        status: 'New',
        raw_payload: callData,
        is_qualified: false,
        total_attempts: 0,
        branch_id: null, // Can be set later if branch mapping is available
      });

    if (insertError) {
      throw new Error(`Failed to insert lead: ${insertError.message}`);
    }

    // Update source counts
    await updateSourceCounts(sourceId, 1, isTodayCall ? 1 : 0);

    console.log(`[Webhook Service] Lead created successfully for customer ID: ${customer.id}`);
  } else {
    // Check for cross-source duplicate
    const crossSource = existingLeads.find((l) => l.source_id !== sourceId);

    if (crossSource) {
      // Case C: Cross-source duplicate - add to history
      console.log(`[Webhook Service] Cross-source duplicate for customer ID: ${customer.id}`);

      const { error: histError } = await supabaseAdmin
        .from('lead_sources_history')
        .insert({
          lead_id: crossSource.id,
          source_id: sourceId,
          external_id: callData.uuid || callData.id?.toString() || null,
          raw_payload: callData,
          received_at: new Date().toISOString(),
          is_primary: false,
        });

      if (histError) {
        throw new Error(`Failed to insert history: ${histError.message}`);
      }

      // Update source counts
      await updateSourceCounts(sourceId, 1, isTodayCall ? 1 : 0);

      console.log(`[Webhook Service] Cross-source history added for customer ID: ${customer.id}`);
    } else {
      // Case B: Same-source duplicate - skip
      console.log(`[Webhook Service] Same-source duplicate, skipping: customer ID: ${customer.id}`);
    }
  }
}

