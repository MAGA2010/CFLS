<script setup lang="ts">
import type { ContentSummary } from '../api/public'
import type { ResourceState } from '../composables/useResource'
import ArticleCard from './ArticleCard.vue'
import EmptyState from './EmptyState.vue'
import ErrorState from './ErrorState.vue'
import LoadingSkeleton from './LoadingSkeleton.vue'

defineProps<{
  title: string
  link: string
  state: ResourceState<ContentSummary[]>
  empty: 'no-content' | 'pending-school'
  hideEmpty?: boolean
}>()
const emit = defineEmits<{ open: []; article: [id: string]; retry: [] }>()
</script>

<template>
  <view class="home-section">
    <view class="home-section-head">
      <text class="section-title">{{ title }}</text>
      <button class="section-link" hover-class="section-pressed" @tap="emit('open')">
        <text>{{ link }}</text>
        <view class="section-chevron" aria-hidden="true" />
      </button>
    </view>
    <LoadingSkeleton v-if="state.status === 'loading'" variant="list" />
    <ErrorState v-else-if="state.status === 'error'" :error="state.error" @retry="emit('retry')" />
    <template v-else-if="state.data.length">
      <ArticleCard v-for="article in state.data" :key="article.id" :article="article" @tap="emit('article', $event)" />
    </template>
    <EmptyState v-else-if="!hideEmpty" :kind="empty" />
    <slot />
  </view>
</template>

<style scoped lang="scss">
.home-section { display: flex; flex-direction: column; gap: $space-2; min-width: 0; }
.home-section-head { display: flex; align-items: center; justify-content: space-between; gap: $space-2; }
.section-title {
  min-width: 0;
  font-size: calc(#{$font-title} * var(--cfls-font-scale, 1));
  font-weight: 750;
  line-height: 1.3;
}
.section-link {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: $space-2;
  min-height: $tap-min-height;
  max-width: 55%;
  margin: 0;
  padding: 0 $space-2;
  color: $brand-ink;
  background: transparent;
  border-radius: $radius-md;
  font-size: calc(#{$font-caption} * var(--cfls-font-scale, 1));
  line-height: 1.35;
  white-space: normal;
}
.section-link::after { border: 0; }
.section-pressed { background: $brand-wash; }
.section-chevron {
  flex: 0 0 $space-1;
  height: $space-1;
  border-top: 2px solid currentColor;
  border-right: 2px solid currentColor;
  transform: rotate(45deg);
}
</style>
