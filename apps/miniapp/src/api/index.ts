import { apiBaseUrl, inquiryEnabled, useMock } from '../lib/config'
import { createClient, uniTransport } from './client'
import { mockTransport } from './mock'
import { createPublicApi } from './public'

export const canSubmitInquiry = inquiryEnabled && !useMock
export const publicApi = createPublicApi(createClient({
  baseUrl: useMock ? 'https://cfls.example.invalid' : apiBaseUrl,
  transport: useMock ? mockTransport : uniTransport,
  logParseError: import.meta.env.DEV ? (error) => console.error(error) : undefined,
}), canSubmitInquiry)
