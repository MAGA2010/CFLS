import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { runMigrations } from './migrate.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = await createDatabase(config.databaseUrl);
  await runMigrations(db);
  const app = await buildApp({ config, db });
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await db.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  await app.listen({ host: '0.0.0.0', port: config.port });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Server failed to start'}\n`);
  process.exitCode = 1;
});
