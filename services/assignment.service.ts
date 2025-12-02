import { supabaseAdmin } from '../config/supabase';
import { SafeUser } from '../types/user';
import { canViewAllLeads } from './permissions.service';

export type RuleType = 'round_robin' | 'weighted';

export interface ManualAssignInput {
  leadIds: number[];
  assignedTo: number;
  remarks?: string;
}

export interface AssignmentRuleInput {
  name: string;
  sourceId?: number;
  ruleType: RuleType;
  priority?: number;
  isActive?: boolean;
  config?: Record<string, any>;
  activeFrom?: string; // HH:MM
  activeTo?: string; // HH:MM
  activeDays?: number[];
  fallbackRuleId?: string;
  fallbackToManual?: boolean;
}

export interface AssignmentRuleUpdateInput extends Partial<AssignmentRuleInput> {}

export interface RuleMemberInput {
  ruleId: string;
  userId: number;
  percentage?: number;
  weight?: number;
  isActive?: boolean;
}

export interface AssignmentLogFilters {
  limit?: number;
  assignedTo?: number;
  action?: 'manual_assignment' | 'auto_assignment';
}

const MEMBER_SELECT = `
  id,
  rule_id,
  user_id,
  percentage,
  weight,
  is_active,
  assigned_count,
  last_assigned_at,
  created_at,
  updated_at,
  user:users!rule_members_user_id_fkey(user_id, full_name, username, role)
`;

const RULE_SELECT = `
  id,
  name,
  source_id,
  rule_type,
  is_active,
  priority,
  config,
  active_from,
  active_to,
  active_days,
  fallback_rule_id,
  fallback_to_manual,
  created_by,
  created_at,
  updated_at
`;

const ensureManager = (user: SafeUser) => {
  if (!canViewAllLeads(user)) {
    throw new Error('Permission denied: Only Team Leads can manage assignments');
  }
};

