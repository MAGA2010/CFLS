import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { createTestContext, testConfig, writeHeaders } from './helpers.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION_FAILED: ${message}`);
}

const checks: string[] = [];
function pass(name: string): void {
  checks.push(name);
}

async function main(): Promise<void> {
  const context = await createTestContext();
  try {
    const live = await context.app.inject({ method: 'GET', url: '/health/live' });
    const ready = await context.app.inject({ method: 'GET', url: '/health/ready' });
    assert(live.statusCode === 200 && ready.statusCode === 200, 'health probes');
    pass('health probes');

    const empty = await context.app.inject({ method: 'GET', url: '/v1/public/contents' });
    assert(empty.statusCode === 200 && empty.json().data.length === 0, 'empty public list');
    pass('empty public list');

    const editor = await context.login('test-editor');
    const reviewer = await context.login('test-reviewer');
    const admin = await context.login('test-admin');
    const admissions = await context.login('test-admissions');
    pass('four role logins');

    assert((await context.app.inject({ method: 'GET', url: '/v1/admin/contents' })).statusCode === 401, 'anonymous denied');
    assert(
      (
        await context.app.inject({
          method: 'GET',
          url: '/v1/admin/inquiries',
          headers: { cookie: editor.cookie },
        })
      ).statusCode === 403,
      'editor cannot read inquiries',
    );
    assert(
      (
        await context.app.inject({
          method: 'GET',
          url: '/v1/admin/contents',
          headers: { cookie: admissions.cookie },
        })
      ).statusCode === 403,
      'admissions cannot read admin content',
    );
    pass('RBAC matrix samples');

    const noCsrf = await context.app.inject({
      method: 'POST',
      url: '/v1/admin/contents',
      headers: { cookie: editor.cookie },
      payload: { type: 'news', category: 'updates', title: 'No CSRF', isDemo: true },
    });
    assert(noCsrf.statusCode === 403 && noCsrf.json().error.code === 'CSRF_INVALID', 'CSRF enforced');
    pass('CSRF enforced');

    const created = await context.app.inject({
      method: 'POST',
      url: '/v1/admin/contents',
      headers: writeHeaders(editor),
      payload: {
        type: 'news',
        category: 'updates',
        title: 'Synthetic smoke article',
        summary: 'Synthetic only',
        body: 'Synthetic body',
        isDemo: true,
      },
    });
    assert(created.statusCode === 201, 'create draft');
    const draft = created.json().data as { id: string; version: number };
    assert((await context.app.inject({ method: 'GET', url: `/v1/public/contents/${draft.id}` })).statusCode === 404, 'draft hidden');

    const patched = await context.app.inject({
      method: 'PATCH',
      url: `/v1/admin/contents/${draft.id}`,
      headers: writeHeaders(editor),
      payload: { version: draft.version, title: 'Synthetic smoke article v2' },
    });
    assert(patched.statusCode === 200 && patched.json().data.version === 2, 'patch with optimistic version');

    const stale = await context.app.inject({
      method: 'PATCH',
      url: `/v1/admin/contents/${draft.id}`,
      headers: writeHeaders(editor),
      payload: { version: 1, title: 'Stale write' },
    });
    assert(stale.statusCode === 409 && stale.json().error.code === 'VERSION_CONFLICT', 'stale write rejected');

    const submitted = await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${draft.id}/submit`,
      headers: writeHeaders(editor),
      payload: { version: 2 },
    });
    assert(submitted.statusCode === 200 && submitted.json().data.status === 'pending_review', 'submit');

    const approved = await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${draft.id}/approve`,
      headers: writeHeaders(reviewer),
      payload: { version: 3 },
    });
    assert(approved.statusCode === 200 && approved.json().data.status === 'approved', 'approve');

    const published = await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${draft.id}/publish`,
      headers: writeHeaders(reviewer),
      payload: { version: 4 },
    });
    assert(published.statusCode === 200 && published.json().data.status === 'published', 'publish');
    const publicDetail = await context.app.inject({ method: 'GET', url: `/v1/public/contents/${draft.id}` });
    assert(publicDetail.statusCode === 200, 'published content visible');
    assert(!JSON.stringify(publicDetail.json()).includes('authorId'), 'public field whitelist');
    pass('content lifecycle and draft isolation');

    const unpublished = await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${draft.id}/unpublish`,
      headers: writeHeaders(reviewer),
      payload: { version: 5 },
    });
    assert(unpublished.statusCode === 200 && unpublished.json().data.status === 'draft', 'unpublish');
    assert((await context.app.inject({ method: 'GET', url: `/v1/public/contents/${draft.id}` })).statusCode === 404, 'unpublished hidden');
    pass('unpublish');

    const rejectedSource = await context.app.inject({
      method: 'POST',
      url: '/v1/admin/contents',
      headers: writeHeaders(editor),
      payload: { type: 'news', category: 'updates', title: 'Synthetic reject flow', body: 'Body', isDemo: true },
    });
    const rejectedDraft = rejectedSource.json().data as { id: string };
    await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${rejectedDraft.id}/submit`,
      headers: writeHeaders(editor),
      payload: { version: 1 },
    });
    const missingReason = await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${rejectedDraft.id}/reject`,
      headers: writeHeaders(reviewer),
      payload: { version: 2 },
    });
    assert(missingReason.statusCode === 400, 'reject reason required');
    const rejected = await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${rejectedDraft.id}/reject`,
      headers: writeHeaders(reviewer),
      payload: { version: 2, reason: 'Synthetic rejection reason' },
    });
    assert(rejected.statusCode === 200 && rejected.json().data.status === 'draft', 'reject transition');
    const invalidTransition = await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${rejectedDraft.id}/publish`,
      headers: writeHeaders(reviewer),
      payload: { version: 3 },
    });
    assert(invalidTransition.statusCode === 409 && invalidTransition.json().error.code === 'INVALID_TRANSITION', 'invalid transition rejected');
    pass('reject and invalid transition');

    const own = await context.app.inject({
      method: 'POST',
      url: '/v1/admin/contents',
      headers: writeHeaders(admin),
      payload: { type: 'news', category: 'updates', title: 'Admin own content', isDemo: true },
    });
    const ownDraft = own.json().data as { id: string };
    await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${ownDraft.id}/submit`,
      headers: writeHeaders(admin),
      payload: { version: 1 },
    });
    const selfReview = await context.app.inject({
      method: 'POST',
      url: `/v1/admin/contents/${ownDraft.id}/approve`,
      headers: writeHeaders(admin),
      payload: { version: 2 },
    });
    assert(selfReview.statusCode === 403 && selfReview.json().error.code === 'SELF_REVIEW_FORBIDDEN', 'self review denied');
    pass('self-review denied');

    const key = randomUUID();
    const inquiryPayload = {
      kind: 'consultation',
      testName: 'Synthetic Student',
      testContact: 'student@example.invalid',
      message: 'Synthetic inquiry only',
      isTest: true,
    };
    const inquiry = await context.app.inject({
      method: 'POST',
      url: '/v1/public/test-inquiries',
      headers: { 'idempotency-key': key },
      payload: inquiryPayload,
    });
    assert(inquiry.statusCode === 201, 'create inquiry');
    const replay = await context.app.inject({
      method: 'POST',
      url: '/v1/public/test-inquiries',
      headers: { 'idempotency-key': key },
      payload: inquiryPayload,
    });
    assert(replay.statusCode === 200 && replay.headers['idempotent-replay'] === 'true', 'inquiry replay');
    const conflict = await context.app.inject({
      method: 'POST',
      url: '/v1/public/test-inquiries',
      headers: { 'idempotency-key': key },
      payload: { ...inquiryPayload, message: 'Changed synthetic inquiry' },
    });
    assert(conflict.statusCode === 409 && conflict.json().error.code === 'IDEMPOTENCY_CONFLICT', 'inquiry conflict');
    const inquiryRead = await context.app.inject({
      method: 'GET',
      url: '/v1/admin/inquiries',
      headers: { cookie: admissions.cookie },
    });
    assert(inquiryRead.statusCode === 200 && inquiryRead.json().data.length === 1, 'admissions inquiry read');
    pass('inquiry idempotency and permissions');

    const audit = await context.app.inject({
      method: 'GET',
      url: '/v1/admin/audit-events',
      headers: { cookie: admin.cookie },
    });
    assert(audit.statusCode === 200, 'admin audit read');
    assert(audit.json().data.some((event: { action: string }) => event.action === 'content.create'), 'audit action recorded');
    pass('audit visibility and recording');

    const productionApp = await buildApp({ config: testConfig({ nodeEnv: 'production' }), db: context.db });
    const closed = await productionApp.inject({
      method: 'POST',
      url: '/v1/public/test-inquiries',
      headers: { 'idempotency-key': randomUUID() },
      payload: inquiryPayload,
    });
    assert(closed.statusCode === 404, 'production inquiry hard close');
    await productionApp.close();
    pass('production inquiry hard close');

    process.stdout.write(`${JSON.stringify({ passed: checks.length, checks }, null, 2)}\n`);
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
