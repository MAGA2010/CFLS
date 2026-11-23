import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { createDatabase, type Database } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { hashPassword } from '../src/security.js';

export const TEST_PASSWORD = 'Test-only-password-123!';

export interface TestContext {
  app: FastifyInstance;
  db: Database;
  config: AppConfig;
  close: () => Promise<void>;
  login: (username: string) => Promise<{ cookie: string; csrfToken: string }>;
}

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'local',
    port: 3000,
    databaseUrl: process.env.TEST_DATABASE_URL ?? 'memory://',
    sessionSecret: 'test-session-secret-at-least-32-bytes',
    corsOrigin: 'http://127.0.0.1:5173',
    inquiryEnabled: true,
    sessionIdleTtlMin: 120,
    sessionAbsoluteTtlMin: 720,
    rateLimitLogin: 5,
    rateLimitApi: 120,
    inquiryIdempotencyTtlH: 24,
    logLevel: 'silent',
    ...overrides,
  };
}

export async function createTestContext(overrides: Partial<AppConfig> = {}): Promise<TestContext> {
  const config = testConfig(overrides);
  const db = await createDatabase(config.databaseUrl);
  await runMigrations(db);
  await db.exec(`TRUNCATE idempotency_keys, inquiries, audit_events, content_revisions, contents, sessions, user_roles, users CASCADE`);
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const roles = ['editor', 'reviewer', 'admissions', 'admin'] as const;
  for (const role of roles) {
    const id = randomUUID();
    await db.query('INSERT INTO users (id, username, password_hash) VALUES ($1,$2,$3)', [
      id,
      `test-${role}`,
      passwordHash,
    ]);
    await db.query('INSERT INTO user_roles (user_id, role) VALUES ($1,$2)', [id, role]);
  }
  const app = await buildApp({ config, db, dummyPasswordHash: passwordHash });
  const login = async (username: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/sessions',
      payload: { username, password: TEST_PASSWORD },
    });
    if (response.statusCode !== 200) throw new Error(`Login failed: ${response.statusCode} ${response.body}`);
    const session = response.cookies.find((cookie) => cookie.name === 'cfls_session');
    const csrf = response.cookies.find((cookie) => cookie.name === 'cfls_csrf');
    const body = response.json() as { data: { csrfToken: string } };
    if (!session || !csrf) throw new Error('Login cookies missing');
    return {
      cookie: `cfls_session=${session.value}; cfls_csrf=${csrf.value}`,
      csrfToken: body.data.csrfToken,
    };
  };
  return {
    app,
    db,
    config,
    login,
    close: async () => {
      await app.close();
      await db.close();
    },
  };
}

export function writeHeaders(session: { cookie: string; csrfToken: string }): Record<string, string> {
  return { cookie: session.cookie, 'x-csrf-token': session.csrfToken };
}
