<script setup lang="ts">
import type { useListPage } from '../composables/useListPage'
import { openDetail } from '../lib/routes'
import ArticleCard from './ArticleCard.vue'
import EmptyState from './EmptyState.vue'
import ErrorState from './ErrorState.vue'
import LoadingSkeleton from './LoadingSkeleton.vue'

defineProps<{ list: ReturnType<typeof useListPage>['list']; news?: boolean }>()
</script>

<template>
  <view class="content-list">
    <LoadingSkeleton v-if="list.initialLoading" variant="list" />
    <ErrorState v-if="list.error" :error="list.error" back-on-not-found @retry="list.refresh" />
    <button
      v-if="list.paginationError"
      class="pagination-retry"
      hover-class="pagination-pressed"
      @tap="list.loadMore"
    >
      <text>加载更多失败，点击重试</text>
      <text v-if="'requestId' in list.paginationError && list.paginationError.requestId" class="pagination-id">
        请求编号 {{ list.paginationError.requestId }}
      </text>
    </button>
    <text v-if="list.loadingMore" class="end-status" role="status">正在加载更多</text>
    <ArticleCard
      v-for="article in list.items" :key="article.id" :article="article"
      @tap="openDetail($event, news)"
    />
    <EmptyState
      v-if="!list.initialLoading && !list.error && !list.items.length"
      :kind="news ? 'no-content' : 'pending-school'"
    />
    <text v-if="list.items.length && !list.hasMore && !list.error" class="end-status">没有更多了</text>
  </view>
</template>

<style scoped lang="scss">
.content-list { display: flex; flex-direction: column; gap: $space-2; }
.pagination-retry {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: $tap-min-height;
  padding: $space-2 $space-3;
  color: $brand-ink;
  background: $brand-wash;
  border-radius: $radius-md;
  font-size: calc(#{$font-body} * var(--cfls-font-scale, 1));
  line-height: 1.45;
  text-align: left;
  white-space: normal;
}
.pagination-pressed { opacity: 0.72; }
.pagination-id, .end-status {
  color: $text-secondary;
  font-size: calc(#{$font-caption} * var(--cfls-font-scale, 1));
  overflow-wrap: anywhere;
}
.end-status { padding: $space-2 0; text-align: center; }
</style>
