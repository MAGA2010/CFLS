import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createClient, type Transport } from '../src/api/client'
import { apiPaths } from '../src/api/generated'
import { createPublicApi } from '../src/api/public'
import { useIdempotentSubmit } from '../src/composables/useIdempotentSubmit'
import { toInquiryRequest } from '../src/lib/inquiry'

const origin = process.env.CFLS_B_API_URL
const seedFile = process.env.CFLS_B_SEED_FILE
if (!origin || !seedFile) throw new Error('Set CFLS_B_API_URL and CFLS_B_SEED_FILE for a synthetic test environment.')
const seedOutput = readFileSync(seedFile, 'utf8')
const { credentials } = JSON.parse(seedOutput.slice(seedOutput.indexOf('{'))) as {
  credentials: Record<'editor' | 'reviewer' | 'admissions', string>
}

const http: Transport = async ({ url, method, headers, body, signal }) => {
  const controller = new AbortController()
  signal.onAbort(() => controller.abort())
  const result = await fetch(url, { method, headers, body: body && JSON.stringify(body), signal: controller.signal })
  const responseHeaders: Record<string, string> = {}
  result.headers.forEach((value, name) => { responseHeaders[name] = value })
  return {
    status: result.status,
    headers: responseHeaders,
    data: await result.json(),
  }
}
const api = createPublicApi(createClient({ baseUrl: origin, transport: http }), true)

async function login(role: keyof typeof credentials) {
  const response = await fetch(origin + '/v1/admin/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'demo-' + role, password: credentials[role] }),
  })
  expect(response.status).toBe(200)
  const { data } = await response.json()
  expect(['local', 'staging']).toContain(data.environment)
  expect(data.roles).toContain(role)
  const cookie = response.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ')
  expect(cookie).not.toBe('')
  const headers = { Cookie: cookie, 'X-CSRF-Token': String(data.csrfToken), 'Content-Type': 'application/json' }
  return async function request(path: string, expectedStatus: number, body?: object) {
    const result = await fetch(origin + path, { method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body) })
    expect(result.status).toBe(expectedStatus)
    return result.json()
  }
}

describe('A 的真实测试 API 与 B 客户端', () => {
  it('BX-303～305 只读取已发布的新闻，审核发布后可见，下架后列表和详情都不可见', async () => {
    const editor = await login('editor')
    const reviewer = await login('reviewer')
    const records: Array<{ id: string; version: number; title: string; body: string }> = []
    const prefix = `合成：B 端联调 ${randomUUID().slice(0, 8)}`
    try {
      for (const label of ['A', 'B']) {
        const title = `${prefix} ${label}`
        const body = `合成新闻 ${label}\n第二段与 ${label} 对应。`
        const created = await editor('/v1/admin/contents', 201, {
          type: 'news', category: 'updates', title, summary: `合成摘要 ${label}`, body, isDemo: true,
        })
        const record = { id: String(created.data.id), version: Number(created.data.version), title, body }
        await expect(api.detail(record.id)).rejects.toMatchObject({ kind: 'api', status: 404, code: 'NOT_FOUND' })
        const draftList = await api.list({ type: 'news', page: 1, pageSize: 20 })
        expect(draftList.data.some(({ id }) => id === record.id)).toBe(false)

        const contentPath = '/v1/admin/contents/' + record.id
        const submitted = await editor(contentPath + '/submit', 200, { version: record.version })
        const approved = await reviewer(contentPath + '/approve', 200, { version: submitted.data.version })
        const published = await reviewer(contentPath + '/publish', 200, { version: approved.data.version })
        records.push({ ...record, version: Number(published.data.version) })
      }

      const listed = await api.list({ type: 'news', page: 1, pageSize: 20 })
      for (const record of records) {
        expect(listed.data.find(({ id }) => id === record.id)?.title).toBe(record.title)
        await expect(api.detail(record.id)).resolves.toMatchObject({ title: record.title, body: record.body, isDemo: true })
      }
    } finally {
      for (const { id, version } of records) {
        await reviewer(`/v1/admin/contents/${id}/unpublish`, 200, { version })
      }
    }
    const refreshed = await api.list({ type: 'news', page: 1, pageSize: 20 })
    for (const { id } of records) {
      expect(refreshed.data.some((item) => item.id === id)).toBe(false)
      await expect(api.detail(id)).rejects.toMatchObject({ kind: 'api', status: 404, code: 'NOT_FOUND' })
    }
  })

  it('BX-403/BX-405 服务端已写入但客户端丢失响应时，手动重试返回原记录且总数只增加一条', async () => {
    const admissions = await login('admissions')
    const before = await admissions('/v1/admin/inquiries?page=1&pageSize=20', 200)
    const seenStatuses: number[] = []
    const lostResponse: Transport = async (request) => {
      const response = await http(request)
      seenStatuses.push(response.status)
      if (seenStatuses.length === 1) throw { kind: 'network' }
      expect(response.headers?.['idempotent-replay']).toBe('true')
      return response
    }
    const running = createPublicApi(createClient({ baseUrl: origin, transport: lostResponse }), true)
    const submit = useIdempotentSubmit(running.submitInquiry, async () => randomUUID())
    const draft = toInquiryRequest({
      kind: 'visit', testName: '合成联调', testContact: 'cfls-b-test@example.invalid', message: '用于验证丢失响应。',
    })
    await expect(submit.submit(draft)).resolves.toMatchObject({ kind: 'failed', error: { kind: 'network' } })
    const retry = await submit.submit(draft)
    expect(seenStatuses).toEqual([201, 200])
    expect(retry).toMatchObject({ kind: 'success', value: { replayed: true } })
    if (retry.kind !== 'success') throw new Error('Missing replay result.')
    const after = await admissions('/v1/admin/inquiries?page=1&pageSize=20', 200)
    expect(after.meta.total).toBe(before.meta.total + 1)
    expect(after.data.some((entry: { id: string; isTest: boolean }) =>
      entry.id === retry.value.data.id && entry.isTest)).toBe(true)
  })

  it('E04 真实 API 拒绝无效分页并保留错误码和请求编号', async () => {
    const client = createClient({
      baseUrl: origin,
      transport: async (request) => {
        const response = await http(request)
        expect(response.status).toBe(400)
        return response
      },
    })
    await expect(client.request(apiPaths.listPublicContents, { query: { page: 0 } }))
      .rejects.toMatchObject({ kind: 'api', code: 'VALIDATION_FAILED', status: 400, requestId: expect.any(String) })
  })
})
