import { apiPaths } from './generated'
import type { Transport } from './client'
import type { ContentSummary } from './public'

const requestId = '1b038a44-1a62-4d7b-8638-80448818453d'
const entries: Array<Pick<ContentSummary, 'type' | 'category' | 'title'>> = [
  { type: 'school', category: 'overview', title: '合成：学校概况' },
  { type: 'academics', category: 'overview', title: '合成：课程体系总览' },
  { type: 'outcomes', category: 'counseling', title: '合成：升学指导体系' },
  { type: 'campus', category: 'clubs', title: '合成：校园社团' },
  { type: 'student_union', category: 'overview', title: '合成：学生会动态' },
  { type: 'news', category: 'updates', title: '合成：小程序联调通知' },
  { type: 'admissions', category: 'faq', title: '合成：招生常见问题' },
]
const articles: ContentSummary[] = entries.map((entry, index) => ({
  ...entry,
  id: `3b0e23ec-dda4-4205-a23d-${(index + 1).toString().padStart(12, '0')}`,
  summary: '用于检查栏目导航和页面状态的合成内容。',
  body: '这是接口模拟数据。\n可切换到测试 API 查看已发布的联调内容。',
  publishedAt: '2026-11-23T00:00:00.000Z',
  isDemo: true,
}))

export const mockTransport: Transport = async ({ url, method }) => {
  const [pathname, search = ''] = url.replace(/^https?:\/\/[^/]+/, '').split('?')
  const query = Object.fromEntries(search.split('&').filter(Boolean)
    .map((pair) => pair.split('=').map(decodeURIComponent)))
  if (method === 'GET' && pathname === apiPaths.listPublicContents) {
    const page = Number(query.page ?? 1)
    const pageSize = Number(query.pageSize ?? 20)
    const matching = articles.filter((item) =>
      (!query.type || item.type === query.type) && (!query.category || item.category === query.category))
    return { status: 200, data: {
      data: matching.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, pageSize, total: matching.length },
      requestId,
    } }
  }
  const article = articles.find(({ id }) => pathname === apiPaths.getPublicContent.replace('{id}', id))
  if (method === 'GET' && article) return { status: 200, data: { data: article, requestId } }
  return { status: 404, data: { error: { code: 'NOT_FOUND', message: 'Resource not found' }, requestId } }
}
