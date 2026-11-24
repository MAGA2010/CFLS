import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import type { Database } from '../db.js';
import { errors } from '../errors.js';
import { RateLimiter } from '../rate-limit.js';
import { appendAudit, requireAuth } from '../security.js';
import { inquirySchema, parsePagination } from '../validation.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface InquiryRow extends Record<string, unknown> {
  id: string;
  kind: string;
  test_name: string;
  test_contact: string;
  message: string | null;
  status: string;
  is_test: boolean;
  created_at: string | Date;
}

interface IdempotencyRow extends Record<string, unknown> {
  request_hash: string;
  result_ref: string | null;
  expires_at: string | Date;
}

function inquiryResponse(row: InquiryRow) {
  return {
    id: row.id,
    kind: row.kind,
    testName: row.test_name,
    testContact: row.test_contact,
    message: row.message,
    status: row.status,
    isTest: row.is_test,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function canonicalHash(value: {
  kind: string;
  testName: string;
  testContact: string;
  message: string;
  isTest: true;
}): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function inquiryRoutes(app: FastifyInstance, db: Database, config: AppConfig): Promise<void> {
  const limiter = new RateLimiter(config.rateLimitInquiry);

  app.post('/v1/public/test-inquiries', async (request, reply) => {
    if (config.nodeEnv === 'production' || !config.inquiryEnabled) throw errors.notFound();
    if (!limiter.hit(`ip:${request.ip}`)) throw errors.rateLimited();
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !UUID_V4.test(key)) throw errors.validation('Idempotency-Key must be a UUID v4');
    const parsed = inquirySchema.parse(request.body);
    const normalized = {
      isTest: true as const,
      kind: parsed.kind,
      message: (parsed.message ?? '').trim(),
      testContact: parsed.testContact.trim(),
      testName: parsed.testName.trim(),
    };
    const requestHash = canonicalHash(normalized);
    const scope = `${config.nodeEnv}:test-inquiries`;
    const expiresAt = new Date(Date.now() + config.inquiryIdempotencyTtlH * 3_600_000);

    const result = await db.transaction(async (tx) => {
      const insertedKey = await tx.query<{ key: string }>(
        `INSERT INTO idempotency_keys (scope, key, request_hash, expires_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (scope, key) DO NOTHING
         RETURNING key`,
        [scope, key, requestHash, expiresAt],
      );

      if (insertedKey.rowCount === 0) {
        const existing = await tx.query<IdempotencyRow>(
          'SELECT request_hash, result_ref, expires_at FROM idempotency_keys WHERE scope=$1 AND key=$2 FOR UPDATE',
          [scope, key],
        );
        const row = existing.rows[0];
        if (!row) throw errors.internal();
        if (new Date(row.expires_at).getTime() > Date.now()) {
          if (row.request_hash !== requestHash) throw errors.idempotencyConflict();
          const original = await tx.query<InquiryRow>('SELECT * FROM inquiries WHERE id=$1', [row.result_ref]);
          const inquiry = original.rows[0];
          if (!inquiry) throw errors.internal();
          return { row: inquiry, replay: true };
        }
        await tx.query(
          `UPDATE idempotency_keys
              SET request_hash=$1, result_ref=NULL, expires_at=$2, created_at=now()
            WHERE scope=$3 AND key=$4`,
          [requestHash, expiresAt, scope, key],
        );
      }

      const id = randomUUID();
      const created = await tx.query<InquiryRow>(
        `INSERT INTO inquiries (id, kind, test_name, test_contact, message, is_test)
         VALUES ($1,$2,$3,$4,$5,true) RETURNING *`,
        [id, normalized.kind, normalized.testName, normalized.testContact, normalized.message || null],
      );
      const row = created.rows[0];
      if (!row) throw errors.internal();
      await tx.query('UPDATE idempotency_keys SET result_ref=$1 WHERE scope=$2 AND key=$3', [id, scope, key]);
      return { row, replay: false };
    });

    if (result.replay) reply.header('Idempotent-Replay', 'true');
    return reply.status(result.replay ? 200 : 201).send({
      data: { id: result.row.id, createdAt: new Date(result.row.created_at).toISOString() },
      requestId: request.id,
    });
  });

  app.get('/v1/admin/inquiries', async (request, reply) => {
    const auth = await requireAuth(db, request, reply, config, 'inquiry.read');
    const query = request.query as Record<string, unknown>;
    const { page, pageSize, offset } = parsePagination(query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.kind !== undefined) {
      if (query.kind !== 'consultation' && query.kind !== 'visit') throw errors.validation('Invalid inquiry kind');
      values.push(query.kind);
      conditions.push(`kind=$${values.length}`);
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
    const total = await db.query<{ total: string }>(`SELECT count(*) AS total FROM inquiries ${where}`, values);
    const rows = await db.query<InquiryRow>(
      `SELECT * FROM inquiries ${where}
       ORDER BY created_at DESC, id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    );
    await appendAudit(db, {
      actorId: auth.user.id,
      action: 'inquiry.read',
      targetType: 'inquiry-list',
      targetId: 'all',
      requestId: request.id,
      result: 'success',
    });
    return reply.send({
      data: rows.rows.map(inquiryResponse),
      meta: { page, pageSize, total: Number(total.rows[0]?.total ?? 0) },
      requestId: request.id,
    });
  });

  app.get('/v1/admin/inquiries/:id', async (request, reply) => {
    const auth = await requireAuth(db, request, reply, config, 'inquiry.read');
    const { id } = request.params as { id: string };
    const result = await db.query<InquiryRow>('SELECT * FROM inquiries WHERE id=$1', [id]);
    const row = result.rows[0];
    if (!row) throw errors.notFound();
    await appendAudit(db, {
      actorId: auth.user.id,
      action: 'inquiry.read',
      targetType: 'inquiry',
      targetId: id,
      requestId: request.id,
      result: 'success',
    });
    return reply.send({ data: inquiryResponse(row), requestId: request.id });
  });
}

function parseDate(value: unknown, name: string): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw errors.validation(`${name} must be an ISO date`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw errors.validation(`${name} must be an ISO date`);
  return date;
}
