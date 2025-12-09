export type UserRole = 'Admin' | 'CRE' | 'CRE_TL' | 'Developer';

export interface UserRecord {
  user_id: number;
  full_name: string | null;
  username: string;
  password_hash: string;
  role: UserRole;
  phone_number: string | null;
  email: string | null;
  status: boolean;
  created_at: string;
  updated_at: string;
}

export interface SafeUser {
  id: number;
  fullName: string | null;
  username: string;
  role: UserRole;
  phoneNumber: string | null;
  email: string | null;
  status: boolean;
  isDeveloper: boolean;
}

export type AuthenticatedUser = SafeUser;

