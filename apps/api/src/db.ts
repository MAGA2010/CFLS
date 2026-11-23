import pg from 'pg';
import type { Queryable, QueryResult } from './types.js';

const { Pool } = pg;

interface PgliteLike {
  query<T extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  close(): Promise<void>;
}

type Backend =
  | { kind: 'pglite'; client: PgliteLike }
  | { kind: 'pg'; pool: pg.Pool };

class TransactionClient implements Queryable {
  constructor(private readonly client: pg.PoolClient | PgliteLike) {}

  async query<T extends Record<string, unknown>>(text: string, values: readonly unknown[] = []): Promise<QueryResult<T>> {
    if ('exec' in this.client) {
      const result = await this.client.query<T>(text, values);
      return { rows: result.rows, rowCount: result.rows.length };
    }
    const result = await this.client.query(text, values as unknown[]);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
  }

  async exec(sql: string): Promise<void> {
    if ('exec' in this.client) {
      await this.client.exec(sql);
      return;
    }
    await this.client.query(sql);
  }
}

export class Database implements Queryable {
  constructor(private readonly backend: Backend) {}

  async query<T extends Record<string, unknown>>(text: string, values: readonly unknown[] = []): Promise<QueryResult<T>> {
    if (this.backend.kind === 'pglite') {
      const result = await this.backend.client.query<T>(text, values);
      return { rows: result.rows, rowCount: result.rows.length };
    }
    const result = await this.backend.pool.query(text, values as unknown[]);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
  }

  async exec(sql: string): Promise<void> {
    if (this.backend.kind === 'pglite') {
      await this.backend.client.exec(sql);
      return;
    }
    await this.backend.pool.query(sql);
  }

  async transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    if (this.backend.kind === 'pglite') {
      await this.backend.client.exec('BEGIN');
      try {
        const result = await work(new TransactionClient(this.backend.client));
        await this.backend.client.exec('COMMIT');
        return result;
      } catch (error) {
        await this.backend.client.exec('ROLLBACK');
        throw error;
      }
    }

    const client = await this.backend.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(new TransactionClient(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.backend.kind === 'pglite') {
      await this.backend.client.close();
      return;
    }
    await this.backend.pool.end();
  }
}

export async function createDatabase(databaseUrl: string): Promise<Database> {
  if (databaseUrl.startsWith('memory://')) {
    const moduleName = '@electric-sql/pglite';
    const module = (await import(moduleName)) as {
      PGlite: new () => PgliteLike;
    };
    return new Database({ kind: 'pglite', client: new module.PGlite() });
  }
  return new Database({
    kind: 'pg',
    pool: new Pool({ connectionString: databaseUrl, max: 10 }),
  });
}
