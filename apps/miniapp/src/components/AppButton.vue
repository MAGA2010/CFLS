<script setup lang="ts">
const props = defineProps<{
  text: string
  type: 'primary' | 'plain'
  loading?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ tap: [] }>()
if (import.meta.env.DEV && (!props.text || !props.type)) throw new Error('AppButton requires text and type.')

function tap() {
  if (!props.disabled && !props.loading) emit('tap')
}
</script>

<template>
  <button
    class="app-button"
    :class="'button-' + type"
    :loading="loading"
    :disabled="disabled || loading"
    :aria-busy="loading"
    hover-class="button-pressed"
    @tap="tap"
  >{{ text }}</button>
</template>

<style scoped lang="scss">
.app-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: $tap-min-height;
  padding: $space-2 $space-3;
  border: $border-hairline solid transparent;
  border-radius: $radius-md;
  font-size: calc(#{$font-body} * var(--cfls-font-scale, 1));
  font-weight: 650;
  line-height: 1.3;
  white-space: normal;
}
.button-primary { background: $brand-ink; color: $surface; }
.button-plain { background: $surface; border-color: $border; color: $brand-ink; }
.button-pressed { opacity: 0.76; }
.app-button[disabled] { opacity: 0.64; }
</style>
