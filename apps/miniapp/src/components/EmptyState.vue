<script setup lang="ts">
const props = defineProps<{ kind: 'no-content' | 'pending-school' }>()
if (import.meta.env.DEV && !props.kind) throw new Error('EmptyState requires a kind.')
</script>

<template>
  <view class="empty-state" role="status">
    <text class="empty-title">{{ kind === 'pending-school' ? '待学校确认' : '暂无内容' }}</text>
    <text class="empty-detail">{{ kind === 'pending-school' ? '学校发布资料后将在此展示。' : '目前还没有已发布的内容。' }}</text>
  </view>
</template>

<style scoped lang="scss">
.empty-state {
  display: flex;
  flex-direction: column;
  gap: $space-1;
  padding: $space-3;
  background: $surface;
  border-radius: $radius-md;
}
.empty-title { font-weight: 650; }
.empty-detail {
  color: $text-secondary;
  font-size: calc(#{$font-caption} * var(--cfls-font-scale, 1));
}
</style>