export const assignLeadsManually = async (
  actor: SafeUser,
  input: ManualAssignInput
) => {
  ensureManager(actor);

  if (!input.leadIds?.length) {
    throw new Error('leadIds is required');
  }

  const { data: assignee, error: userError } = await supabaseAdmin
    .from('users')
    .select('user_id, full_name, role, status')
    .eq('user_id', input.assignedTo)
    .maybeSingle();

  if (userError) {
    throw new Error(`Failed to fetch user: ${userError.message}`);
  }

  if (!assignee || assignee.status === false) {
    throw new Error(`Assigned user ${input.assignedTo} not found or inactive`);
  }

  // Update leads
  const { data: updatedLeads, error: updateError } = await supabaseAdmin
    .from('leads_master')
    .update({
      assigned_to: input.assignedTo,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', input.leadIds)
    .select('id, assigned_to');

  if (updateError) {
    throw new Error(`Failed to assign leads: ${updateError.message}`);
  }

  // Insert logs
  const logs = input.leadIds.map((leadId) => ({
    lead_id: leadId,
    old_status: null,
    new_status: 'Assigned',
    remarks: input.remarks || `Assigned to ${assignee.full_name || 'CRE'}`,
    created_by: actor.id,
    metadata: {
      action: 'manual_assignment',
      assignedTo: input.assignedTo,
    },
  }));

  const { error: logError } = await supabaseAdmin.from('leads_logs').insert(logs);

  if (logError) {
    throw new Error(`Failed to log assignment: ${logError.message}`);
  }

  return {
    assignedCount: updatedLeads?.length || 0,
    assignee,
  };
};

export const createAssignmentRule = async (
  actor: SafeUser,
  input: AssignmentRuleInput
) => {
  ensureManager(actor);

  const rulePayload = {
    name: input.name,
    source_id: input.sourceId || null,
    rule_type: input.ruleType,
    priority: input.priority ?? 0,
    is_active: input.isActive ?? true,
    config: input.config || {},
    active_from: input.activeFrom || null,
    active_to: input.activeTo || null,
    active_days: input.activeDays || null,
    fallback_rule_id: input.fallbackRuleId || null,
    fallback_to_manual: input.fallbackToManual ?? true,
    created_by: actor.id,
  };

  const { data, error } = await supabaseAdmin
    .from('assignment_rules')
    .insert(rulePayload)
    .select(RULE_SELECT)
    .single();

  if (error) {
    throw new Error(`Failed to create assignment rule: ${error.message}`);
  }

  return data;
};

export const updateAssignmentRule = async (
  actor: SafeUser,
  ruleId: string,
  input: AssignmentRuleUpdateInput
) => {
  ensureManager(actor);

  const payload: any = {};

  if (input.name !== undefined) payload.name = input.name;
  if (input.sourceId !== undefined) payload.source_id = input.sourceId;
  if (input.ruleType !== undefined) payload.rule_type = input.ruleType;
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  if (input.config !== undefined) payload.config = input.config;
  if (input.activeFrom !== undefined) payload.active_from = input.activeFrom;
  if (input.activeTo !== undefined) payload.active_to = input.activeTo;
  if (input.activeDays !== undefined) payload.active_days = input.activeDays;
  if (input.fallbackRuleId !== undefined)
    payload.fallback_rule_id = input.fallbackRuleId;
  if (input.fallbackToManual !== undefined)
    payload.fallback_to_manual = input.fallbackToManual;

  if (Object.keys(payload).length === 0) {
    throw new Error('No fields provided for update');
  }

  const { data, error } = await supabaseAdmin
    .from('assignment_rules')
    .update(payload)
    .eq('id', ruleId)
    .select(RULE_SELECT)
    .single();

  if (error) {
    throw new Error(`Failed to update assignment rule: ${error.message}`);
  }

  return data;
};

export const deleteAssignmentRule = async (actor: SafeUser, ruleId: string) => {
  ensureManager(actor);

  const { error } = await supabaseAdmin
    .from('assignment_rules')
    .delete()
    .eq('id', ruleId);

  if (error) {
    throw new Error(`Failed to delete assignment rule: ${error.message}`);
  }

  return { success: true };
};

export const listAssignmentRules = async (actor: SafeUser) => {
  ensureManager(actor);

  const { data, error } = await supabaseAdmin
    .from('assignment_rules')
    .select(`${RULE_SELECT}, members:rule_members(${MEMBER_SELECT})`)
    .order('priority', { ascending: true });

  if (error) {
    throw new Error(`Failed to list assignment rules: ${error.message}`);
  }

  return data || [];
};

export const addRuleMember = async (actor: SafeUser, input: RuleMemberInput) => {
  ensureManager(actor);

  const memberPayload = {
    rule_id: input.ruleId,
    user_id: input.userId,
    percentage: input.percentage ?? null,
    weight: input.weight ?? 1,
    is_active: input.isActive ?? true,
  };

  const { data, error } = await supabaseAdmin
    .from('rule_members')
    .insert(memberPayload)
    .select(MEMBER_SELECT)
    .single();

  if (error) {
    throw new Error(`Failed to add rule member: ${error.message}`);
  }

  return data;
};

export const updateRuleMember = async (
  actor: SafeUser,
  memberId: string,
  input: Partial<RuleMemberInput>
) => {
  ensureManager(actor);

  const payload: any = {};
  if (input.percentage !== undefined) payload.percentage = input.percentage;
  if (input.weight !== undefined) payload.weight = input.weight;
  if (input.isActive !== undefined) payload.is_active = input.isActive;

  if (Object.keys(payload).length === 0) {
    throw new Error('No fields provided for update');
  }

  const { data, error } = await supabaseAdmin
    .from('rule_members')
    .update(payload)
    .eq('id', memberId)
    .select(MEMBER_SELECT)
    .single();

  if (error) {
    throw new Error(`Failed to update rule member: ${error.message}`);
  }

  return data;
};

export const removeRuleMember = async (actor: SafeUser, memberId: string) => {
  ensureManager(actor);

  const { error } = await supabaseAdmin
    .from('rule_members')
    .delete()
    .eq('id', memberId);

  if (error) {
    throw new Error(`Failed to remove rule member: ${error.message}`);
  }

  return { success: true };
};

const isRuleActiveNow = (rule: any) => {
  const now = new Date();

  if (rule.active_days && rule.active_days.length > 0) {
    const day = now.getDay(); // 0 Sunday
    if (!rule.active_days.includes(day)) {
      return false;
    }
  }

  if (rule.active_from && rule.active_to) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [fromHours, fromMinutes] = rule.active_from.split(':').map(Number);
    const [toHours, toMinutes] = rule.active_to.split(':').map(Number);
    const fromTotal = fromHours * 60 + fromMinutes;
    const toTotal = toHours * 60 + toMinutes;

    if (currentMinutes < fromTotal || currentMinutes > toTotal) {
      return false;
    }
  }

  return true;
};

const getActiveRulesForSource = async (sourceId?: number | null) => {
  const { data, error } = await supabaseAdmin
    .from('assignment_rules')
    .select(RULE_SELECT)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (error) {
    throw new Error(`Failed to load assignment rules: ${error.message}`);
  }

  if (!data) return [];

  const exactMatches = data.filter(
    (rule) => rule.source_id === sourceId && isRuleActiveNow(rule)
  );
  const globalMatches = data.filter(
    (rule) => rule.source_id === null && isRuleActiveNow(rule)
  );

  return [...exactMatches, ...globalMatches];
};

const getRuleMembers = async (ruleId: string) => {
  const { data, error } = await supabaseAdmin
    .from('rule_members')
    .select('*')
    .eq('rule_id', ruleId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch rule members: ${error.message}`);
  }

  return data || [];
};

const getOrCreatePointer = async (ruleId: string) => {
  const { data, error } = await supabaseAdmin
    .from('assignment_pointers')
    .select('*')
    .eq('rule_id', ruleId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch assignment pointer: ${error.message}`);
  }

  if (data) return data;

  const { data: newPointer, error: createError } = await supabaseAdmin
    .from('assignment_pointers')
    .insert({ rule_id: ruleId, current_index: 0 })
    .select('*')
    .single();

  if (createError) {
    throw new Error(`Failed to create assignment pointer: ${createError.message}`);
  }

  return newPointer;
};

