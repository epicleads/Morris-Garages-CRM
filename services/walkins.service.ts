import { supabaseAdmin } from '../config/supabase';
import { SafeUser } from '../types/user';
import { findCustomerByPhone, findOrCreateCustomerByPhone } from './customer.service';

export interface WalkInLeadPayload {
  phone: string;
  fullName?: string | null;
  branchId: number;
  // Optional mapping to RM branch member (will be used more in RM phase)
  rmMemberId?: number | null;
  sourceId?: number | null;
  model?: string | null;
  variant?: string | null;
  location?: string | null;
  remarks?: string | null;
}

export const findCustomerWithLeadsByPhone = async (phone: string) => {
  const { normalizedPhone, customer } = await findCustomerByPhone(phone);

  if (!customer) {
    return {
      normalizedPhone,
      customer: null,
      leads: []
    };
  }

  const { data: leads, error } = await supabaseAdmin
    .from('leads_master')
    .select(
      `
        id,
        full_name,
        phone_number_normalized,
        status,
        is_qualified,
        IS_LOST,
        created_at,
        updated_at,
        branch_id,
        assigned_to,
        source_id
      `
    )
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch leads for customer: ${error.message}`);
  }

  return {
    normalizedPhone,
    customer,
    leads: leads || []
  };
};

/**
 * Helper to find an "open" lead for a given customer + branch.
 * For now we treat leads as open if:
 * - IS_LOST is null
 * - status is NOT 'Won' and NOT 'Closed_due_to_sale_elsewhere'
 */
const findOpenLeadForCustomerBranch = async (customerId: number, branchId: number) => {
  const { data, error } = await supabaseAdmin
    .from('leads_master')
    .select('*')
    .eq('customer_id', customerId)
    .eq('branch_id', branchId)
    .is('IS_LOST', null)
    .neq('status', 'Won')
    .neq('status', 'Closed_due_to_sale_elsewhere')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check existing leads for customer: ${error.message}`);
  }

  return data || null;
};

export const createOrAttachWalkInLead = async (user: SafeUser, payload: WalkInLeadPayload) => {
  const { fullName, branchId, rmMemberId, sourceId, model, variant, location, remarks } = payload;

  // Ensure customer exists (or create)
  const { normalizedPhone, customer } = await findOrCreateCustomerByPhone({
    rawPhone: payload.phone,
    fullName,
    city: location ?? undefined
  });

  // Check if there is already an open lead for this customer in this branch
  const existingLead = await findOpenLeadForCustomerBranch(customer.id, branchId);

  // Build basic metadata used in logs
  const metaBase: Record<string, any> = {
    source: 'Walk-in',
    model,
    variant,
    location,
    created_by_user_id: user.id,
    created_by_role: user.role
  };

  if (existingLead) {
    // Attach as another walk-in visit on the same lead
    const { error: logError } = await supabaseAdmin.from('leads_logs').insert({
      lead_id: existingLead.id,
      old_status: existingLead.status,
      new_status: existingLead.status,
      remarks: remarks || 'Walk-in visit (existing lead)',
      metadata: {
        ...metaBase,
        event: 'walk_in_again'
      },
      created_by: user.id
    });

    if (logError) {
      throw new Error(`Failed to log walk-in visit: ${logError.message}`);
    }

    return {
      created: false,
      action: 'attached_to_existing',
      customer,
      lead: existingLead
    };
  }

  // No open lead exists for this (customer, branch) → create new lead row
  let resolvedSourceId: number | null = sourceId ?? null;

  if (!resolvedSourceId) {
    // Try to find a default "Walk-in" source (display_name)
    const { data: source, error: sourceError } = await supabaseAdmin
      .from('sources')
      .select('id, display_name')
      .ilike('display_name', 'walk%in%')
      .maybeSingle();

    if (sourceError) {
      throw new Error(`Failed to resolve Walk-in source: ${sourceError.message}`);
    }

    resolvedSourceId = source?.id ?? null;
  }

  const { data: newLead, error: leadError } = await supabaseAdmin
    .from('leads_master')
    .insert({
      full_name: fullName ?? null,
      phone_number_normalized: normalizedPhone,
      source_id: resolvedSourceId,
      status: 'fresh',
      Lead_Remarks: remarks ?? null,
      customer_id: customer.id,
      branch_id: branchId
    })
    .select('*')
    .single();

  if (leadError || !newLead) {
    throw new Error(`Failed to create walk-in lead: ${leadError?.message}`);
  }

  // Optionally store basic RM mapping in leads_qualification (so RM knows this is theirs)
  if (rmMemberId) {
    const { error: qualError } = await supabaseAdmin.from('leads_qualification').insert({
      lead_id: newLead.id,
      branch_id: branchId,
      rm_id: rmMemberId,
      qualified_by: null,
      qualified_category: 'Walk-in',
      remarks: remarks ?? null
    });

    if (qualError) {
      // We don't fail the whole operation, but we log the error for debugging.
      console.error('Failed to create initial leads_qualification for walk-in lead', qualError);
    }
  }

  // Create initial log entry
  const { error: logError } = await supabaseAdmin.from('leads_logs').insert({
    lead_id: newLead.id,
    old_status: null,
    new_status: newLead.status,
    remarks: remarks || 'Walk-in lead created',
    metadata: {
      ...metaBase,
      event: 'walk_in_created'
    },
    created_by: user.id
  });

  if (logError) {
    throw new Error(`Failed to log walk-in creation: ${logError.message}`);
  }

  return {
    created: true,
    action: 'created_new_lead',
    customer,
    lead: newLead
  };
};


