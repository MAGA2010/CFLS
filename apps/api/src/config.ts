import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url(),
  INQUIRY_ENABLED: z.enum(['true', 'false']).default('false'),
  AUTO_MIGRATE: z.enum(['true', 'false']).default('false'),
  SESSION_IDLE_TTL_MIN: z.coerce.number().int().positive().default(120),
  SESSION_ABSOLUTE_TTL_MIN: z.coerce.number().int().positive().default(720),
  RATE_LIMIT_LOGIN: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_API: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_INQUIRY: z.coerce.number().int().positive().default(5),
  TRUST_REQUEST_ID: z.enum(['true', 'false']).default('false'),
  INQUIRY_IDEMPOTENCY_TTL_H: z.coerce.number().int().positive().default(24),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type AppConfig = {
  nodeEnv: 'local' | 'staging' | 'production';
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  corsOrigin: string;
  inquiryEnabled: boolean;
  autoMigrate: boolean;
  sessionIdleTtlMin: number;
  sessionAbsoluteTtlMin: number;
  rateLimitLogin: number;
  rateLimitApi: number;
  rateLimitInquiry: number;
  trustRequestId: boolean;
  inquiryIdempotencyTtlH: number;
  logLevel: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'environment')))];
    throw new Error(`Invalid environment configuration. Missing or invalid: ${fields.join(', ')}`);
  }
  const value = parsed.data;
  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    databaseUrl: value.DATABASE_URL,
    sessionSecret: value.SESSION_SECRET,
    corsOrigin: value.CORS_ORIGIN,
    inquiryEnabled: value.INQUIRY_ENABLED === 'true',
    autoMigrate: value.AUTO_MIGRATE === 'true',
    sessionIdleTtlMin: value.SESSION_IDLE_TTL_MIN,
    sessionAbsoluteTtlMin: value.SESSION_ABSOLUTE_TTL_MIN,
    rateLimitLogin: value.RATE_LIMIT_LOGIN,
    rateLimitApi: value.RATE_LIMIT_API,
    rateLimitInquiry: value.RATE_LIMIT_INQUIRY,
    trustRequestId: value.TRUST_REQUEST_ID === 'true',
    inquiryIdempotencyTtlH: value.INQUIRY_IDEMPOTENCY_TTL_H,
    logLevel: value.LOG_LEVEL,
  };
}
