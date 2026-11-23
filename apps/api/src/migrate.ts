import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createDatabase } from './db.js';

async function resolveMigrationsDir(): Promise<string> {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), 'migrations'),
    join(moduleDir, '..', 'migrations'),
    join(moduleDir, '..', '..', 'migrations'),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Keep looking for source or compiled layout.
    }
  }
  throw new Error('Migrations directory not found');
}

export async function runMigrations(db: Awaited<ReturnType<typeof createDatabase>>): Promise<string[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const migrationsDir = await resolveMigrationsDir();
  const files = (await readdir(migrationsDir)).filter((file) => /^V?\d+.*\.sql$/.test(file)).toSorted();
  const applied: string[] = [];
  for (const file of files) {
    const exists = await db.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
    if (exists.rowCount > 0) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const db = await createDatabase(config.databaseUrl);
  try {
    const applied = await runMigrations(db);
    process.stdout.write(`${JSON.stringify({ migrated: applied, environment: config.nodeEnv })}\n`);
  } finally {
    await db.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Migration failed'}\n`);
    process.exitCode = 1;
  });
}
