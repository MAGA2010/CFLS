<script setup lang="ts">
import { computed, reactive, ref, shallowRef } from 'vue'
import { onUnload } from '@dcloudio/uni-app'
import { canSubmitInquiry, publicApi } from '../../api'
import type { ClientError } from '../../api/client'
import { inquiryKinds, inquiryLimits } from '../../api/generated'
import type { InquiryResult } from '../../api/public'
import AppButton from '../../components/AppButton.vue'
import ErrorState from '../../components/ErrorState.vue'
import FormField from '../../components/FormField.vue'
import PageContainer from '../../components/PageContainer.vue'
import { useIdempotentSubmit } from '../../composables/useIdempotentSubmit'
import {
  emptyInquiry, mapInquiryErrors, toInquiryRequest, validateInquiry,
  type InquiryDraft, type InquiryErrors, type InquiryField,
} from '../../lib/inquiry'
import { goBackOrHome } from '../../lib/routes'

const form = reactive(emptyInquiry())
const labels: Record<typeof inquiryKinds[number], string> = { consultation: '咨询', visit: '参观' }
const errors = ref<InquiryErrors>({})
const submitError = shallowRef<ClientError>()
const result = shallowRef<InquiryResult>()
const attempted = ref(false)
const machine = useIdempotentSubmit(publicApi.submitInquiry)
const submitting = computed(() => machine.status.value === 'in-flight')
const closedError = computed(() => submitError.value?.kind === 'api' && submitError.value.code === 'NOT_FOUND')

function setField<K extends InquiryField>(field: K, value: InquiryDraft[K]) {
  if (submitting.value || form[field] === value) return
  form[field] = value
  machine.fieldChanged()
  submitError.value = undefined
  const message = validateInquiry(form)[field]
  errors.value[field] = attempted.value || value.length > 0 ? message : undefined
}

function eventValue(event: unknown): string | undefined {
  return (event as { detail?: { value?: string } }).detail?.value
}

function onText(field: 'testName' | 'testContact' | 'message', event: unknown) {
  const value = eventValue(event)
  if (typeof value === 'string') setField(field, value)
}

function onKind(event: unknown) {
  const kind = inquiryKinds.find((value) => value === eventValue(event))
  if (kind) setField('kind', kind)
}

async function submit() {
  if (!canSubmitInquiry || submitting.value) return
  attempted.value = true
  errors.value = validateInquiry(form)
  submitError.value = undefined
  if (Object.keys(errors.value).length) return
  const outcome = await machine.submit(toInquiryRequest(form))
  if (outcome.kind === 'success') {
    Object.assign(form, emptyInquiry())
    errors.value = {}
    result.value = outcome.value
  } else if (outcome.kind === 'failed') {
    submitError.value = outcome.error
    if (outcome.error.kind === 'api' && outcome.error.code === 'VALIDATION_FAILED') {
      errors.value = mapInquiryErrors(outcome.error.details)
    }
  }
}

onUnload(() => {
  machine.dispose()
  Object.assign(form, emptyInquiry())
  errors.value = {}
  result.value = undefined
  submitError.value = undefined
})
</script>

<template>
  <PageContainer title="测试咨询" back>
    <view v-if="!canSubmitInquiry" class="notice">
      <text>测试咨询暂未开放</text>
      <AppButton text="返回" type="plain" @tap="goBackOrHome" />
    </view>
    <view v-else class="inquiry">
      <view class="notice">
        <text class="notice-title">测试环境：仅可填写虚构信息，非正式报名渠道</text>
      </view>

      <view v-if="result" class="inquiry-result" role="status">
        <text class="result-title">测试提交成功（合成数据）</text>
        <text v-if="result.replayed">已重复提交，以下为首次结果</text>
        <text class="result-id">请求编号 {{ result.requestId }}</text>
        <AppButton text="返回" type="plain" @tap="goBackOrHome" />
      </view>
      <view v-else class="inquiry-form">
        <FormField label="类型" required :error="errors.kind">
          <radio-group class="kind-options" aria-label="咨询类型" @change="onKind">
            <label
              v-for="kind in inquiryKinds"
              :key="kind"
              class="kind-option"
              :class="{ 'kind-selected': form.kind === kind }"
              hover-class="kind-pressed"
            >
              <radio :value="kind" :checked="form.kind === kind" :disabled="submitting" color="#1647B9" />
              <text>{{ labels[kind] }}</text>
            </label>
          </radio-group>
        </FormField>
        <FormField
          label="测试称呼" input-id="testName" required :error="errors.testName"
          :counter="form.testName.trim().length + '/' + inquiryLimits.testName"
        >
          <input
            id="testName" class="control" aria-label="测试称呼"
            :value="form.testName" :disabled="submitting" :maxlength="-1"
            placeholder="填写虚构称呼" @input="onText('testName', $event)"
          />
        </FormField>
        <FormField
          label="测试联系方式" input-id="testContact" required :error="errors.testContact"
          :counter="form.testContact.trim().length + '/' + inquiryLimits.testContact"
        >
          <input
            id="testContact" class="control" aria-label="测试联系方式"
            :value="form.testContact" :disabled="submitting" :maxlength="-1"
            placeholder="例如 demo@example.invalid" @input="onText('testContact', $event)"
          />
        </FormField>
        <FormField
          label="留言" input-id="message" :error="errors.message"
          :counter="form.message.length + '/' + inquiryLimits.message"
        >
          <textarea
            id="message" class="control message" aria-label="留言" :value="form.message"
            :disabled="submitting" :maxlength="-1" placeholder="可选，填写虚构内容"
            @input="onText('message', $event)"
          />
        </FormField>
        <ErrorState
          v-if="submitError" :error="submitError" retry-text="重试提交"
          :message="closedError ? '测试咨询暂未开放' : undefined" @retry="submit"
        />
        <AppButton v-else :text="submitting ? '正在提交' : '提交测试咨询'" :loading="submitting" type="primary" @tap="submit" />
      </view>
    </view>
  </PageContainer>
</template>

<style scoped lang="scss">
.inquiry, .inquiry-form, .inquiry-result, .notice { display: flex; flex-direction: column; gap: $space-3; }
.notice {
  padding: $space-3;
  color: $brand-ink;
  background: $brand-wash;
  border-radius: $radius-md;
}
.notice-title { font-weight: 650; }
.inquiry-form, .inquiry-result {
  padding: $space-3;
  border-radius: $radius-md;
  background: $surface;
}
.inquiry-result { border-left: 3px solid $state-success; }
.result-title {
  font-size: calc(#{$font-title} * var(--cfls-font-scale, 1));
  font-weight: 750;
}
.result-id {
  color: $text-secondary;
  font-size: calc(#{$font-caption} * var(--cfls-font-scale, 1));
  overflow-wrap: anywhere;
}
.kind-options { display: flex; flex-wrap: wrap; gap: $space-2; }
.kind-option {
  display: flex;
  flex: 1 1 155rpx;
  align-items: center;
  gap: $space-1;
  min-height: $tap-min-height;
  padding: 0 $space-2;
  border: $border-hairline solid $border;
  border-radius: $radius-md;
}
.kind-selected, .kind-pressed { background: $brand-wash; color: $brand-ink; border-color: $brand-ink; }
.control {
  box-sizing: border-box;
  width: 100%;
  min-height: $tap-min-height;
  padding: $space-2;
  border: $border-hairline solid $border;
  border-radius: $radius-md;
  background: $bg-page;
  color: $text-primary;
  font-size: calc(#{$font-body} * var(--cfls-font-scale, 1));
  line-height: $leading-body;
}
.message { height: 180rpx; }
</style>
