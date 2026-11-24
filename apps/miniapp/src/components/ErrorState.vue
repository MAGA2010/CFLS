<script setup lang="ts">
import { computed } from 'vue'
import AppButton from './AppButton.vue'
import { errorMessage } from '../lib/errorMessage'
import type { ClientError } from '../api/client'
import { goBackOrHome } from '../lib/routes'

const props = defineProps<{ error: ClientError; backOnNotFound?: boolean; retryText?: string; message?: string }>()
const emit = defineEmits<{ retry: [] }>()
if (import.meta.env.DEV && !props.error) throw new Error('ErrorState requires an error.')
const canReturn = computed(() => props.backOnNotFound && props.error.kind === 'api' && props.error.status === 404)
const requestId = computed(() => 'requestId' in props.error ? props.error.requestId : undefined)
</script>

<template>
  <view class="error-state" role="alert">
    <text class="error-title">{{ message || errorMessage(error) }}</text>
    <text v-if="requestId" class="request-id">请求编号 {{ requestId }}</text>
    <AppButton v-if="canReturn" text="返回" type="plain" @tap="goBackOrHome" />
    <AppButton v-else :text="retryText || '重试'" type="plain" @tap="emit('retry')" />
  </view>
</template>

<style scoped lang="scss">
.error-state {
  display: flex;
  flex-direction: column;
  gap: $space-2;
  padding: $space-3;
  background: $surface;
  border-left: 3px solid $state-error;
  border-radius: $radius-md;
}
.error-title { font-weight: 650; }
.request-id {
  color: $text-secondary;
  font-size: calc(#{$font-caption} * var(--cfls-font-scale, 1));
  overflow-wrap: anywhere;
}
</style>
