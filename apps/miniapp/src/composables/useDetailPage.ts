import { ref } from 'vue'
import { onLoad, onPullDownRefresh, onShareAppMessage } from '@dcloudio/uni-app'
import { publicApi } from '../api'
import { notFound } from '../api/client'
import { detailUrl, route } from '../lib/routes'
import { useResource } from './useResource'

export function useDetailPage(news = false) {
  const id = ref('')
  const { state, load } = useResource(async () => {
    const article = await publicApi.detail(id.value)
    if (news && article.type !== 'news') throw notFound()
    return article
  })

  onLoad((options) => {
    id.value = typeof options?.id === 'string' ? options.id : ''
    void load()
  })
  onPullDownRefresh(async () => {
    try { await load() } finally { uni.stopPullDownRefresh() }
  })
  onShareAppMessage(() => state.value.status === 'ready'
    ? { title: state.value.data.title, path: detailUrl(id.value, news) }
    : { title: '校园指南', path: route.home })

  return { state, load }
}
