<script setup lang="ts">
import { computed } from 'vue'
import { canSubmitInquiry } from '../../api'
import AppButton from '../../components/AppButton.vue'
import ContentListBody from '../../components/ContentListBody.vue'
import PageContainer from '../../components/PageContainer.vue'
import { useListPage } from '../../composables/useListPage'
import { route } from '../../lib/routes'

const { title, context, list } = useListPage()
const showInquiry = computed(() => canSubmitInquiry && context.value?.type === 'admissions' &&
  (!context.value?.category || context.value.category === 'consultation'))
const openInquiry = () => uni.navigateTo({ url: route.inquiry })
</script>

<template>
  <PageContainer :title="title" back>
    <view class="list-page">
      <!-- #ifdef CFLS_TEST_INQUIRY -->
      <AppButton v-if="showInquiry" text="测试咨询" type="primary" @tap="openInquiry" />
      <!-- #endif -->
      <ContentListBody :list="list" />
    </view>
  </PageContainer>
</template>

<style scoped lang="scss">
.list-page { display: flex; flex-direction: column; gap: $space-3; }
</style>
