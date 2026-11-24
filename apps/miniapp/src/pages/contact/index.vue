<script setup lang="ts">
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import { publicApi } from '../../api'
import ArticleDetail from '../../components/ArticleDetail.vue'
import EmptyState from '../../components/EmptyState.vue'
import PageContainer from '../../components/PageContainer.vue'
import { useResource } from '../../composables/useResource'

const { state, load } = useResource(async () => {
  const { data } = await publicApi.list({ type: 'contact', category: 'contact', page: 1, pageSize: 1 })
  return data[0] ?? null
})

onLoad(() => { void load() })
onPullDownRefresh(async () => {
  try { await load() } finally { uni.stopPullDownRefresh() }
})
</script>

<template>
  <PageContainer title="联系我们" back>
    <EmptyState v-if="state.status === 'ready' && !state.data" kind="pending-school" />
    <ArticleDetail v-else-if="state.status !== 'ready'" :state="state" @retry="load" />
    <ArticleDetail v-else-if="state.data" :state="{ status: 'ready', data: state.data }" @retry="load" />
  </PageContainer>
</template>
