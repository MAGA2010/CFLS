import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createTestContext, testConfig, writeHeaders, type TestContext } from './helpers.js';

let context: TestContext;

beforeEach(async () => {
  context = await createTestContext();
});

afterEach(async () => {
  await context.close();
});

describe('health and public content', () => {
  it('serves liveness, readiness and an empty public list', async () => {
    expect((await context.app.inject({ method: 'GET', url: '/health/live' })).statusCode).toBe(200);
    expect((await context.app.inject({ method: 'GET', url: '/health/ready' })).statusCode).toBe(200);
    const list = await context.app.inject({ method: 'GET', url: '/v1/public/contents' });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
  });

  it('rejects invalid pagination and unknown fields', async () => {
    const badPage = await context.app.inject({ method: 'GET', url: '/v1/public/contents?page=0' });
    expect(badPage.statusCode).toBe(400);
    expect(badPage.json().error.code).toBe('VALIDATION_FAILED');
    const editor = await context.login('test-editor');
    const badField = await context.app.inject({
      method: 'POST',
      url: '/v1/admin/contents',
      headers: writeHeaders(editor),
      payload: {
        type: 'news',
        category: 'updates',
        title: 'Test',
        isDemo: true,
        status: 'published',
      },
    });
    expect(badField.statusCode).toBe(400);
  });
});

