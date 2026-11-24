<script setup lang="ts">
const props = defineProps<{ variant: 'list' | 'detail' }>()
if (import.meta.env.DEV && !props.variant) throw new Error('LoadingSkeleton requires a variant.')
</script>

<template>
  <view class="skeleton" :class="'skeleton-' + variant" role="status" aria-label="加载中" aria-busy="true">
    <view v-if="variant === 'detail'" class="skeleton-image" />
    <view class="skeleton-line skeleton-heading" />
    <view class="skeleton-line" />
    <view v-if="variant === 'detail'" class="skeleton-line" />
  </view>
</template>

<style scoped lang="scss">
.skeleton {
  display: flex;
  flex-direction: column;
  gap: $space-2;
  padding: $space-3;
  background: $surface;
  border-radius: $radius-md;
}
.skeleton-image, .skeleton-line { background: $brand-wash; border-radius: $radius-md; }
.skeleton-image { aspect-ratio: 2; width: 100%; }
.skeleton-line { width: 78%; height: $space-2; }
.skeleton-heading { width: 48%; height: $space-3; }
</style>
