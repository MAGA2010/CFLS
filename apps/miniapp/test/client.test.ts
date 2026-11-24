import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient, type Transport } from '../src/api/client'
import { createPublicApi } from '../src/api/public'
import { apiPaths } from '../src/api/generated'

const requestId = 'c6721dcc-c52a-4bf5-8d21-2961ea928e76'
const article = {
  id: 'cd8e2d86-da85-4628-906e-7e443f2359a3',
  type: 'news',
  category: 'updates',
  title: '合成新闻',
  summary: null,
  body: '第一行\n第二行',
  publishedAt: '2026-11-23T01:23:00.000Z',
  isDemo: true,
}
const list = { data: [article], meta: { page: 1, pageSize: 20, total: 1 }, requestId }
const apiClient = (transport: Transport) => createClient({ baseUrl: 'https://example.invalid/', transport })

afterEach(() => vi.useRealTimers())

describe('公开 API 客户端', () => {
  it('BX-301 发出契约规定的分页查询并保留请求编号', async () => {
    const transport = vi.fn<Transport>().mockResolvedValue({ status: 200, data: list })
    const response = await createPublicApi(apiClient(transport), true).list({
      type: 'news', category: 'updates', page: 1, pageSize: 20,
    })
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.invalid/v1/public/contents?type=news&category=updates&page=1&pageSize=20',
      method: 'GET',
    }))
    expect(response.data).toEqual([article])
    expect(response.requestId).toBe(requestId)
  })

  it('BX-101 GET 网络失败后等待 500ms 重试一次', async () => {
    vi.useFakeTimers()
    const transport = vi.fn<Transport>().mockRejectedValueOnce({ kind: 'network' })
      .mockResolvedValueOnce({ status: 200, data: list })
    const result = apiClient(transport).request(apiPaths.listPublicContents)
    await vi.advanceTimersByTimeAsync(499)
    expect(transport).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toMatchObject({ requestId })
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it('BX-101 GET 连续两次断网后停止重试', async () => {
    vi.useFakeTimers()
    const transport = vi.fn<Transport>().mockRejectedValue({ kind: 'network' })
    const result = apiClient(transport).request(apiPaths.listPublicContents)
    const assertion = expect(result).rejects.toMatchObject({ kind: 'network' })
    await vi.advanceTimersByTimeAsync(500)
    await assertion
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it('BX-102 传输未回调时也在预算内超时并取消请求', async () => {
    vi.useFakeTimers()
    const transport = vi.fn<Transport>().mockImplementation(() => new Promise(() => {}))
    const result = apiClient(transport).request(apiPaths.listPublicContents, { timeoutMs: 10_000 })
    const assertion = expect(result).rejects.toMatchObject({ kind: 'timeout' })
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0][0].signal.aborted).toBe(true)
  })

  it.each([
    [400, 'VALIDATION_FAILED'], [404, 'NOT_FOUND'], [409, 'IDEMPOTENCY_CONFLICT'],
    [429, 'RATE_LIMITED'], [503, 'INTERNAL_ERROR'],
  ])('HTTP %s 保留注册错误码、requestId，且不自动重试', async (status, code) => {
    const transport = vi.fn<Transport>().mockResolvedValue({
      status, data: { requestId, error: { code, message: '内部说明' } },
    })
    await expect(apiClient(transport).request(apiPaths.listPublicContents))
      .rejects.toMatchObject({ kind: 'api', status, code, requestId })
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('无效成功响应只记录安全的诊断字段', async () => {
    const logParseError = vi.fn()
    const transport = vi.fn<Transport>().mockResolvedValue({ status: 200, data: { data: list.data, requestId } })
    const client = createClient({ baseUrl: 'http://127.0.0.1:3000', transport, logParseError })
    await expect(createPublicApi(client, true).list({ type: 'news' }))
      .rejects.toMatchObject({ kind: 'parse', requestId })
    expect(logParseError.mock.calls).toEqual([[{ kind: 'parse', requestId }]])
  })

  it('拒绝与请求 ID 不一致的详情', async () => {
    const transport = vi.fn<Transport>().mockResolvedValue({ status: 200, data: { data: article, requestId } })
    await expect(createPublicApi(apiClient(transport), true).detail('becf7fc9-dea4-48fa-a9e8-ab7c0d8527db'))
      .rejects.toMatchObject({ kind: 'parse', requestId })
  })

  it('BX-405 POST 不自动重试并读取大小写无关的重放响应头', async () => {
    const transport = vi.fn<Transport>().mockRejectedValueOnce({ kind: 'network' }).mockResolvedValueOnce({
      status: 200,
      data: { data: { id: article.id, createdAt: article.publishedAt }, requestId },
      headers: { 'iDeMpOtEnT-rEpLaY': 'true' },
    })
    const api = createPublicApi(apiClient(transport), true)
    const payload = { kind: 'visit', testName: '虚构称呼', testContact: 'demo@example.invalid', isTest: true } as const
    await expect(api.submitInquiry(payload, article.id)).rejects.toMatchObject({ kind: 'network' })
    expect(transport).toHaveBeenCalledTimes(1)
    await expect(api.submitInquiry(payload, article.id)).resolves.toMatchObject({ replayed: true, requestId })
    expect(transport.mock.calls[1][0].headers['Idempotency-Key']).toBe(article.id)
  })

  it('BX-407 咨询关闭时不会发出 POST', async () => {
    const transport = vi.fn<Transport>()
    const api = createPublicApi(apiClient(transport), false)
    await expect(api.submitInquiry({ kind: 'visit', testName: '虚构', testContact: '虚构', isTest: true }, article.id))
      .rejects.toMatchObject({ kind: 'api', status: 404, code: 'NOT_FOUND' })
    expect(transport).not.toHaveBeenCalled()
  })
})
