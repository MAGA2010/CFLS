import { describe, expect, it, vi } from 'vitest'
import { mapInquiryErrors, toInquiryRequest, validateInquiry, type InquiryDraft } from '../src/lib/inquiry'
import { inquiryEnabledFor } from '../src/lib/inquiryEnabled'
import { formatLocalTime } from '../src/lib/time'
import { useIdempotentSubmit } from '../src/composables/useIdempotentSubmit'

const draft = { kind: 'visit', testName: ' 示例 ', testContact: ' sample@example.invalid ', message: ' 虚构 ' } as const

describe('合成咨询', () => {
  it('BX-401/BX-402 逐字段验证空输入和长度边界', () => {
    expect(Object.keys(validateInquiry({ kind: '', testName: ' ', testContact: '', message: '' }))).toEqual([
      'kind', 'testName', 'testContact',
    ])
    const limits: InquiryDraft = { kind: 'consultation', testName: '某'.repeat(40), testContact: 'x'.repeat(100), message: 'x'.repeat(500) }
    expect(validateInquiry(limits)).toEqual({})
    expect(Object.keys(validateInquiry({ ...limits, testName: '某'.repeat(41), testContact: 'x'.repeat(101), message: 'x'.repeat(501) })))
      .toEqual(['testName', 'testContact', 'message'])
  })

  it('提交只包含白名单字段与测试标识', () => {
    expect(toInquiryRequest(draft)).toEqual({
      kind: 'visit', testName: '示例', testContact: 'sample@example.invalid', message: '虚构', isTest: true,
    })
  })

  it('服务端 400 映射字段名，不展示服务端明文细节', () => {
    const errors = mapInquiryErrors([{ path: 'testName', message: 'raw-input' }, { path: 'authorization', message: 'raw-input' }])
    expect(Object.keys(errors)).toEqual(['testName'])
    expect(errors.testName).not.toContain('raw-input')
  })

  it('BX-407 生产构建即使误设置开关也隐藏咨询', () => {
    expect(inquiryEnabledFor('production', 'true')).toBe(false)
    expect(inquiryEnabledFor('development', 'false')).toBe(false)
    expect(inquiryEnabledFor('development', 'true')).toBe(true)
    expect(inquiryEnabledFor('staging', 'true')).toBe(true)
  })

  it('BX-404 生成 key 和提交进行时均拦截双击', async () => {
    let finishKey!: (key: string) => void
    const key = new Promise<string>((resolve) => { finishKey = resolve })
    const send = vi.fn().mockResolvedValue({ replayed: false })
    const state = useIdempotentSubmit(send, () => key)
    const first = state.submit(draft)
    await expect(state.submit(draft)).resolves.toEqual({ kind: 'ignored' })
    finishKey('key-1')
    await expect(first).resolves.toEqual({ kind: 'success', value: { replayed: false } })
    expect(send).toHaveBeenCalledExactlyOnceWith(draft, 'key-1')
    expect(state.status.value).toBe('success')
  })

  it('BX-405 网络、超时和 5xx 后重用同一 key', async () => {
    const send = vi.fn().mockRejectedValueOnce({ kind: 'network' })
      .mockRejectedValueOnce({ kind: 'timeout' })
      .mockRejectedValueOnce({ kind: 'api', code: 'INTERNAL_ERROR', status: 503 })
      .mockResolvedValueOnce({ replayed: true })
    const makeKey = vi.fn().mockResolvedValue('key-1')
    const state = useIdempotentSubmit(send, makeKey)
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(state.submit(draft)).resolves.toMatchObject({ kind: 'failed' })
      expect(state.status.value).toBe('failed')
    }
    await expect(state.submit(draft)).resolves.toEqual({ kind: 'success', value: { replayed: true } })
    expect(send.mock.calls).toEqual(Array.from({ length: 4 }, () => [draft, 'key-1']))
    expect(makeKey).toHaveBeenCalledTimes(1)
  })

  it('BX-406 失败后编辑或服务端明确冲突时重新生成 key', async () => {
    const send = vi.fn().mockRejectedValueOnce({ kind: 'timeout' })
      .mockRejectedValueOnce({ kind: 'api', status: 409, code: 'IDEMPOTENCY_CONFLICT' })
      .mockResolvedValueOnce({ replayed: false })
    const state = useIdempotentSubmit(send, vi.fn()
      .mockResolvedValueOnce('key-1').mockResolvedValueOnce('key-2').mockResolvedValue('key-3'))
    await state.submit(draft)
    state.fieldChanged()
    const edited = { ...draft, message: '另一条虚构消息' }
    await state.submit(edited)
    await state.submit(edited)
    expect(send.mock.calls).toEqual([[draft, 'key-1'], [edited, 'key-2'], [edited, 'key-3']])
  })

  it('BX-408 离开页面时释放 key 并忽略迟到回调', async () => {
    let finish!: (value: string) => void
    const response = new Promise<string>((resolve) => { finish = resolve })
    const send = vi.fn().mockReturnValue(response)
    const state = useIdempotentSubmit(send, async () => 'test-key')
    const pending = state.submit(draft)
    await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(1)
    state.dispose()
    finish('late')
    await expect(pending).resolves.toEqual({ kind: 'ignored' })
    expect(state.status.value).toBe('idle')
    await expect(state.submit(draft)).resolves.toEqual({ kind: 'ignored' })
  })
})

it('使用本地时间，缺失或无效时间显示占位符', () => {
  expect(formatLocalTime(null)).toBe('—')
  expect(formatLocalTime('invalid')).toBe('—')
  expect(formatLocalTime(new Date(2026, 10, 23, 9, 5).toISOString())).toBe('2026-11-23 09:05')
})
