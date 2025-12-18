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

export interface ReceptionTestDrivePayload {
  phone: string;
  fullName?: string | null;
  branchId: number;
  model: string;
  variant?: string | null;
  startTime: string;
  endTime: string;
  givenByUserId?: number | null;
  remarks?: string | null;
}

export const findCustomerWithLeadsByPhone = async (phone: string) => {
  const { normalizedPhone, customer } = await findCustomerByPhone(phone);

  if (!customer) {
    // Fallback: there might be legacy leads in leads_master that were created
    // before we introduced the customers table (customer_id = null). In that
    // case we still want Receptionist to see that this number has history.
    const { data: legacyLeads, error: legacyError } = await supabaseAdmin
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
        source_id,
        raw_model_interested,
        raw_customer_location,
        branches ( name ),
        sources ( display_name ),
        leads_qualification (
          rm_id,
          customer_location,
          model_interested,
          variant
        )
      `
      )
      .eq('phone_number_normalized', normalizedPhone)
      .order('created_at', { ascending: false });

    if (legacyError) {
      throw new Error(`Failed to fetch legacy leads for phone: ${legacyError.message}`);
    }

    const mappedLegacy = (legacyLeads || []).map((l: any) => {
      const qual = (l.leads_qualification || [])[0] || {};
      return {
        id: l.id,
        full_name: l.full_name,
        phone_number_normalized: l.phone_number_normalized,
        status: l.status,
        branch_id: l.branch_id,
        source_id: l.source_id,
        branch_name: l.branches?.name ?? null,
        source_name: l.sources?.display_name ?? null,
        rm_member_id: qual.rm_id ?? null,
        model: qual.model_interested ?? l.raw_model_interested ?? null,
        variant: qual.variant ?? null,
        location: qual.customer_location ?? l.raw_customer_location ?? null,
        created_at: l.created_at,
      };
    });

    return {
      normalizedPhone,
      customer: null,
      leads: mappedLegacy
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
        source_id,
        raw_model_interested,
        raw_customer_location,
        branches ( name ),
        sources ( display_name ),
        leads_qualification (
          rm_id,
          customer_location,
          model_interested,
          variant
        )
      `
    )
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch leads for customer: ${error.message}`);
  }

  const mappedLeads = (leads || []).map((l: any) => {
    const qual = (l.leads_qualification || [])[0] || {};
    return {
      id: l.id,
      full_name: l.full_name,
      phone_number_normalized: l.phone_number_normalized,
      status: l.status,
      branch_id: l.branch_id,
      source_id: l.source_id,
      branch_name: l.branches?.name ?? null,
      source_name: l.sources?.display_name ?? null,
      rm_member_id: qual.rm_id ?? null,
      model: (qual.model_interested ?? l.raw_model_interested) ?? null,
      variant: qual.variant ?? null,
      location: (qual.customer_location ?? l.raw_customer_location) ?? null,
      created_at: l.updated_at,
    };
  });

  return {
    normalizedPhone,
    customer,
    leads: mappedLeads
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
    // If RM is assigned and lead doesn't have assigned_to, update it
    let updatedLead = existingLead;
    if (rmMemberId && !existingLead.assigned_to) {
      // Look up RM's user_id from branch_members
      const { data: rmMember, error: rmError } = await supabaseAdmin
        .from('branch_members')
        .select('user_id, contact_name')
        .eq('id', Number(rmMemberId))
        .eq('role', 'RM')
        .eq('is_active', true)
        .maybeSingle();

      let rmUserId: number | null = null;

      if (!rmError && rmMember) {
        if (rmMember.user_id) {
          rmUserId = rmMember.user_id;
        } else if (rmMember.contact_name) {
          // Fallback: Try to find user by matching contact_name with full_name or username
          const { data: matchingUser, error: userError } = await supabaseAdmin
            .from('users')
            .select('user_id')
            .eq('role', 'RM')
            .or(`full_name.ilike.%${rmMember.contact_name}%,username.ilike.%${rmMember.contact_name}%`)
            .limit(1)
            .maybeSingle();

          if (!userError && matchingUser) {
            rmUserId = matchingUser.user_id;
            // Also update branch_members to link the user_id for future assignments
            await supabaseAdmin
              .from('branch_members')
              .update({ user_id: matchingUser.user_id })
              .eq('id', Number(rmMemberId));
          } else {
            console.warn(
              `RM member ${rmMemberId} (${rmMember.contact_name}) has no user_id and no matching user found. Lead assignment will remain null.`
            );
          }
        }
      }

      if (rmUserId) {
        const { data: updated, error: updateError } = await supabaseAdmin
          .from('leads_master')
          .update({
            assigned_to: rmUserId,
            assigned_at: new Date().toISOString()
          })
          .eq('id', existingLead.id)
          .select('*')
          .single();

        if (!updateError && updated) {
          updatedLead = updated;
        }
      }
    }

    // Ensure leads_qualification exists with RM mapping if rmMemberId is provided
    if (rmMemberId) {
      // Check if qualification already exists
      const { data: existingQual } = await supabaseAdmin
        .from('leads_qualification')
        .select('id, rm_id, customer_location, model_interested, variant, remarks')
        .eq('lead_id', existingLead.id)
        .maybeSingle();

      if (!existingQual) {
        // Create new qualification entry. Do NOT set qualified_category here – this is RM's field.
        const { error: qualError } = await supabaseAdmin.from('leads_qualification').insert({
          lead_id: existingLead.id,
          branch_id: branchId,
          rm_id: Number(rmMemberId),
          qualified_by: null,
          customer_location: location || null,
          model_interested: model || null,
          variant: variant || null,
          remarks: remarks ?? null
        });

        if (qualError) {
          console.error('Failed to create leads_qualification for existing lead', qualError);
        }
      } else if (existingQual.rm_id !== Number(rmMemberId)) {
        // Update RM if different
        const { error: qualUpdateError } = await supabaseAdmin
          .from('leads_qualification')
          .update({
            rm_id: Number(rmMemberId),
            customer_location: location || existingQual.customer_location || null,
            model_interested: model || existingQual.model_interested || null,
            variant: variant || existingQual.variant || null,
            remarks: remarks || existingQual.remarks || null
          })
          .eq('id', existingQual.id);

        if (qualUpdateError) {
          console.error('Failed to update leads_qualification for existing lead', qualUpdateError);
        }
      }
    }

    // Attach as another walk-in visit on the same lead
    const { error: logError } = await supabaseAdmin.from('leads_logs').insert({
      lead_id: updatedLead.id,
      old_status: updatedLead.status,
      new_status: updatedLead.status,
      remarks:
        remarks ||
        `Walk-in visit (existing lead)${
          rmMemberId ? `, assigned/handled by RM member #${rmMemberId}` : ''
        }`,
      metadata: {
        ...metaBase,
        event: 'walk_in_again',
        rm_member_id: rmMemberId || null
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
      lead: updatedLead
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

  // Look up RM's user_id from branch_members if rmMemberId is provided
  let assignedToUserId: number | null = null;
  if (rmMemberId) {
    const { data: rmMember, error: rmError } = await supabaseAdmin
      .from('branch_members')
      .select('user_id, contact_name')
      .eq('id', Number(rmMemberId))
      .eq('role', 'RM')
      .eq('is_active', true)
      .maybeSingle();

    if (rmError) {
      throw new Error(`Failed to lookup RM member: ${rmError.message}`);
    }

    if (rmMember) {
      if (rmMember.user_id) {
        assignedToUserId = rmMember.user_id;
      } else if (rmMember.contact_name) {
        // Fallback: Try to find user by matching contact_name with full_name or username
        const { data: matchingUser, error: userError } = await supabaseAdmin
          .from('users')
          .select('user_id')
          .eq('role', 'RM')
          .or(`full_name.ilike.%${rmMember.contact_name}%,username.ilike.%${rmMember.contact_name}%`)
          .limit(1)
          .maybeSingle();

        if (!userError && matchingUser) {
          assignedToUserId = matchingUser.user_id;
          // Also update branch_members to link the user_id for future assignments
          await supabaseAdmin
            .from('branch_members')
            .update({ user_id: matchingUser.user_id })
            .eq('id', Number(rmMemberId));
        } else {
          // Log warning but don't fail - lead will still be created and linked via leads_qualification.rm_id
          console.warn(
            `RM member ${rmMemberId} (${rmMember.contact_name}) has no user_id and no matching user found. Lead will be created but assigned_to will be null.`
          );
        }
      } else {
        console.warn(
          `RM member ${rmMemberId} has no user_id and no contact_name. Lead will be created but assigned_to will be null.`
        );
      }
    }
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
      branch_id: branchId,
      assigned_to: assignedToUserId,
      assigned_at: assignedToUserId ? new Date().toISOString() : null
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
      rm_id: Number(rmMemberId),
      qualified_by: null,
      qualified_category: 'Walk-in',
      // Capture what Receptionist entered so RM/analytics can use it
      customer_location: location || null,
      model_interested: model || null,
      variant: variant || null,
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

/**
 * Creates a test drive from Receptionist side:
 * - Ensures customer exists
 * - Ensures an open lead exists for (customer, branch) – creates if needed
 * - Inserts a test_drives row
 * - Logs 'test_drive_booked' in leads_logs
 */
export const createReceptionTestDrive = async (
  user: SafeUser,
  payload: ReceptionTestDrivePayload
) => {
  const { phone, fullName, branchId, model, variant, startTime, endTime, givenByUserId, remarks } =
    payload;

  // 1. Ensure customer exists
  const { normalizedPhone, customer } = await findOrCreateCustomerByPhone({
    rawPhone: phone,
    fullName,
  });

  // 2. Find or create open lead for this customer + branch
  let lead = await findOpenLeadForCustomerBranch(customer.id, branchId);

  if (!lead) {
    // Minimal new lead (source can be generic 'Walk-in' if available)
    let resolvedSourceId: number | null = null;

    const { data: source, error: sourceError } = await supabaseAdmin
      .from('sources')
      .select('id, display_name')
      .ilike('display_name', 'walk%in%')
      .maybeSingle();

    if (sourceError) {
      throw new Error(`Failed to resolve Walk-in source for test drive: ${sourceError.message}`);
    }

    resolvedSourceId = source?.id ?? null;

    const { data: newLead, error: leadError } = await supabaseAdmin
      .from('leads_master')
      .insert({
        full_name: fullName ?? null,
        phone_number_normalized: normalizedPhone,
        source_id: resolvedSourceId,
        status: 'fresh',
        Lead_Remarks: remarks ?? null,
        customer_id: customer.id,
        branch_id: branchId,
      })
      .select('*')
      .single();

    if (leadError || !newLead) {
      throw new Error(`Failed to create lead for test drive: ${leadError?.message}`);
    }

    lead = newLead;
  }

  // 3. Create test drive
  const { data: testDrive, error: tdError } = await supabaseAdmin
    .from('test_drives')
    .insert({
      lead_id: lead.id,
      customer_id: customer.id,
      branch_id: branchId,
      model,
      variant: variant ?? null,
      start_time: startTime,
      end_time: endTime,
      given_by_user_id: givenByUserId ?? user.id,
      created_by_user_id: user.id,
      remarks: remarks ?? null,
    })
    .select('*')
    .single();

  if (tdError || !testDrive) {
    throw new Error(`Failed to create test drive: ${tdError?.message}`);
  }

  // 4. Log test drive event
  const { error: logError } = await supabaseAdmin.from('leads_logs').insert({
    lead_id: lead.id,
    old_status: lead.status,
    new_status: lead.status,
    remarks: remarks || 'Test drive booked from Receptionist',
    metadata: {
      event: 'test_drive_booked',
      model,
      variant,
      created_by_user_id: user.id,
      created_by_role: user.role,
    },
    created_by: user.id,
  });

  if (logError) {
    throw new Error(`Failed to log test drive booking: ${logError.message}`);
  }

  return {
    customer,
    lead,
    testDrive,
  };
};


