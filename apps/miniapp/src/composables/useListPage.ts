import { computed, reactive, shallowRef } from 'vue'
import { onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
import { publicApi } from '../api'
import { notFound } from '../api/client'
import { getListContext } from '../lib/routes'
import { useContentList } from './useContentList'

export function useListPage(news = false) {
  const context = shallowRef(news ? getListContext({ type: 'news' }) : undefined)
  const title = computed(() => news ? '新闻' : context.value?.title ?? '栏目内容')
  const list = reactive(useContentList((page) => {
    if (!context.value) return Promise.reject(notFound())
    const { type, category } = context.value
    return publicApi.list({ type, category, page, pageSize: 20 })
  }))

  onLoad((options) => {
    if (!news) context.value = getListContext(options)
    void list.refresh()
  })
  onPullDownRefresh(async () => {
    try { await list.refresh() } finally { uni.stopPullDownRefresh() }
  })
  onReachBottom(() => {
    if (!list.paginationError) void list.loadMore()
  })

  return { title, context, list }
}
