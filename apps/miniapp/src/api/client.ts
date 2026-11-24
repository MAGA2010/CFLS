import { apiHeaders, errorCodes } from './generated'

export type ApiCode = typeof errorCodes[number]

export type ClientError =
  | { kind: 'network' | 'timeout' | 'configuration' | 'local' }
  | { kind: 'parse'; requestId?: string }
  | { kind: 'api'; status: number; code: ApiCode; requestId?: string; details?: unknown }

export interface RequestOptions {
  method?: 'GET' | 'POST'
  query?: Record<string, string | number>
  body?: object
  timeoutMs?: number
  idempotencyKey?: string
  autoRetry?: boolean
}

interface RequestSignal {
  readonly aborted: boolean
  onAbort(abort: () => void): void
}

interface TransportRequest {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: object
  timeoutMs: number
  signal: RequestSignal
}

interface TransportResponse {
  status: number
  data: unknown
  headers?: Record<string, unknown>
}

export type Transport = (request: TransportRequest) => Promise<TransportResponse>

interface ClientOptions {
  baseUrl: string
  transport: Transport
  logParseError?: (error: Extract<ClientError, { kind: 'parse' }>) => void
}

type Envelope = Record<string, unknown> & { data: unknown; requestId: string }
type ResponseMeta = { replayed: boolean }

const defaultTimeout = 10_000
const retryDelay = 500
const codes = new Set<string>(errorCodes)
export const uuidV4 = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function asClientError(value: unknown): ClientError {
  if (isRecord(value)) {
    switch (value.kind) {
      case 'network':
      case 'timeout':
      case 'configuration':
      case 'local':
      case 'parse':
      case 'api':
        return value as ClientError
    }
  }
  return { kind: 'local' }
}

export const notFound = (): ClientError => ({ kind: 'api', status: 404, code: 'NOT_FOUND' })

function header(headers: TransportResponse['headers'], name: string): unknown {
  return Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
}

function safeRequestId(value: unknown): string | undefined {
  return typeof value === 'string' && uuidV4.test(value) ? value : undefined
}

function transportWithTimeout(transport: Transport, options: Omit<TransportRequest, 'signal'>) {
  return new Promise<TransportResponse>((resolve, reject) => {
    let abort: (() => void) | undefined
    let aborted = false
    const signal: RequestSignal = {
      get aborted() { return aborted },
      onAbort(callback) {
        if (aborted) callback()
        else abort = callback
      },
    }
    const timer = setTimeout(() => {
      aborted = true
      reject({ kind: 'timeout' } satisfies ClientError)
      abort?.()
    }, options.timeoutMs)
    Promise.resolve().then(() => transport({ ...options, signal })).then(resolve, reject)
      .finally(() => clearTimeout(timer))
  })
}

export function createClient({ baseUrl, transport, logParseError }: ClientOptions) {
  function parseFailure(requestId?: string): never {
    const error = { kind: 'parse', requestId } as const
    logParseError?.(error)
    throw error
  }

  async function request<T extends { requestId: string } = Envelope>(
    path: string,
    options: RequestOptions = {},
    validate?: (envelope: Envelope) => boolean,
  ): Promise<T & ResponseMeta> {
    if (!baseUrl) throw { kind: 'configuration' } satisfies ClientError
    const fields = Object.entries(options.query ?? {})
      .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    const url = `${baseUrl.replace(/\/+$/, '')}${path}${fields.length ? `?${fields.join('&')}` : ''}`
    const method = options.method ?? 'GET'
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json'
      if (options.idempotencyKey) headers[apiHeaders.idempotencyKey] = options.idempotencyKey
    }
    const deadline = Date.now() + (options.timeoutMs ?? defaultTimeout)
    const send = () => transportWithTimeout(transport, {
      url, method, headers, body: options.body, timeoutMs: Math.max(1, deadline - Date.now()),
    })

    let response: TransportResponse
    try {
      response = await send()
    } catch (cause) {
      const error = asClientError(cause)
      if (method !== 'GET' || options.autoRetry === false || error.kind !== 'network' ||
          deadline - Date.now() <= retryDelay) throw error
      await new Promise((resolve) => setTimeout(resolve, retryDelay))
      if (Date.now() >= deadline) throw { kind: 'timeout' } satisfies ClientError
      response = await send()
    }

    const payload = isRecord(response.data) ? response.data : undefined
    const requestId = safeRequestId(payload?.requestId) ?? safeRequestId(header(response.headers, 'X-Request-Id'))
    if (response.status < 200 || response.status >= 300) {
      const fault = payload?.error
      if (isRecord(fault) && typeof fault.code === 'string' && codes.has(fault.code)) {
        throw {
          kind: 'api', status: response.status, code: fault.code as ApiCode, requestId, details: fault.details,
        } satisfies ClientError
      }
      if (response.status >= 500) {
        throw { kind: 'api', status: response.status, code: 'INTERNAL_ERROR', requestId } satisfies ClientError
      }
      parseFailure(requestId)
    }

    if (!payload || !('data' in payload) || 'error' in payload || !requestId) parseFailure(requestId)
    const envelope = { ...payload, data: payload.data, requestId }
    if (validate && !validate(envelope)) parseFailure(requestId)
    const replayed = header(response.headers, apiHeaders.idempotentReplay) === 'true' ||
      (method === 'POST' && options.idempotencyKey !== undefined && response.status === 200)
    return { ...envelope, replayed } as unknown as T & ResponseMeta
  }

  return { request }
}

export const uniTransport: Transport = ({ url, method, headers, body, timeoutMs, signal }) =>
  new Promise((resolve, reject) => {
    const task = uni.request({
      url,
      method,
      header: method === 'GET' ? { ...headers, 'Cache-Control': 'no-cache, no-store' } : headers,
      data: body,
      timeout: timeoutMs,
      enableCache: false,
      success: (result) => resolve({ status: result.statusCode, data: result.data, headers: result.header }),
      fail: (failure) => reject({
        kind: /timeout|timed out/i.test(failure.errMsg) ? 'timeout' : 'network',
      } satisfies ClientError),
    })
    signal.onAbort(() => task.abort())
  })
