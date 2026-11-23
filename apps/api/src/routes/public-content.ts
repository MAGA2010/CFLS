import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import type { Database } from '../db.js';
import { errors } from '../errors.js';
import { publicContent, type ContentRow } from '../presenters.js';
import { parsePagination, parseType } from '../validation.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function publicContentRoutes(
  app: FastifyInstance,
  db: Database,
  _config: AppConfig,
): Promise<void> {
  app.get('/v1/public/contents', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const { page, pageSize, offset } = parsePagination(query);
    const type = parseType(query.type);
    const category = typeof query.category === 'string' ? query.category : undefined;
    if (query.category !== undefined && !category) throw errors.validation('Invalid category');
    if (category && !type) throw errors.validation('type is required when category is provided');

    const conditions = ["status = 'published'"];
    const values: unknown[] = [];
    if (type) {
      values.push(type);
      conditions.push(`type = $${values.length}`);
    }
    if (category) {
      values.push(category);
      conditions.push(`category = $${values.length}`);
    }
    const where = conditions.join(' AND ');
    const count = await db.query<{ total: string }>(`SELECT count(*) AS total FROM contents WHERE ${where}`, values);
    const rows = await db.query<ContentRow>(
      `SELECT * FROM contents WHERE ${where}
       ORDER BY published_at DESC, id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    );
    return reply.send({
      data: rows.rows.map(publicContent),
      meta: { page, pageSize, total: Number(count.rows[0]?.total ?? 0) },
      requestId: request.id,
    });
  });

  app.get('/v1/public/contents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_V4.test(id)) throw errors.notFound();
    const result = await db.query<ContentRow>(
      "SELECT * FROM contents WHERE id = $1 AND status = 'published'",
      [id],
    );
    const row = result.rows[0];
    if (!row) throw errors.notFound();
    return reply.send({ data: publicContent(row), requestId: request.id });
  });
}
