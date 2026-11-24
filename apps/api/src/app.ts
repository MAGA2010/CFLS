import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import type { Database } from './db.js';
import { errors, normalizeError, sendError } from './errors.js';
import { RateLimiter } from './rate-limit.js';
import { hashPassword } from './security.js';
import { auditRoutes } from './routes/audit.js';
import { authRoutes } from './routes/auth.js';
import { contentRoutes } from './routes/contents.js';
import { healthRoutes } from './routes/health.js';
import { inquiryRoutes } from './routes/inquiries.js';
import { publicContentRoutes } from './routes/public-content.js';

interface BuildOptions {
  config: AppConfig;
  db: Database;
  dummyPasswordHash?: string;
  loggerStream?: { write(message: string): void };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function buildApp(options: BuildOptions): Promise<FastifyInstance> {
  const { config, db } = options;
  const app = Fastify({
    logger:
      config.logLevel === 'silent'
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: [
                'req.headers.cookie',
                'req.headers.authorization',
                'password',
                'testName',
                'testContact',
                'message',
                'DATABASE_URL',
                '*.password',
                '*.token',
              ],
              censor: '[REDACTED]',
            },
            ...(options.loggerStream ? { stream: options.loggerStream } : {}),
          },
    bodyLimit: 100 * 1024,
    genReqId(request) {
      const candidate = request.headers['x-request-id'];
      return config.trustRequestId && typeof candidate === 'string' && UUID.test(candidate)
        ? candidate
        : randomUUID();
    },
    requestIdHeader: 'x-request-id',
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  const apiLimiter = new RateLimiter(config.rateLimitApi);
  app.addHook('onRequest', async (request) => {
    if (!request.url.startsWith('/v1/')) return;
    if (request.method === 'POST' && request.url === '/v1/admin/sessions') return;
    if (request.url.startsWith('/v1/public/test-inquiries')) return;
    if (!apiLimiter.hit(`ip:${request.ip}`)) throw errors.rateLimited();
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
    if (request.url.startsWith('/v1/admin')) reply.header('cache-control', 'no-store');
  });

  app.setErrorHandler((error, request, reply) => {
    const known = normalizeError(error);
    if (known.code === 'INTERNAL_ERROR') request.log.error({ err: error }, 'Unhandled request error');
    if ((error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return sendError(reply, request.id, errors.validation('body too large'));
    }
    if ((error as { statusCode?: number }).statusCode === 400 && known.code === 'INTERNAL_ERROR') {
      return sendError(reply, request.id, errors.validation('Malformed request'));
    }
    return sendError(reply, request.id, known);
  });

  app.setNotFoundHandler((request, reply) => sendError(reply, request.id, errors.notFound()));

  const dummyPasswordHash = options.dummyPasswordHash ?? (await hashPassword('not-a-real-user-password'));
  await healthRoutes(app, db);
  await publicContentRoutes(app, db, config);
  await authRoutes(app, db, config, dummyPasswordHash);
  await contentRoutes(app, db, config);
  await inquiryRoutes(app, db, config);
  await auditRoutes(app, db, config);
  return app;
}
