import type { FastifyInstance } from 'fastify';
import type { Database } from '../db.js';

export async function healthRoutes(app: FastifyInstance, db: Database): Promise<void> {
  app.get('/health/live', async (_request, reply) =>
    reply.send({ data: { status: 'ok' }, requestId: _request.id }),
  );

  app.get('/health/ready', async (request, reply) => {
    try {
      await Promise.race([
        db.query('SELECT 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
      ]);
      return reply.send({ data: { status: 'ready' }, requestId: request.id });
    } catch {
      return reply.status(503).send({ data: { status: 'unavailable' }, requestId: request.id });
    }
  });
}
