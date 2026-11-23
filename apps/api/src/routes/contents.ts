import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';
import { TRANSITIONS, type AccessKey, type Role } from '../constants.js';
import type { Database } from '../db.js';
import { errors } from '../errors.js';
import { adminContent, toIso, type ContentRow } from '../presenters.js';
import { appendAudit, requireAuth } from '../security.js';
import type { AuthContext } from '../types.js';
import {
  contentCreateSchema,
  contentPatchSchema,
  parsePagination,
  parseStatus,
  parseType,
  rejectSchema,
  validPair,
  versionSchema,
} from '../validation.js';

interface RevisionRow extends Record<string, unknown> {
  id: string;
  version: number;
  snapshot: Record<string, unknown>;
  actor_id: string;
  created_at: string | Date;
}

interface ActionShape {
  version: number;
  reason?: string;
}

const ACTION_ACCESS: Record<keyof typeof TRANSITIONS, AccessKey> = {
  submit: 'content.submit',
  approve: 'content.review',
  reject: 'content.review',
  publish: 'content.review',
  unpublish: 'content.review',
};

function hasRole(auth: AuthContext, roles: readonly Role[]): boolean {
  return auth.user.roles.some((role) => roles.includes(role));
}

function assertCanRead(auth: AuthContext, row: ContentRow): void {
  if (auth.user.roles.includes('admin') || auth.user.roles.includes('reviewer')) return;
  if (!auth.user.roles.includes('editor') || row.author_id !== auth.user.id) throw errors.forbidden();
}

async function findContent(db: Database, id: string): Promise<ContentRow | undefined> {
  const result = await db.query<ContentRow>('SELECT * FROM contents WHERE id = $1', [id]);
  return result.rows[0];
}

function snapshot(row: ContentRow, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    title: row.title,
    summary: row.summary,
    body: row.body,
    status: row.status,
    version: row.version,
    authorId: row.author_id,
    reviewerId: row.reviewer_id,
    publishedAt: toIso(row.published_at),
    isDemo: row.is_demo,
    ...extra,
  };
}

