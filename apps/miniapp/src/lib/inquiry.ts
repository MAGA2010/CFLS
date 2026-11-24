import { isRecord } from '../api/client'
import { inquiryKinds, inquiryLimits } from '../api/generated'
import type { TestInquiry } from '../api/public'

export type InquiryDraft = Omit<TestInquiry, 'kind' | 'message' | 'isTest'> & {
  kind: TestInquiry['kind'] | ''
  message: string
}
export type InquiryField = keyof InquiryDraft
export type InquiryErrors = Partial<Record<InquiryField, string>>

export const emptyInquiry = (): InquiryDraft => ({ kind: '', testName: '', testContact: '', message: '' })

const fieldMessages: Record<InquiryField, string> = {
  kind: '请选择咨询或参观。',
  testName: `请填写 1–${inquiryLimits.testName} 字的虚构称呼。`,
  testContact: `请填写 1–${inquiryLimits.testContact} 字的虚构联系方式。`,
  message: `留言最多 ${inquiryLimits.message} 字。`,
}

export function validateInquiry(draft: InquiryDraft): InquiryErrors {
  const errors: InquiryErrors = {}
  if (!draft.kind || !inquiryKinds.includes(draft.kind)) errors.kind = fieldMessages.kind
  for (const field of ['testName', 'testContact'] as const) {
    const length = draft[field].trim().length
    if (length < 1 || length > inquiryLimits[field]) errors[field] = fieldMessages[field]
  }
  if (draft.message.length > inquiryLimits.message) errors.message = fieldMessages.message
  return errors
}

export function toInquiryRequest(draft: InquiryDraft): TestInquiry {
  if (!draft.kind) throw new Error('A valid inquiry kind is required.')
  return {
    kind: draft.kind,
    testName: draft.testName.trim(),
    testContact: draft.testContact.trim(),
    message: draft.message.trim(),
    isTest: true,
  }
}

export function mapInquiryErrors(details: unknown): InquiryErrors {
  const errors: InquiryErrors = {}
  if (!Array.isArray(details)) return errors
  for (const issue of details) {
    if (!isRecord(issue)) continue
    const field = Array.isArray(issue.path) ? issue.path[0] : (issue.path ?? issue.field)
    if (typeof field === 'string' && Object.prototype.hasOwnProperty.call(fieldMessages, field)) {
      errors[field as InquiryField] = fieldMessages[field as InquiryField]
    }
  }
  return errors
}
