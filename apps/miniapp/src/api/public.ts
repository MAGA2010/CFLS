import { apiPaths, contentTypes, type components, type operations } from './generated'
import { isRecord, notFound, uuidV4, type createClient } from './client'

type PublicContent = components['schemas']['PublicContent']
export type ContentType = components['schemas']['ContentType']
export type ContentSummary = Omit<PublicContent, 'publishedAt'> & { publishedAt?: string | null }
export type ListQuery = NonNullable<operations['listPublicContents']['parameters']['query']>
export type ListPublicContents = Omit<
  operations['listPublicContents']['responses'][200]['content']['application/json'], 'data'
> & { data: ContentSummary[] }
export type TestInquiry = components['schemas']['TestInquiryCreate']
type InquiryResponse = Required<components['schemas']['InquiryCreatedResponse']>
export type InquiryResult = InquiryResponse & { replayed: boolean }

const types = new Set<string>(contentTypes)
const isUuid = (value: unknown) => typeof value === 'string' && uuidV4.test(value)

function isContent(value: unknown): value is ContentSummary {
  return isRecord(value) && isUuid(value.id) &&
    typeof value.type === 'string' && types.has(value.type) && typeof value.category === 'string' &&
    typeof value.title === 'string' && (value.summary === null || typeof value.summary === 'string') &&
    typeof value.body === 'string' && typeof value.isDemo === 'boolean' &&
    (value.publishedAt == null || typeof value.publishedAt === 'string')
}

export function createPublicApi(client: ReturnType<typeof createClient>, allowInquiry: boolean) {
  async function list(query: ListQuery): Promise<ListPublicContents> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    return client.request<ListPublicContents>(apiPaths.listPublicContents, {
      query: {
        ...(query.type ? { type: query.type } : {}),
        ...(query.category ? { category: query.category } : {}),
        page,
        pageSize,
      },
    }, ({ data, meta }) =>
      Array.isArray(data) && data.every((item) => isContent(item) &&
        (!query.type || item.type === query.type) && (!query.category || item.category === query.category)) &&
      isRecord(meta) && meta.page === page && meta.pageSize === pageSize &&
      typeof meta.total === 'number' && Number.isSafeInteger(meta.total) && meta.total >= 0)
  }

  async function detail(id: string): Promise<ContentSummary> {
    if (!isUuid(id)) throw notFound()
    const path = apiPaths.getPublicContent.replace('{id}', encodeURIComponent(id))
    const result = await client.request<{ data: ContentSummary; requestId: string }>(path, {}, ({ data }) =>
      isContent(data) && data.id.toLowerCase() === id.toLowerCase())
    return result.data
  }

  async function submitInquiry(body: TestInquiry, key: string): Promise<InquiryResult> {
    if (!allowInquiry) throw notFound()
    return client.request<InquiryResponse>(apiPaths.createTestInquiry, {
      method: 'POST', body, idempotencyKey: key,
    }, ({ data }) => isRecord(data) && isUuid(data.id) && typeof data.createdAt === 'string')
  }

  return { list, detail, submitInquiry }
}
