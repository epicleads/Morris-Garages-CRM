import crypto from 'crypto';
import { sign, verify, JwtPayload, SignOptions } from 'jsonwebtoken';
import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';

interface RefreshTokenRecord {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  revoked: boolean;
}

export interface AccessTokenPayload {
  userId: number;
  role: string;
  username: string;
  isDeveloper: boolean;
}

const REFRESH_TABLE = 'refresh_tokens';

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const generateAccessToken = (payload: AccessTokenPayload): string => {
  const options: SignOptions = {
    expiresIn: env.accessTokenTtl as SignOptions['expiresIn'],
    subject: String(payload.userId)
  };

  return sign(
    {
      role: payload.role,
      username: payload.username,
      isDeveloper: payload.isDeveloper
    },
    env.jwtAccessSecret,
    options
  );
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const decoded = verify(token, env.jwtAccessSecret) as JwtPayload & { isDeveloper: boolean };
  return {
    userId: Number(decoded.sub),
    role: String(decoded.role),
    username: String(decoded.username),
    isDeveloper: Boolean(decoded.isDeveloper)
  };
};

export const generateRefreshToken = async (userId: number) => {
  const token = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + parseTtl(env.refreshTokenTtl));

  const { error } = await supabaseAdmin.from(REFRESH_TABLE).insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString()
  });

  if (error) {
    throw new Error(`Failed to persist refresh token: ${error.message}`);
  }

  return { token, expiresAt };
};

export const verifyRefreshToken = async (token: string): Promise<RefreshTokenRecord> => {
  const tokenHash = hashToken(token);
  const { data, error } = await supabaseAdmin
    .from(REFRESH_TABLE)
    .select('*')
    .eq('token_hash', tokenHash)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Invalid refresh token');
  }

  if (data.revoked) {
    throw new Error('Refresh token revoked');
  }

  if (new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error('Refresh token expired');
  }

  return data as RefreshTokenRecord;
};

export const revokeRefreshToken = async (token: string): Promise<void> => {
  const tokenHash = hashToken(token);
  const { error } = await supabaseAdmin
    .from(REFRESH_TABLE)
    .update({ revoked: true })
    .eq('token_hash', tokenHash);

  if (error) {
    throw new Error(`Failed to revoke refresh token: ${error.message}`);
  }
};

const parseTtl = (ttl: string) => {
  const match = ttl.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error('TTL format must be number followed by s/m/h/d');
  }

  const value = Number(match[1]);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return value * multipliers[unit];
};