const pickRoundRobinMember = async (rule: any, members: any[]) => {
  const pointer = await getOrCreatePointer(rule.id);
  const memberCount = members.length;
  if (memberCount === 0) return null;

  const currentIndex =
    pointer.current_index !== null
      ? pointer.current_index % memberCount
      : 0;
  const selectedMember =
    members[currentIndex >= 0 ? currentIndex : 0] || members[0];

  const nextIndex = (currentIndex + 1) % memberCount;

  const { error: updatePointerError } = await supabaseAdmin
    .from('assignment_pointers')
    .update({
      current_index: nextIndex,
      last_assigned_user_id: selectedMember.user_id,
      total_assignments: (pointer.total_assignments || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('rule_id', rule.id);

  if (updatePointerError) {
    throw new Error(`Failed to update pointer: ${updatePointerError.message}`);
  }

  return selectedMember;
};

const buildWeightedList = (members: any[]) => {
  const list: any[] = [];
  members.forEach((member) => {
    const weightValue =
      member.percentage !== null && member.percentage !== undefined
        ? Math.max(1, Math.round(member.percentage))
        : Math.max(1, member.weight || 1);
    for (let i = 0; i < weightValue; i++) {
      list.push(member);
    }
  });
  return list;
};

const pickWeightedMember = async (rule: any, members: any[]) => {
  const expanded = buildWeightedList(members);
  if (expanded.length === 0) return null;

  const pointer = await getOrCreatePointer(rule.id);
  const currentIndex =
    pointer.current_index !== null
      ? pointer.current_index % expanded.length
      : 0;
  const selectedMember =
    expanded[currentIndex >= 0 ? currentIndex : 0] || expanded[0];
  const nextIndex = (currentIndex + 1) % expanded.length;

  const { error: updatePointerError } = await supabaseAdmin
    .from('assignment_pointers')
    .update({
      current_index: nextIndex,
      last_assigned_user_id: selectedMember.user_id,
      total_assignments: (pointer.total_assignments || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('rule_id', rule.id);

  if (updatePointerError) {
    throw new Error(`Failed to update pointer: ${updatePointerError.message}`);
  }

  return selectedMember;
};

const assignLeadToUser = async (
  leadId: number,
  userId: number,
  ruleId: string | null,
  ruleType: RuleType
) => {
  const assignedAt = new Date().toISOString();
  const payload = {
    assigned_to: userId,
    assigned_at: assignedAt,
    updated_at: assignedAt,
  };

  const { error } = await supabaseAdmin
    .from('leads_master')
    .update(payload)
    .eq('id', leadId);

  if (error) {
    throw new Error(`Failed to update lead assignment: ${error.message}`);
  }

  const { error: logError } = await supabaseAdmin.from('leads_logs').insert({
    lead_id: leadId,
    old_status: null,
    new_status: 'Assigned',
    remarks: `Auto-assigned to user ${userId}`,
    metadata: {
      action: 'auto_assignment',
      ruleId,
      ruleType,
    },
  });

  if (logError) {
    throw new Error(`Failed to log auto assignment: ${logError.message}`);
  }

  return { assignedAt };
};

export const autoAssignLead = async (
  leadId: number,
  sourceId?: number | null
) => {
  const rules = await getActiveRulesForSource(sourceId);

  for (const rule of rules) {
    const members = await getRuleMembers(rule.id);
    if (!members.length) continue;

    let selectedMember: any = null;

    if (rule.rule_type === 'round_robin') {
      selectedMember = await pickRoundRobinMember(rule, members);
    } else {
      selectedMember = await pickWeightedMember(rule, members);
    }

    if (!selectedMember) continue;

    const result = await assignLeadToUser(
      leadId,
      selectedMember.user_id,
      rule.id,
      rule.rule_type
    );

    // Update member stats
    await supabaseAdmin
      .from('rule_members')
      .update({
        assigned_count: (selectedMember.assigned_count || 0) + 1,
        last_assigned_at: new Date().toISOString(),
      })
      .eq('id', selectedMember.id);

    return {
      assignedTo: selectedMember.user_id,
      ruleId: rule.id,
      ruleType: rule.rule_type,
      assignedAt: result.assignedAt,
    };
  }

  return null;
};

export const getRecentAssignments = async (
  actor: SafeUser,
  filters?: AssignmentLogFilters
) => {
  ensureManager(actor);

  const limit = filters?.limit ?? 50;
  let query = supabaseAdmin
    .from('leads_logs')
    .select(
      `
      id,
      lead_id,
      new_status,
      remarks,
      created_at,
      metadata,
      lead:leads_master(
        id,
        full_name,
        source_id,
        assigned_to,
        status
      ),
      assigned_user:users!leads_logs_created_by_fkey(
        user_id,
        full_name,
        username
      )
    `
    )
    .in('metadata->>action', ['manual_assignment', 'auto_assignment'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (filters?.assignedTo) {
    query = query.eq('lead.assigned_to', filters.assignedTo);
  }

  if (filters?.action) {
    query = query.eq('metadata->>action', filters.action);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch assignments: ${error.message}`);
  }

  return data || [];
};

export const getRuleStats = async (actor: SafeUser, ruleId: string) => {
  ensureManager(actor);

  const { data: rule, error: ruleError } = await supabaseAdmin
    .from('assignment_rules')
    .select(RULE_SELECT)
    .eq('id', ruleId)
    .maybeSingle();

  if (ruleError) {
    throw new Error(`Failed to fetch rule: ${ruleError.message}`);
  }

  if (!rule) {
    throw new Error('Assignment rule not found');
  }

  const { data: members, error: membersError } = await supabaseAdmin
    .from('rule_members')
    .select(MEMBER_SELECT)
    .eq('rule_id', ruleId)
    .order('assigned_count', { ascending: false });

  if (membersError) {
    throw new Error(`Failed to fetch rule members: ${membersError.message}`);
  }

  const { data: pointer, error: pointerError } = await supabaseAdmin
    .from('assignment_pointers')
    .select('*')
    .eq('rule_id', ruleId)
    .maybeSingle();

  if (pointerError) {
    throw new Error(`Failed to fetch pointer: ${pointerError.message}`);
  }

  return {
    rule,
    members: members || [],
    pointer,
  };
};

