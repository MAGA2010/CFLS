<script setup lang="ts">
const props = defineProps<{ label: string; inputId?: string; error?: string; counter?: string; required?: boolean }>()
if (import.meta.env.DEV && !props.label) throw new Error('FormField requires a label.')
</script>

<template>
  <view class="form-field">
    <view class="field-heading">
      <label :for="inputId" class="field-label">{{ label }}<text v-if="required" class="required-mark">（必填）</text></label>
      <text v-if="counter" class="field-counter">{{ counter }}</text>
    </view>
    <slot />
    <text v-if="error" class="field-error" role="alert">{{ error }}</text>
  </view>
</template>

<style scoped lang="scss">
.form-field { display: flex; flex-direction: column; gap: $space-1; min-width: 0; }
.field-heading { display: flex; justify-content: space-between; flex-wrap: wrap; gap: $space-1 $space-2; }
.field-label { font-weight: 650; }
.required-mark, .field-counter {
  color: $text-secondary;
  font-size: calc(#{$font-caption} * var(--cfls-font-scale, 1));
}
.field-error {
  color: #9C3434;
  font-size: calc(#{$font-caption} * var(--cfls-font-scale, 1));
}
</style>
