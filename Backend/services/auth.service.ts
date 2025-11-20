import bcrypt from 'bcryptjs';
import { getUserById, getUserByUsername, toSafeUser, ensureDeveloperAccount } from './user.service';
import { SafeUser } from '../types/user';
import {
  AccessTokenPayload,
  generateAccessToken,
  generateRefreshToken,
  revokeRefreshToken,
  verifyRefreshToken
} from './token.service';

export const authenticateUser = async (username: string, password: string) => {
  const userRecord = await getUserByUsername(username);

  if (!userRecord || !userRecord.status) {
    throw new Error('Invalid credentials');
  }

  const isPasswordValid = await bcrypt.compare(password, userRecord.password_hash);

  if (!isPasswordValid) {
    throw new Error('Invalid credentials');
  }

  const safeUser = toSafeUser(userRecord);
  const payload: AccessTokenPayload = {
    userId: safeUser.id,
    role: safeUser.role,
    username: safeUser.username,
    isDeveloper: safeUser.isDeveloper
  };

  const accessToken = generateAccessToken(payload);
  const refreshPayload = await generateRefreshToken(safeUser.id);

  return {
    user: safeUser,
    accessToken,
    refreshToken: refreshPayload.token,
    refreshTokenExpiresAt: refreshPayload.expiresAt
  };
};

export const refreshSession = async (refreshToken: string) => {
  const record = await verifyRefreshToken(refreshToken);
  const user = await getUserById(record.user_id);

  if (!user || !user.status) {
    throw new Error('User not found or inactive');
  }

  const safeUser = toSafeUser(user);
  const payload: AccessTokenPayload = {
    userId: safeUser.id,
    role: safeUser.role,
    username: safeUser.username,
    isDeveloper: safeUser.isDeveloper
  };

  await revokeRefreshToken(refreshToken);
  const newRefresh = await generateRefreshToken(safeUser.id);

  return {
    user: safeUser,
    accessToken: generateAccessToken(payload),
    refreshToken: newRefresh.token,
    refreshTokenExpiresAt: newRefresh.expiresAt
  };
};

export const logoutSession = async (refreshToken: string) => {
  await revokeRefreshToken(refreshToken);
};

export const ensureDeveloper = async (): Promise<void> => {
  await ensureDeveloperAccount();
};

export const getProfile = async (userId: number): Promise<SafeUser> => {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  return toSafeUser(user);
};

