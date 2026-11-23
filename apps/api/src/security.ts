import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from './config.js';
import { CSRF_COOKIE, CSRF_HEADER, ROUTE_ACCESS, SESSION_COOKIE, type AccessKey, type Role } from './constants.js';
import type { Database } from './db.js';
import { errors } from './errors.js';
import type { AuthContext, AuthUser, Queryable } from './types.js';

const BCRYPT_ROUNDS = 12;
const SESSION_BYTES = 32;

interface SessionRow extends Record<string, unknown> {
  session_id: string;
  created_at: string | Date;
  user_id: string;
  username: string;
  status: string;
  roles: string[] | null;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

export function digestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSessionToken(): string {
  return randomBytes(SESSION_BYTES).toString('base64url');
}

export function createCsrfCookie(secret: string): { token: string; signed: string } {
  const token = randomBytes(SESSION_BYTES).toString('base64url');
  const signature = createHmac('sha256', secret).update(token).digest('base64url');
  return { token, signed: `${token}.${signature}` };
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyCsrf(request: FastifyRequest, secret: string): void {
  const signed = request.cookies[CSRF_COOKIE];
  const header = request.headers[CSRF_HEADER];
  if (!signed || typeof header !== 'string') throw errors.csrf();
  const [token, signature] = signed.split('.');
  if (!token || !signature) throw errors.csrf();
  const expected = createHmac('sha256', secret).update(token).digest('base64url');
  if (!safeEqual(signature, expected) || !safeEqual(header, token)) throw errors.csrf();
}

export function cookieOptions(config: AppConfig, httpOnly: boolean) {
  return {
    path: '/',
    sameSite: 'lax' as const,
    secure: config.nodeEnv !== 'local',
    httpOnly,
    maxAge: config.sessionAbsoluteTtlMin * 60,
  };
}

export async function establishSession(
  db: Database,
  user: AuthUser,
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
): Promise<{ sessionId: string; csrfToken: string }> {
  const token = createSessionToken();
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + config.sessionAbsoluteTtlMin * 60_000);
  await db.query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, now())`,
    [sessionId, user.id, digestToken(token), expiresAt],
  );
  const csrf = createCsrfCookie(config.sessionSecret);
  reply.setCookie(SESSION_COOKIE, token, cookieOptions(config, true));
  reply.setCookie(CSRF_COOKIE, csrf.signed, cookieOptions(config, false));
  request.auth = { user, sessionId, sessionToken: token };
  return { sessionId, csrfToken: csrf.token };
}

export async function loadSession(
  db: Database,
  request: FastifyRequest,
  config: AppConfig,
): Promise<AuthContext> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) throw errors.unauthenticated();
  const result = await db.query<SessionRow>(
    `SELECT s.id AS session_id, s.created_at, u.id AS user_id, u.username, u.status,
            array_agg(r.role) FILTER (WHERE r.role IS NOT NULL) AS roles
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN user_roles r ON r.user_id = u.id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
      GROUP BY s.id, s.created_at, u.id, u.username, u.status`,
    [digestToken(token)],
  );
  const row = result.rows[0];
  if (!row || row.status !== 'active') throw errors.unauthenticated();

  const createdAt = new Date(row.created_at).getTime();
  const idleExpires = Date.now() + config.sessionIdleTtlMin * 60_000;
  const absoluteExpires = createdAt + config.sessionAbsoluteTtlMin * 60_000;
  const nextExpiry = new Date(Math.min(idleExpires, absoluteExpires));
  await db.query('UPDATE sessions SET expires_at = $1 WHERE id = $2', [nextExpiry, row.session_id]);

  const roles = (row.roles ?? []) as Role[];
  const auth: AuthContext = {
    user: { id: row.user_id, username: row.username, roles },
    sessionId: row.session_id,
    sessionToken: token,
  };
  request.auth = auth;
  return auth;
}

export async function requireAuth(
  db: Database,
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
  accessKey: AccessKey,
  options: { write?: boolean } = {},
): Promise<AuthContext> {
  let auth: AuthContext;
  try {
    auth = await loadSession(db, request, config);
  } catch (error) {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.clearCookie(CSRF_COOKIE, { path: '/' });
    throw error;
  }
  const allowedRoles = ROUTE_ACCESS[accessKey];
  const hasRole = auth.user.roles.some((role) => (allowedRoles as readonly string[]).includes(role));
  if (!hasRole) {
    await appendAudit(db, {
      actorId: auth.user.id,
      action: 'authz.denied',
      targetType: 'endpoint',
      targetId: accessKey,
      requestId: request.id,
      result: 'denied',
    });
    throw errors.forbidden();
  }
  if (options.write) verifyCsrf(request, config.sessionSecret);
  return auth;
}

export async function appendAudit(
  db: Queryable,
  entry: {
    actorId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    requestId: string;
    result: 'success' | 'failure' | 'denied';
  },
): Promise<void> {
  await db.query(
    `INSERT INTO audit_events (id, actor_id, action, target_type, target_id, request_id, result)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
      entry.actorId ?? null,
      entry.action,
      entry.targetType,
      entry.targetId ?? null,
      entry.requestId,
      entry.result,
    ],
  );
}
