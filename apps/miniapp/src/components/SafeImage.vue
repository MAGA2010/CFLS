<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{ src?: string; ratio?: string }>()
const placeholder = '/static/article-placeholder.png'
const failed = ref(false)
watch(() => props.src, () => { failed.value = false })
const image = computed(() => !failed.value && props.src && /^https:\/\//i.test(props.src) ? props.src : placeholder)
const dimensions = computed(() => {
  const [width, height] = (props.ratio ?? '2:1').split(':').map(Number)
  const padding = width > 0 && height > 0 ? 100 * height / width : 50
  return { paddingTop: `${padding}%` }
})
</script>

<template>
  <view class="safe-image" :style="dimensions" aria-hidden="true">
    <image class="safe-image-media" :src="image" mode="aspectFill" alt="" @error="failed = true" />
  </view>
</template>

<style scoped lang="scss">
.safe-image {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: $radius-md;
  background: $brand-wash;
}
.safe-image-media {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
