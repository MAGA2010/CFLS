<script setup lang="ts">
import type { ContentSummary } from '../api/public'
import type { ResourceState } from '../composables/useResource'
import { formatLocalTime } from '../lib/time'
import ErrorState from './ErrorState.vue'
import LoadingSkeleton from './LoadingSkeleton.vue'
import SafeImage from './SafeImage.vue'

defineProps<{ state: ResourceState<ContentSummary> }>()
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <LoadingSkeleton v-if="state.status === 'loading'" variant="detail" />
  <ErrorState v-else-if="state.status === 'error'" :error="state.error" back-on-not-found @retry="emit('retry')" />
  <view v-else class="detail">
    <text class="detail-title" :aria-label="state.data.title">{{ state.data.title }}</text>
    <view class="detail-meta">
      <text>{{ formatLocalTime(state.data.publishedAt) }}</text>
      <text v-if="state.data.isDemo" class="detail-demo">合成示例</text>
    </view>
    <SafeImage ratio="2:1" />
    <text class="detail-body" user-select>{{ state.data.body }}</text>
  </view>
</template>

<style scoped lang="scss">
.detail {
  display: flex;
  flex-direction: column;
  gap: $space-3;
  min-width: 0;
  padding: $space-3;
  background: $surface;
  border-radius: $radius-md;
}
.detail-title {
  display: -webkit-box;
  overflow: hidden;
  font-size: calc(#{$font-title} * var(--cfls-font-scale, 1));
  font-weight: 750;
  line-height: 1.36;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: $space-1 $space-2;
  color: $text-secondary;
  font-size: calc(#{$font-caption} * var(--cfls-font-scale, 1));
}
.detail-demo { color: $brand-ink; }
.detail-body {
  min-width: 0;
  font-size: calc(#{$font-body} * var(--cfls-font-scale, 1));
  line-height: $leading-body;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: pre-wrap;
}
</style>
