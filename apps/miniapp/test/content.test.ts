import { describe, expect, it, vi } from 'vitest'
import { useContentList } from '../src/composables/useContentList'
import { useResource } from '../src/composables/useResource'
import { catalogGroups, getListContext, listUrl, route } from '../src/lib/routes'
import type { ContentSummary, ListPublicContents } from '../src/api/public'

const makeItem = (id: string): ContentSummary => ({
  id, title: id, summary: null, body: '虚构', type: 'news', category: 'updates',
  isDemo: true, publishedAt: '2026-11-23T00:00:00.000Z',
})
const page = (number: number, total: number, ids: string[]): ListPublicContents => ({
  data: ids.map(makeItem), meta: { page: number, pageSize: 20, total }, requestId: 'c6721dcc-c52a-4bf5-8d21-2961ea928e76',
})

describe('公开内容状态', () => {
  it('BX-203/BX-302 保留已加载项目，重试失败页并去重', async () => {
    const getPage = vi.fn().mockResolvedValueOnce(page(1, 21, ['a', 'b']))
      .mockRejectedValueOnce({ kind: 'network' }).mockResolvedValueOnce(page(2, 21, ['b', 'c']))
    const list = useContentList(getPage)
    await list.refresh()
    expect(list.hasMore.value).toBe(true)
    await list.loadMore()
    expect(list.paginationError.value).toEqual({ kind: 'network' })
    expect(list.items.value.map(({ id }) => id)).toEqual(['a', 'b'])
    await list.loadMore()
    expect(getPage.mock.calls).toEqual([[1], [2], [2]])
    expect(list.items.value.map(({ id }) => id)).toEqual(['a', 'b', 'c'])
    expect(list.hasMore.value).toBe(false)
  })

  it('下拉更新时忽略旧分页响应，刷新后不保留已下架条目', async () => {
    let finish!: (value: ListPublicContents) => void
    const delayed = new Promise<ListPublicContents>((resolve) => { finish = resolve })
    const getPage = vi.fn().mockResolvedValueOnce(page(1, 25, ['a'])).mockReturnValueOnce(delayed)
      .mockResolvedValueOnce(page(1, 1, ['b']))
    const list = useContentList(getPage)
    await list.refresh()
    const pending = list.loadMore()
    await list.refresh()
    finish(page(2, 25, ['stale']))
    await pending
    expect(list.items.value.map(({ id }) => id)).toEqual(['b'])
    expect(list.hasMore.value).toBe(false)
  })

  it('BX-301 首页一个资源失败不会阻塞其他区块', async () => {
    const a = useResource(async () => { throw { kind: 'network' } })
    const b = useResource(async () => ['内容'])
    await Promise.all([a.load(), b.load()])
    expect(a.state.value).toEqual({ status: 'error', error: { kind: 'network' } })
    expect(b.state.value).toEqual({ status: 'ready', data: ['内容'] })
  })

  it('BX-602 25 项栏目和学生会有对应的真实路由与唯一映射', () => {
    const entries = catalogGroups.flatMap((group) => group.entries)
    expect(entries).toHaveLength(26)
    expect(new Set(entries.map(({ type, category }) => `${type}:${category}`)).size).toBe(26)
    expect(listUrl({ type: 'news', category: 'updates' })).toBe(route.news)
    expect(listUrl({ type: 'contact', category: 'contact' })).toBe(route.contact)
    expect(getListContext({ type: 'academics', category: 'alevel' })?.title).toBe('A-Level 课程')
    expect(getListContext({ type: 'school', category: 'fiction' })).toBeUndefined()
  })
})
