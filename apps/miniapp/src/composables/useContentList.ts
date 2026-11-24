import { computed, ref, shallowRef } from 'vue'
import { asClientError, type ClientError } from '../api/client'
import type { ContentSummary, ListPublicContents } from '../api/public'

export function useContentList(read: (page: number) => Promise<ListPublicContents>) {
  const items = shallowRef<ContentSummary[]>([])
  const refreshing = ref(true)
  const loadingMore = ref(false)
  const error = shallowRef<ClientError>()
  const paginationError = shallowRef<ClientError>()
  const hasMore = ref(false)
  const initialLoading = computed(() => refreshing.value && items.value.length === 0)
  let page = 0
  let generation = 0

  function accept(result: ListPublicContents, previous: ContentSummary[]) {
    const unique = new Map(previous.map((item) => [item.id, item]))
    for (const item of result.data) unique.set(item.id, item)
    items.value = [...unique.values()]
    page = result.meta.page
    hasMore.value = result.data.length > 0 && page * result.meta.pageSize < result.meta.total
  }

  async function refresh() {
    const version = ++generation
    refreshing.value = true
    error.value = undefined
    paginationError.value = undefined
    loadingMore.value = false
    try {
      const result = await read(1)
      if (version === generation) accept(result, [])
    } catch (cause) {
      if (version === generation) error.value = asClientError(cause)
    } finally {
      if (version === generation) refreshing.value = false
    }
  }

  async function loadMore() {
    if (refreshing.value || loadingMore.value || error.value || !hasMore.value) return
    const version = generation
    loadingMore.value = true
    paginationError.value = undefined
    try {
      const result = await read(page + 1)
      if (version === generation) accept(result, items.value)
    } catch (cause) {
      if (version === generation) paginationError.value = asClientError(cause)
    } finally {
      if (version === generation) loadingMore.value = false
    }
  }

  return { items, initialLoading, loadingMore, error, paginationError, hasMore, refresh, loadMore }
}