export async function contentRoutes(app: FastifyInstance, db: Database, config: AppConfig): Promise<void> {
  app.get('/v1/admin/contents', async (request, reply) => {
    const auth = await requireAuth(db, request, reply, config, 'content.list');
    const query = request.query as Record<string, unknown>;
    const { page, pageSize, offset } = parsePagination(query);
    const type = parseType(query.type);
    const status = parseStatus(query.status);
    const category = typeof query.category === 'string' ? query.category : undefined;
    if (query.category !== undefined && !category) throw errors.validation('Invalid category');
    if (category && !type) throw errors.validation('type is required when category is provided');
    if (type && category && !validPair(type, category)) throw errors.validation('Invalid type/category pair');

    const conditions: string[] = [];
    const values: unknown[] = [];
    if (type) {
      values.push(type);
      conditions.push(`type = $${values.length}`);
    }
    if (category) {
      values.push(category);
      conditions.push(`category = $${values.length}`);
    }
    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }
    if (auth.user.roles.includes('editor') && !auth.user.roles.includes('admin') && !auth.user.roles.includes('reviewer')) {
      values.push(auth.user.id);
      conditions.push(`author_id = $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await db.query<{ total: string }>(`SELECT count(*) AS total FROM contents ${where}`, values);
    const rows = await db.query<ContentRow>(
      `SELECT * FROM contents ${where}
       ORDER BY updated_at DESC, id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    );
    return reply.send({
      data: rows.rows.map(adminContent),
      meta: { page, pageSize, total: Number(total.rows[0]?.total ?? 0) },
      requestId: request.id,
    });
  });

  app.post('/v1/admin/contents', async (request, reply) => {
    const auth = await requireAuth(db, request, reply, config, 'content.create', { write: true });
    const body = contentCreateSchema.parse(request.body);
    const id = randomUUID();
    const row = await db.transaction(async (tx) => {
      const inserted = await tx.query<ContentRow>(
        `INSERT INTO contents
         (id, type, category, title, summary, body, status, version, author_id, is_demo)
         VALUES ($1,$2,$3,$4,$5,$6,'draft',1,$7,$8)
         RETURNING *`,
        [id, body.type, body.category, body.title, body.summary ?? null, body.body, auth.user.id, body.isDemo],
      );
      const created = inserted.rows[0];
      if (!created) throw errors.internal();
      await tx.query(
        `INSERT INTO content_revisions (id, content_id, version, snapshot, actor_id)
         VALUES ($1,$2,$3,$4::jsonb,$5)`,
        [randomUUID(), id, 1, JSON.stringify(snapshot(created)), auth.user.id],
      );
      await appendAudit(tx, {
        actorId: auth.user.id,
        action: 'content.create',
        targetType: 'content',
        targetId: id,
        requestId: request.id,
        result: 'success',
      });
      return created;
    });
    return reply.status(201).send({ data: adminContent(row), requestId: request.id });
  });

  app.get('/v1/admin/contents/:id', async (request, reply) => {
    const auth = await requireAuth(db, request, reply, config, 'content.read');
    const { id } = request.params as { id: string };
    const row = await findContent(db, id);
    if (!row) throw errors.notFound();
    assertCanRead(auth, row);
    return reply.send({ data: adminContent(row), requestId: request.id });
  });

  app.patch('/v1/admin/contents/:id', async (request, reply) => {
    const auth = await requireAuth(db, request, reply, config, 'content.update', { write: true });
    const { id } = request.params as { id: string };
    const body = contentPatchSchema.parse(request.body);
    const current = await findContent(db, id);
    if (!current) throw errors.notFound();
    if (!auth.user.roles.includes('admin') && current.author_id !== auth.user.id) throw errors.forbidden();
    if (current.status !== 'draft') throw errors.invalidTransition();
    if (body.version !== current.version) throw errors.versionConflict(current.version);

    const nextType = body.type ?? current.type;
    const nextCategory = body.category ?? current.category;
    if (!validPair(nextType, nextCategory)) throw errors.validation('Invalid type/category pair');

    const row = await db.transaction(async (tx) => {
      const updated = await tx.query<ContentRow>(
        `UPDATE contents
            SET type=$1, category=$2, title=$3, summary=$4, body=$5, is_demo=$6,
                version=version+1, updated_at=now()
          WHERE id=$7 AND version=$8 AND status='draft'
          RETURNING *`,
        [
          nextType,
          nextCategory,
          body.title ?? current.title,
          body.summary === undefined ? current.summary : body.summary,
          body.body ?? current.body,
          body.isDemo ?? current.is_demo,
          id,
          body.version,
        ],
      );
      const changed = updated.rows[0];
      if (!changed) throw errors.versionConflict(current.version);
      await tx.query(
        `INSERT INTO content_revisions (id, content_id, version, snapshot, actor_id)
         VALUES ($1,$2,$3,$4::jsonb,$5)`,
        [randomUUID(), id, changed.version, JSON.stringify(snapshot(changed)), auth.user.id],
      );
      await appendAudit(tx, {
        actorId: auth.user.id,
        action: 'content.update',
        targetType: 'content',
        targetId: id,
        requestId: request.id,
        result: 'success',
      });
      return changed;
    });
    return reply.send({ data: adminContent(row), requestId: request.id });
  });

  app.get('/v1/admin/contents/:id/revisions', async (request, reply) => {
    const auth = await requireAuth(db, request, reply, config, 'content.revisions');
    const { id } = request.params as { id: string };
    const content = await findContent(db, id);
    if (!content) throw errors.notFound();
    assertCanRead(auth, content);
    const { page, pageSize, offset } = parsePagination(request.query as Record<string, unknown>);
    const total = await db.query<{ total: string }>(
      'SELECT count(*) AS total FROM content_revisions WHERE content_id = $1',
      [id],
    );
    const rows = await db.query<RevisionRow>(
      `SELECT id, version, snapshot, actor_id, created_at
         FROM content_revisions WHERE content_id = $1
        ORDER BY version DESC LIMIT $2 OFFSET $3`,
      [id, pageSize, offset],
    );
    return reply.send({
      data: rows.rows.map((row) => ({
        id: row.id,
        version: row.version,
        snapshot: row.snapshot,
        actorId: row.actor_id,
        createdAt: toIso(row.created_at),
      })),
      meta: { page, pageSize, total: Number(total.rows[0]?.total ?? 0) },
      requestId: request.id,
    });
  });

  const registerAction = (
    action: keyof typeof TRANSITIONS,
    handler: (request: FastifyRequest, reply: FastifyReply, auth: AuthContext, id: string, body: ActionShape) => Promise<void>,
  ) => {
    app.post(`/v1/admin/contents/:id/${action}`, async (request, reply) => {
      const accessKey = ACTION_ACCESS[action];
      if (!accessKey) throw errors.internal();
      const auth = await requireAuth(db, request, reply, config, accessKey, { write: true });
      const { id } = request.params as { id: string };
      const body = action === 'reject' ? rejectSchema.parse(request.body) : versionSchema.parse(request.body);
      await handler(request, reply, auth, id, body);
    });
  };

  for (const action of Object.keys(TRANSITIONS) as Array<keyof typeof TRANSITIONS>) {
    registerAction(action, async (request, reply, auth, id, body) => {
      const current = await findContent(db, id);
      if (!current) throw errors.notFound();
      if (body.version !== current.version) throw errors.versionConflict(current.version);

      if (action === 'submit') {
        if (!hasRole(auth, ['editor', 'admin'])) throw errors.forbidden();
        if (!auth.user.roles.includes('admin') && current.author_id !== auth.user.id) throw errors.forbidden();
      } else {
        if (!hasRole(auth, ['reviewer', 'admin'])) throw errors.forbidden();
        if (current.author_id === auth.user.id) throw errors.selfReview();
      }

      const transition = TRANSITIONS[action];
      if (!transition) throw errors.internal();
      if (current.status !== transition.from) throw errors.invalidTransition();
      if (action === 'submit' && current.body.trim().length === 0) {
        throw errors.validation('Body is required before submission');
      }

      const row = await db.transaction(async (tx) => {
        const reviewerId = action === 'approve' ? auth.user.id : current.reviewer_id;
        const publishedAt =
          action === 'publish' ? new Date() : action === 'unpublish' ? null : current.published_at;
        const updated = await tx.query<ContentRow>(
          `UPDATE contents
              SET status=$1, version=version+1, reviewer_id=$2, published_at=$3, updated_at=now()
            WHERE id=$4 AND version=$5 AND status=$6
            RETURNING *`,
          [transition.to, reviewerId, publishedAt, id, body.version, transition.from],
        );
        const changed = updated.rows[0];
        if (!changed) {
          const latest = await tx.query<ContentRow>('SELECT * FROM contents WHERE id = $1', [id]);
          const latestRow = latest.rows[0];
          if (!latestRow) throw errors.notFound();
          if (latestRow.version !== body.version) throw errors.versionConflict(latestRow.version);
          throw errors.invalidTransition();
        }
        const extra = action === 'reject' ? { rejectionReason: body.reason } : {};
        await tx.query(
          `INSERT INTO content_revisions (id, content_id, version, snapshot, actor_id)
           VALUES ($1,$2,$3,$4::jsonb,$5)`,
          [randomUUID(), id, changed.version, JSON.stringify(snapshot(changed, extra)), auth.user.id],
        );
        await appendAudit(tx, {
          actorId: auth.user.id,
          action: transition.audit,
          targetType: 'content',
          targetId: id,
          requestId: request.id,
          result: 'success',
        });
        return changed;
      });
      await reply.send({ data: adminContent(row), requestId: request.id });
    });
  }
}