describe('authentication, RBAC and CSRF', () => {
  it('logs in, returns safe identity fields and revokes a session', async () => {
    const session = await context.login('test-editor');
    const me = await context.app.inject({
      method: 'GET',
      url: '/v1/admin/me',
      headers: { cookie: session.cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data).toMatchObject({ username: 'test-editor', roles: ['editor'], environment: 'local' });
    expect(JSON.stringify(me.json())).not.toContain('password');

    const logout = await context.app.inject({
      method: 'DELETE',
      url: '/v1/admin/sessions/current',
      headers: writeHeaders(session),
    });
    expect(logout.statusCode).toBe(204);
    const after = await context.app.inject({
      method: 'GET',
      url: '/v1/admin/me',
      headers: { cookie: session.cookie },
    });
    expect(after.statusCode).toBe(401);
  });

  it('rejects missing sessions, wrong roles and missing CSRF', async () => {
    expect((await context.app.inject({ method: 'GET', url: '/v1/admin/contents' })).statusCode).toBe(401);

    const editor = await context.login('test-editor');
    expect(
      (
        await context.app.inject({
          method: 'GET',
          url: '/v1/admin/audit-events',
          headers: { cookie: editor.cookie },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await context.app.inject({
          method: 'POST',
          url: '/v1/admin/contents',
          headers: { cookie: editor.cookie },
          payload: { type: 'news', category: 'updates', title: 'No CSRF', isDemo: true },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('rate limits repeated bad logins', async () => {
    for (let index = 0; index < 5; index += 1) {
      const response = await context.app.inject({
        method: 'POST',
        url: '/v1/admin/sessions',
        payload: { username: 'test-editor', password: 'wrong-password' },
      });
      expect(response.statusCode).toBe(401);
    }
    const limited = await context.app.inject({
      method: 'POST',
      url: '/v1/admin/sessions',
      payload: { username: 'test-editor', password: 'wrong-password' },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('RATE_LIMITED');
  });
});

async function createDraft(session: { cookie: string; csrfToken: string }) {
  const response = await context.app.inject({
    method: 'POST',
    url: '/v1/admin/contents',
    headers: writeHeaders(session),
    payload: {
      type: 'news',
      category: 'updates',
      title: 'Synthetic test article',
      summary: 'Synthetic summary',
      body: 'Synthetic body',
      isDemo: true,
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().data as { id: string; version: number; status: string };
}

describe('content workflow', () => {
  it('runs draft -> pending_review -> approved -> published and hides drafts publicly', async () => {
    const editor = await context.login('test-editor');
    const reviewer = await context.login('test-reviewer');
    const draft = await createDraft(editor);

    expect(
      (
        await context.app.inject({
          method: 'GET',
          url: `/v1/admin/contents/${draft.id}`,
          headers: { cookie: reviewer.cookie },
        })
      ).statusCode,
    ).toBe(200);
    expect((await context.app.inject({ method: 'GET', url: `/v1/public/contents/${draft.id}` })).statusCode).toBe(404);

    const patched = await context.app.inject({
      method: 'PATCH',
      url: `/v1/admin/contents/${draft.id}`,
      headers: writeHeaders(editor),
      payload: { version: draft.version, title: 'Synthetic test article v2' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().data.version).toBe(2);

    const submitted = await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${draft.id}/submit`,
      headers: writeHeaders(editor),
      payload: { version: 2 },
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().data.status).toBe('pending_review');

    const approved = await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${draft.id}/approve`,
      headers: writeHeaders(reviewer),
      payload: { version: 3 },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().data.status).toBe('approved');

    const published = await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${draft.id}/publish`,
      headers: writeHeaders(reviewer),
      payload: { version: 4 },
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().data.status).toBe('published');

    const publicDetail = await context.app.inject({ method: 'GET', url: `/v1/public/contents/${draft.id}` });
    expect(publicDetail.statusCode).toBe(200);
    const publicBody = JSON.stringify(publicDetail.json());
    expect(publicBody).not.toContain('authorId');
    expect(publicBody).not.toContain('status');

    const revisions = await context.app.inject({
      method: 'GET',
      url: `/v1/admin/contents/${draft.id}/revisions`,
      headers: { cookie: reviewer.cookie },
    });
    expect(revisions.json().meta.total).toBe(5);
  });

  it('rejects self-review, version conflicts and invalid transitions', async () => {
    const admin = await context.login('test-admin');
    const own = await createDraft(admin);
    await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${own.id}/submit`,
      headers: writeHeaders(admin),
      payload: { version: 1 },
    });
    const selfReview = await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${own.id}/approve`,
      headers: writeHeaders(admin),
      payload: { version: 2 },
    });
    expect(selfReview.statusCode).toBe(403);
    expect(selfReview.json().error.code).toBe('SELF_REVIEW_FORBIDDEN');

    const editor = await context.login('test-editor');
    const draft = await createDraft(editor);
    const first = await context.app.inject({
      method: 'PATCH',
      url: `/v1/admin/contents/${draft.id}`,
      headers: writeHeaders(editor),
      payload: { version: 1, title: 'First update' },
    });
    expect(first.statusCode).toBe(200);
    const stale = await context.app.inject({
      method: 'PATCH',
      url: `/v1/admin/contents/${draft.id}`,
      headers: writeHeaders(editor),
      payload: { version: 1, title: 'Stale update' },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toMatchObject({ code: 'VERSION_CONFLICT', details: { currentVersion: 2 } });

    const invalid = await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${draft.id}/publish`,
      headers: writeHeaders(editor),
      payload: { version: 2 },
    });
    expect(invalid.statusCode).toBe(403);
  });
});

describe('inquiries and audit', () => {
  const inquiry = {
    kind: 'consultation',
    testName: 'Synthetic Student',
    testContact: 'student@example.invalid',
    message: 'Synthetic inquiry only',
    isTest: true,
  };

  it('supports idempotent replay and conflict detection', async () => {
    const key = randomUUID();
    const first = await context.app.inject({
      method: 'POST',
      url: '/v1/public/test-inquiries',
      headers: { 'idempotency-key': key },
      payload: inquiry,
    });
    expect(first.statusCode).toBe(201);
    const second = await context.app.inject({
      method: 'POST',
      url: '/v1/public/test-inquiries',
      headers: { 'idempotency-key': key },
      payload: inquiry,
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect(second.json().data.id).toBe(first.json().data.id);
    const conflict = await context.app.inject({
      method: 'POST',
      url: '/v1/public/test-inquiries',
      headers: { 'idempotency-key': key },
      payload: { ...inquiry, message: 'Different synthetic inquiry' },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
    const count = await context.db.query<{ total: string }>('SELECT count(*) AS total FROM inquiries');
    expect(Number(count.rows[0]?.total)).toBe(1);
  });

  it('validates test-only data, restricts reads and hard-closes production', async () => {
    const invalid = await context.app.inject({
      method: 'POST',
      url: '/v1/public/test-inquiries',
      headers: { 'idempotency-key': randomUUID() },
      payload: { ...inquiry, isTest: false },
    });
    expect(invalid.statusCode).toBe(400);

    const editor = await context.login('test-editor');
    const admissions = await context.login('test-admissions');
    expect((await context.app.inject({ method: 'GET', url: '/v1/admin/inquiries', headers: { cookie: editor.cookie } })).statusCode).toBe(403);
    expect((await context.app.inject({ method: 'GET', url: '/v1/admin/inquiries', headers: { cookie: admissions.cookie } })).statusCode).toBe(200);

    const productionApp = await buildApp({ config: testConfig({ nodeEnv: 'production' }), db: context.db });
    const closed = await productionApp.inject({
      method: 'POST',
      url: '/v1/public/test-inquiries',
      headers: { 'idempotency-key': randomUUID() },
      payload: inquiry,
    });
    expect(closed.statusCode).toBe(404);
    await productionApp.close();
  });

  it('allows only admin to read audit events and records content actions', async () => {
    const editor = await context.login('test-editor');
    const admin = await context.login('test-admin');
    await context.app.inject({
      method: 'POST',
      url: '/v1/admin/contents',
      headers: writeHeaders(editor),
      payload: { type: 'news', category: 'updates', title: 'Audit test', isDemo: true },
    });
    expect((await context.app.inject({ method: 'GET', url: '/v1/admin/audit-events', headers: { cookie: editor.cookie } })).statusCode).toBe(403);
    const response = await context.app.inject({ method: 'GET', url: '/v1/admin/audit-events', headers: { cookie: admin.cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.some((event: { action: string }) => event.action === 'content.create')).toBe(true);
  });
});
