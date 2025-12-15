import { supabaseAdmin } from '../config/supabase';

export interface CustomerRecord {
  id: number;
  phone_number_normalized: string;
  full_name: string | null;
  email: string | null;
  city: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Normalize phone number - remove all non-digit characters.
 * We keep this here so it can be reused by walk-in / receptionist flows.
 */
export const normalizePhone = (phone: string): string => {
  return (phone || '').replace(/\D/g, '');
};

export const findCustomerByPhone = async (
  rawPhone: string
): Promise<{ normalizedPhone: string; customer: CustomerRecord | null }> => {
  const normalizedPhone = normalizePhone(rawPhone);

  if (!normalizedPhone || normalizedPhone.length < 10) {
    throw new Error('Invalid phone number - must contain at least 10 digits');
  }

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('phone_number_normalized', normalizedPhone)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch customer: ${error.message}`);
  }

  return {
    normalizedPhone,
    customer: (data as CustomerRecord | null) ?? null
  };
};

export const findOrCreateCustomerByPhone = async (params: {
  rawPhone: string;
  fullName?: string | null;
  email?: string | null;
  city?: string | null;
}): Promise<{ normalizedPhone: string; customer: CustomerRecord }> => {
  const { rawPhone, fullName, email, city } = params;

  const { normalizedPhone, customer } = await findCustomerByPhone(rawPhone);

  if (customer) {
    return { normalizedPhone, customer };
  }

  const { data, error } = await supabaseAdmin
    .from('customers')
    .insert({
      phone_number_normalized: normalizedPhone,
      full_name: fullName ?? null,
      email: email ?? null,
      city: city ?? null
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create customer: ${error?.message}`);
  }

  return {
    normalizedPhone,
    customer: data as CustomerRecord
  };
};


