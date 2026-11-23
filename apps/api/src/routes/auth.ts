import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import { CSRF_COOKIE, SESSION_COOKIE, type Role } from '../constants.js';
import type { Database } from '../db.js';
import { errors } from '../errors.js';
import { RateLimiter } from '../rate-limit.js';
import {
  appendAudit,
  cookieOptions,
  establishSession,
  loadSession,
  verifyPassword,
  verifyCsrf,
} from '../security.js';
import { loginSchema } from '../validation.js';

interface LoginRow extends Record<string, unknown> {
  id: string;
  username: string;
  password_hash: string;
  status: string;
  roles: string[] | null;
}

export async function authRoutes(
  app: FastifyInstance,
  db: Database,
  config: AppConfig,
  dummyPasswordHash: string,
): Promise<void> {
  const loginIpLimiter = new RateLimiter(config.rateLimitLogin);
  const loginUserLimiter = new RateLimiter(config.rateLimitLogin);

  app.post('/v1/admin/sessions', async (request, reply) => {
    if (!loginIpLimiter.hit(`ip:${request.ip}`)) throw errors.rateLimited();
    const body = loginSchema.parse(request.body);
    if (!loginUserLimiter.hit(`user:${body.username.toLowerCase()}`)) throw errors.rateLimited();

    const result = await db.query<LoginRow>(
      `SELECT u.id, u.username, u.password_hash, u.status,
              array_agg(r.role) FILTER (WHERE r.role IS NOT NULL) AS roles
         FROM users u
         LEFT JOIN user_roles r ON r.user_id = u.id
        WHERE lower(u.username) = lower($1)
        GROUP BY u.id, u.username, u.password_hash, u.status`,
      [body.username],
    );
    const user = result.rows[0];
    const valid = await verifyPassword(body.password, user?.password_hash ?? dummyPasswordHash);
    if (!user || !valid || user.status !== 'active') {
      await appendAudit(db, {
        ...(user?.id ? { actorId: user.id } : {}),
        action: 'auth.login.failure',
        targetType: 'auth',
        requestId: request.id,
        result: 'failure',
      });
      throw errors.authFailed();
    }

    const roles = (user.roles ?? []) as Role[];
    const auth = { user: { id: user.id, username: user.username, roles }, sessionId: '', sessionToken: '' };
    const session = await establishSession(db, auth.user, request, reply, config);
    await appendAudit(db, {
      actorId: user.id,
      action: 'auth.login.success',
      targetType: 'auth',
      requestId: request.id,
      result: 'success',
    });
    return reply.send({
      data: {
        id: user.id,
        username: user.username,
        roles,
        environment: config.nodeEnv,
        csrfToken: session.csrfToken,
      },
      requestId: request.id,
    });
  });

  app.get('/v1/admin/me', async (request, reply) => {
    const auth = await loadSession(db, request, config);
    return reply.send({
      data: {
        id: auth.user.id,
        username: auth.user.username,
        roles: auth.user.roles,
        environment: config.nodeEnv,
      },
      requestId: request.id,
    });
  });

  app.delete('/v1/admin/sessions/current', async (request, reply) => {
    const auth = await loadSession(db, request, config);
    verifyCsrf(request, config.sessionSecret);
    await db.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [auth.sessionId]);
    await appendAudit(db, {
      actorId: auth.user.id,
      action: 'auth.logout',
      targetType: 'auth',
      requestId: request.id,
      result: 'success',
    });
    reply.clearCookie(SESSION_COOKIE, cookieOptions(config, true));
    reply.clearCookie(CSRF_COOKIE, cookieOptions(config, false));
    return reply.status(204).send();
  });

}
