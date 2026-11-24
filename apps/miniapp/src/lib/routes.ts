import type { ContentType, ListQuery } from '../api/public'

export const route = {
  home: '/pages/home/index',
  catalog: '/pages/catalog/index',
  news: '/pages/news/list',
  newsDetail: '/pages/news/detail',
  contentList: '/pages/content/list',
  contentDetail: '/pages/content/detail',
  inquiry: '/pages/inquiry/index',
  contact: '/pages/contact/index',
} as const

type Topic = readonly [number | null, string, string]

function group(type: ContentType, title: string, topics: readonly Topic[]) {
  return {
    type, title,
    entries: topics.map(([number, category, label]) => ({ number, type, category, title: label })),
  }
}

export const catalogGroups = [
  group('school', '学校介绍', [
    [1, 'overview', '学校概况'],
    [2, 'head_message', '校长致辞'],
    [3, 'mission', '使命愿景校训'],
    [4, 'history', '发展历程'],
    [5, 'faculty', '管理团队与师资'],
    [6, 'partnerships', '认证与合作'],
  ]),
  group('academics', '课程体系', [
    [7, 'overview', '课程体系总览'],
    [8, 'foundation', '基础课程'],
    [9, 'ap', 'AP 课程'],
    [10, 'alevel', 'A-Level 课程'],
    [11, 'subjects', '学科目录'],
    [12, 'calendar', '校历'],
  ]),
  group('outcomes', '升学指导', [
    [13, 'counseling', '升学指导体系'],
    [14, 'outcomes', '升学去向与成就'],
  ]),
  group('admissions', '招生信息', [
    [15, 'why_us', '为什么选择我们'],
    [16, 'application', '申请流程'],
    [17, 'requirements', '入学要求与测试'],
    [18, 'fees', '学费与费用'],
    [19, 'faq', '常见问题'],
    [20, 'consultation', '咨询与预约'],
  ]),
  group('campus', '校园生活', [
    [21, 'clubs', '社团、体育与艺术'],
    [22, 'boarding', '寄宿、餐饮与健康'],
    [23, 'facilities', '校园设施'],
  ]),
  group('student_union', '学生会', [
    [null, 'overview', '学生会简介与动态'],
  ]),
  group('news', '校园新闻', [
    [24, 'updates', '新闻、活动与通知'],
  ]),
  group('contact', '联系学校', [
    [25, 'contact', '联系我们'],
  ]),
]

export type ContentFilter = Required<Pick<ListQuery, 'type'>> & Pick<ListQuery, 'category'>

export function getListContext(options?: Record<string, unknown>): (ContentFilter & { title: string }) | undefined {
  const section = catalogGroups.find(({ type }) => type === options?.type)
  if (!section) return undefined
  if (options?.category === undefined) return { type: section.type, title: section.title }
  const entry = section.entries.find(({ category }) => category === options.category)
  if (entry) return { type: entry.type, category: entry.category, title: entry.title }
}

export function listUrl({ type, category }: ContentFilter): string {
  if (type === 'news') return route.news
  if (type === 'contact') return route.contact
  const query = category ? `&category=${encodeURIComponent(category)}` : ''
  return `${route.contentList}?type=${encodeURIComponent(type)}${query}`
}

export function detailUrl(id: string, news = false): string {
  return `${news ? route.newsDetail : route.contentDetail}?id=${encodeURIComponent(id)}`
}

export function openList(filter: ContentFilter) {
  const url = listUrl(filter)
  if (url === route.news) uni.switchTab({ url })
  else uni.navigateTo({ url })
}

export function openDetail(id: string, news = false) {
  uni.navigateTo({ url: detailUrl(id, news) })
}

const goHome = () => uni.switchTab({ url: route.home })

export function goBackOrHome() {
  if (getCurrentPages().length > 1) uni.navigateBack({ fail: goHome })
  else goHome()
}
