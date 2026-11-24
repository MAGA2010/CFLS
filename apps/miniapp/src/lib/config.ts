import { inquiryEnabledFor } from './inquiryEnabled'

const mode = import.meta.env.MODE
export const inquiryEnabled = inquiryEnabledFor(mode, import.meta.env.VITE_INQUIRY_ENABLED)
export const useMock = mode === 'development' && import.meta.env.VITE_API_MODE === 'mock'
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ||
  (mode === 'development' ? 'http://127.0.0.1:3000' : '')
