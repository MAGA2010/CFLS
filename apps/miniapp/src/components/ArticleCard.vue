<script setup lang="ts">
import { computed } from 'vue'
import type { ContentSummary } from '../api/public'
import { formatLocalTime } from '../lib/time'

const props = defineProps<{ article: ContentSummary }>()
const emit = defineEmits<{ tap: [id: string] }>()
if (import.meta.env.DEV && !props.article) throw new Error('ArticleCard requires an article.')
const timestamp = computed(() => formatLocalTime(props.article.publishedAt))
</script>

<template>
  <button class="article-card" hover-class="card-pressed" :aria-label="article.title" @tap="emit('tap', article.id)">
    <view class="article-copy">
      <text class="article-title">{{ article.title }}</text>
      <text v-if="article.summary" class="article-summary">{{ article.summary }}</text>
      <view class="article-meta">
        <text>{{ timestamp }}</text>
        <text v-if="article.isDemo" class="demo-label">合成示例</text>
      </view>
    </view>
    <view class="article-chevron" aria-hidden="true" />
  </button>
</template>

<style scoped lang="scss">
.article-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-3;
  width: 100%;
  min-height: $tap-min-height;
  padding: $space-3;
  color: $text-primary;
  text-align: left;
  background: $surface;
  border-radius: $radius-md;
}
.card-pressed { background: $brand-wash; }
.article-copy { flex: 1; min-width: 0; }
.article-title {
  display: -webkit-box;
  overflow: hidden;
  font-size: calc(#{$font-title} * var(--cfls-font-scale, 1));
  font-weight: 650;
  line-height: 1.35;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.article-summary {
  display: block;
  overflow: hidden;
  margin-top: $space-1;
  color: $text-secondary;
  font-size: calc(#{$font-body} * var(--cfls-font-scale, 1));
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.article-meta {
  display: flex;
  flex-wrap: wrap;
  gap: $space-1 $space-2;
  margin-top: $space-1;
  color: $text-secondary;
  font-size: calc(#{$font-caption} * var(--cfls-font-scale, 1));
  line-height: 1.4;
}
.demo-label { color: $brand-ink; }
.article-chevron {
  flex: 0 0 $space-1;
  height: $space-1;
  margin-right: $space-1;
  border-top: 2px solid $brand-ink;
  border-right: 2px solid $brand-ink;
  transform: rotate(45deg);
}
</style>
