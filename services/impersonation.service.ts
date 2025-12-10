import { supabaseAdmin } from '../config/supabase';
import { getUserById, toSafeUser } from './user.service';
import { SafeUser } from '../types/user';
import { generateAccessToken, AccessTokenPayload } from './token.service';
import { writeSystemLog } from './logging.service';

export interface ImpersonationSession {
  id: number;
  admin_user_id: number;
  impersonated_user_id: number;
  started_at: string;
  ended_at: string | null;
  actions_count: number;
}

/**
 * Start impersonation session
 */
export async function startImpersonation(
  adminUserId: number,
  targetUserId: number
): Promise<{ accessToken: string; impersonatedUser: SafeUser; sessionId: number }> {
  // Verify admin has permission (Admin or CRE_TL)
  const admin = await getUserById(adminUserId);
  if (!admin) {
    throw new Error('Admin user not found');
  }

  if (admin.role !== 'Admin' && admin.role !== 'CRE_TL') {
    throw new Error('Only Admin and CRE_TL can impersonate users');
  }

  // Get target user
  const targetUser = await getUserById(targetUserId);
  if (!targetUser || !targetUser.status) {
    throw new Error('Target user not found or inactive');
  }

  // Verify target user is a CRE
  if (targetUser.role !== 'CRE') {
    throw new Error('Can only impersonate CRE users');
  }

  // Create impersonation session
  const { data: session, error } = await supabaseAdmin
    .from('impersonation_logs')
    .insert({
      admin_user_id: adminUserId,
      impersonated_user_id: targetUserId,
      started_at: new Date().toISOString(),
      actions_count: 0,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create impersonation session: ${error.message}`);
  }

  // Generate access token for impersonated user
  const safeUser = toSafeUser(targetUser);
  const payload: AccessTokenPayload = {
    userId: safeUser.id,
    role: safeUser.role,
    username: safeUser.username,
    isDeveloper: safeUser.isDeveloper,
    // Add impersonation metadata to token
    impersonatedBy: adminUserId,
    impersonationSessionId: session.id,
  };

  const accessToken = generateAccessToken(payload);

  // Log impersonation start
  await writeSystemLog({
    level: 'info',
    message: `Impersonation started: Admin ${admin.full_name || admin.username} (ID: ${adminUserId}) is viewing as CRE ${targetUser.full_name || targetUser.username} (ID: ${targetUserId})`,
    metadata: {
      adminUserId,
      targetUserId,
      sessionId: session.id,
      action: 'impersonation_start',
    },
    user_id: adminUserId,
  });

  return {
    accessToken,
    impersonatedUser: safeUser,
    sessionId: session.id,
  };
}

/**
 * End impersonation session
 */
export async function endImpersonation(
  sessionId: number,
  adminUserId: number
): Promise<void> {
  // Get session
  const { data: session, error: fetchError } = await supabaseAdmin
    .from('impersonation_logs')
    .select('*')
    .eq('id', sessionId)
    .eq('admin_user_id', adminUserId)
    .single();

  if (fetchError || !session) {
    throw new Error('Impersonation session not found');
  }

  if (session.ended_at) {
    throw new Error('Impersonation session already ended');
  }

  // Update session
  const { error: updateError } = await supabaseAdmin
    .from('impersonation_logs')
    .update({
      ended_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (updateError) {
    throw new Error(`Failed to end impersonation session: ${updateError.message}`);
  }

  // Get admin and target user for logging
  const admin = await getUserById(adminUserId);
  const targetUser = await getUserById(session.impersonated_user_id);

  // Log impersonation end
  await writeSystemLog({
    level: 'info',
    message: `Impersonation ended: Admin ${admin?.full_name || admin?.username} (ID: ${adminUserId}) stopped viewing as CRE ${targetUser?.full_name || targetUser?.username} (ID: ${session.impersonated_user_id}). Actions performed: ${session.actions_count}`,
    metadata: {
      adminUserId,
      targetUserId: session.impersonated_user_id,
      sessionId,
      actionsCount: session.actions_count,
      action: 'impersonation_end',
    },
    user_id: adminUserId,
  });
}

/**
 * Increment actions count for impersonation session
 */
export async function incrementImpersonationActions(sessionId: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc('increment_impersonation_actions', {
    session_id: sessionId,
  });

  // If RPC doesn't exist, use direct update
  if (error) {
    const { data: session } = await supabaseAdmin
      .from('impersonation_logs')
      .select('actions_count')
      .eq('id', sessionId)
      .single();

    if (session) {
      await supabaseAdmin
        .from('impersonation_logs')
        .update({ actions_count: (session.actions_count || 0) + 1 })
        .eq('id', sessionId);
    }
  }
}

/**
 * Get active impersonation session for admin
 */
export async function getActiveImpersonationSession(
  adminUserId: number
): Promise<ImpersonationSession | null> {
  const { data, error } = await supabaseAdmin
    .from('impersonation_logs')
    .select('*')
    .eq('admin_user_id', adminUserId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch impersonation session: ${error.message}`);
  }

  return data;
}

/**
 * Get impersonation history for admin
 */
export async function getImpersonationHistory(
  adminUserId: number,
  limit: number = 50
): Promise<ImpersonationSession[]> {
  const { data, error } = await supabaseAdmin
    .from('impersonation_logs')
    .select('*')
    .eq('admin_user_id', adminUserId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch impersonation history: ${error.message}`);
  }

  return data || [];
}

