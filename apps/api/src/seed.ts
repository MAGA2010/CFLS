import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import type { ContentType } from './constants.js';
import { createDatabase } from './db.js';
import { runMigrations } from './migrate.js';
import { hashPassword } from './security.js';

interface SeedContent {
  type: ContentType;
  category: string;
  title: string;
  summary: string;
  body: string;
}

const seedContents: SeedContent[] = [
  { type: 'school', category: 'overview', title: '合成：学校概况', summary: '用于本地联调的虚构学校介绍。', body: '这是合成数据，不代表学校正式发布内容。' },
  { type: 'academics', category: 'overview', title: '合成：课程体系总览', summary: '用于测试课程栏目。', body: '合成课程介绍正文。' },
  { type: 'outcomes', category: 'outcomes', title: '合成：升学成果', summary: '用于测试升学栏目。', body: '合成升学成果正文。' },
  { type: 'campus', category: 'facilities', title: '合成：校园设施', summary: '用于测试校园栏目。', body: '合成校园设施正文。' },
  { type: 'student_union', category: 'overview', title: '合成：学生会', summary: '用于测试学生会栏目。', body: '合成学生会正文。' },
  { type: 'news', category: 'updates', title: '合成新闻：联调通知一', summary: '第一条合成新闻。', body: '这是一条合成新闻。' },
  { type: 'news', category: 'updates', title: '合成新闻：联调通知二', summary: '第二条合成新闻。', body: '这是第二条合成新闻。' },
  { type: 'news', category: 'updates', title: '合成新闻：联调通知三', summary: '第三条合成新闻。', body: '这是第三条合成新闻。' },
  { type: 'admissions', category: 'faq', title: '合成：招生常见问题', summary: '用于测试招生栏目。', body: '合成招生问答。' },
  { type: 'contact', category: 'contact', title: '合成：联系我们', summary: '用于测试联系栏目。', body: '合成联系方式页面，不包含真实联系人。' },
];

const roles = ['editor', 'reviewer', 'admissions', 'admin'] as const;

export async function seed(db: Awaited<ReturnType<typeof createDatabase>>, nodeEnv: string): Promise<Record<string, string>> {
  if (nodeEnv === 'production') throw new Error('Production seed is forbidden');
  if (nodeEnv !== 'local' && nodeEnv !== 'staging') throw new Error('Seed is only allowed in local/staging');

  await db.exec(`
    TRUNCATE idempotency_keys, inquiries, audit_events, content_revisions, contents, sessions, user_roles, users CASCADE
  `);

  const credentials: Record<string, string> = {};
  const userIds: Record<(typeof roles)[number], string> = {
    editor: '',
    reviewer: '',
    admissions: '',
    admin: '',
  };

  for (const role of roles) {
    const id = randomUUID();
    const password = randomBytes(12).toString('base64url');
    credentials[role] = password;
    userIds[role] = id;
    await db.query(
      'INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)',
      [id, `demo-${role}`, await hashPassword(password)],
    );
    await db.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [id, role]);
  }

  for (const [index, item] of seedContents.entries()) {
    const id = randomUUID();
    const publishedAt = new Date(Date.now() - index * 60_000);
    await db.query(
      `INSERT INTO contents
       (id, type, category, title, summary, body, status, version, author_id, reviewer_id, published_at, is_demo)
       VALUES ($1,$2,$3,$4,$5,$6,'published',2,$7,$8,$9,true)`,
      [id, item.type, item.category, item.title, item.summary, item.body, userIds.editor, userIds.reviewer, publishedAt],
    );
    await db.query(
      `INSERT INTO content_revisions (id, content_id, version, snapshot, actor_id)
       VALUES ($1, $2, 2, $3::jsonb, $4)`,
      [randomUUID(), id, JSON.stringify({ ...item, status: 'published', version: 2 }), userIds.reviewer],
    );
  }

  for (let index = 0; index < 2; index += 1) {
    await db.query(
      `INSERT INTO inquiries (id, kind, test_name, test_contact, message, is_test)
       VALUES ($1, 'consultation', $2, $3, $4, true)`,
      [
        randomUUID(),
        `合成测试${index + 1}`,
        `test${index + 1}@example.invalid`,
        '仅用于本地/测试环境联调的虚构咨询。',
      ],
    );
  }
  return credentials;
}

async function main(): Promise<void> {
  const requested = process.argv[2];
  const config = loadConfig();
  if (!requested || requested !== config.nodeEnv) {
    throw new Error(`Seed environment mismatch: command=${requested ?? 'missing'} config=${config.nodeEnv}`);
  }
  const db = await createDatabase(config.databaseUrl);
  try {
    await runMigrations(db);
    const credentials = await seed(db, config.nodeEnv);
    process.stdout.write(`${JSON.stringify({ environment: config.nodeEnv, credentials }, null, 2)}\n`);
  } finally {
    await db.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Seed failed'}\n`);
    process.exitCode = 1;
  });
}
