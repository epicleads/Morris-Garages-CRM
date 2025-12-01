import dotenv from 'dotenv';

dotenv.config();

const requiredVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_ANON_KEY',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'ACCESS_TOKEN_TTL',
  'REFRESH_TOKEN_TTL',
  'DEVELOPER_USERNAME',
  'DEVELOPER_PASSWORD'
];

requiredVars.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Environment variable ${key} is required`);
  }
});

const parseNumber = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseNumber(process.env.PORT, 4000),
  supabaseUrl: process.env.SUPABASE_URL as string,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY as string,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY as string,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET as string,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET as string,
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL ?? '30d',
  developerUsername: process.env.DEVELOPER_USERNAME as string,
  developerPassword: process.env.DEVELOPER_PASSWORD as string
};

