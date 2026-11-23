import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import type { Database } from '../db.js';
import { errors } from '../errors.js';
import { toIso } from '../presenters.js';
import { requireAuth } from '../security.js';
import { parsePagination } from '../validation.js';

interface AuditRow extends Record<string, unknown> {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  request_id: string;
  result: string;
  created_at: string | Date;
}

export async function auditRoutes(app: FastifyInstance, db: Database, config: AppConfig): Promise<void> {
  app.get('/v1/admin/audit-events', async (request, reply) => {
    await requireAuth(db, request, reply, config, 'audit.read');
    const query = request.query as Record<string, unknown>;
    const { page, pageSize, offset } = parsePagination(query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.action !== undefined) {
      if (typeof query.action !== 'string') throw errors.validation('Invalid action');
      values.push(query.action);
      conditions.push(`action=$${values.length}`);
    }
    const from = parseDate(query.from, 'from');
    const to = parseDate(query.to, 'to');
    if (from) {
      values.push(from);
      conditions.push(`created_at >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      conditions.push(`created_at <= $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await db.query<{ total: string }>(`SELECT count(*) AS total FROM audit_events ${where}`, values);
    const rows = await db.query<AuditRow>(
      `SELECT id, actor_id, action, target_type, target_id, request_id, result, created_at
         FROM audit_events ${where}
        ORDER BY created_at DESC, id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    );
    return reply.send({
      data: rows.rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        requestId: row.request_id,
        result: row.result,
        createdAt: toIso(row.created_at),
      })),
      meta: { page, pageSize, total: Number(total.rows[0]?.total ?? 0) },
      requestId: request.id,
    });
  });
}

function parseDate(value: unknown, name: string): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw errors.validation(`${name} must be an ISO date`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw errors.validation(`${name} must be an ISO date`);
  return date;
}
