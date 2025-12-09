import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';
import { SafeUser, UserRecord, UserRole } from '../types/user';

export interface CreateUserInput {
  fullName?: string | null;
  username: string;
  password: string;
  role: UserRole;
  phoneNumber?: string | null;
  email?: string | null;
  status?: boolean;
}

export interface UpdateUserInput {
  fullName?: string | null;
  password?: string;
  role?: UserRole;
  phoneNumber?: string | null;
  email?: string | null;
  status?: boolean;
}

const USERS_TABLE = 'users';

const mapToSafeUser = (record: UserRecord): SafeUser => ({
  id: record.user_id,
  fullName: record.full_name,
  username: record.username,
  role: record.role,
  phoneNumber: record.phone_number,
  email: record.email,
  status: record.status,
  isDeveloper: record.username === env.developerUsername
});

export const getUserByUsername = async (username: string): Promise<UserRecord | null> => {
  const { data, error } = await supabaseAdmin
    .from(USERS_TABLE)
    .select('*')
    .eq('username', username)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] getUserByUsername error', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(
      `Failed to fetch user: ${error.message}${
        error.details ? ` (${error.details})` : ''
      }`
    );
  }

  return (data as UserRecord | null) ?? null;
};

export const getUserById = async (userId: number): Promise<UserRecord | null> => {
  const { data, error } = await supabaseAdmin
    .from(USERS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch user: ${error.message}`);
  }

  return (data as UserRecord | null) ?? null;
};

export const listUsers = async (): Promise<SafeUser[]> => {
  const { data, error } = await supabaseAdmin.from(USERS_TABLE).select('*').order('created_at', {
    ascending: false
  });

  if (error) {
    throw new Error(`Failed to list users: ${error.message}`);
  }

  return ((data as UserRecord[]) ?? []).map(mapToSafeUser);
};

export const createUser = async (payload: CreateUserInput): Promise<SafeUser> => {
  const passwordHash = await bcrypt.hash(payload.password, 10);

  const { data, error } = await supabaseAdmin
    .from(USERS_TABLE)
    .insert({
      full_name: payload.fullName ?? null,
      username: payload.username,
      password_hash: passwordHash,
      role: payload.role,
      phone_number: payload.phoneNumber ?? null,
      email: payload.email ?? null,
      status: payload.status ?? true
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create user: ${error?.message}`);
  }

  return mapToSafeUser(data as UserRecord);
};

export const updateUser = async (userId: number, payload: UpdateUserInput): Promise<SafeUser> => {
  const updates: Partial<UserRecord> = {};

  if (payload.fullName !== undefined) updates.full_name = payload.fullName;
  if (payload.role) updates.role = payload.role;
  if (payload.phoneNumber !== undefined) updates.phone_number = payload.phoneNumber;
  if (payload.email !== undefined) updates.email = payload.email;
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.password) {
    updates.password_hash = await bcrypt.hash(payload.password, 10);
  }

  const { data, error } = await supabaseAdmin
    .from(USERS_TABLE)
    .update(updates)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update user: ${error?.message}`);
  }

  return mapToSafeUser(data as UserRecord);
};

export const deleteUser = async (userId: number): Promise<void> => {
  const { error } = await supabaseAdmin.from(USERS_TABLE).delete().eq('user_id', userId);
  if (error) {
    throw new Error(`Failed to delete user: ${error.message}`);
  }
};

export const ensureDeveloperAccount = async (): Promise<void> => {
  try {
    const existing = await getUserByUsername(env.developerUsername);

    if (!existing) {
      // Create new developer account with Developer role
      await createUser({
        username: env.developerUsername,
        password: env.developerPassword,
        role: 'Developer', // Developer role for developer panel access
        fullName: 'MGCRM Developer',
        status: true
      });
      return;
    }

    // Update existing developer account to ensure it has Developer role
    const needsUpdate = existing.role !== 'Developer';
    const passwordMatches = await bcrypt.compare(env.developerPassword, existing.password_hash);

    if (needsUpdate || !passwordMatches) {
      const updates: any = {};
      
      if (needsUpdate) {
        updates.role = 'Developer';
      }
      
      if (!passwordMatches) {
        updates.password_hash = await bcrypt.hash(env.developerPassword, 10);
      }

      const { error } = await supabaseAdmin
        .from(USERS_TABLE)
        .update(updates)
        .eq('user_id', existing.user_id);
        
      if (error) {
        throw new Error(`Failed to update developer account: ${error.message}`);
      }
    }
  } catch (error: any) {
    // Re-throw with more context
    if (error.message?.includes('fetch failed') || error.message?.includes('timeout')) {
      throw new Error(`Network timeout connecting to Supabase: ${error.message}`);
    }
    throw error;
  }
};

export const toSafeUser = (record: UserRecord): SafeUser => mapToSafeUser(record);

