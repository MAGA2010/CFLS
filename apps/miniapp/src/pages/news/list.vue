<script setup lang="ts">
import ContentListBody from '../../components/ContentListBody.vue'
import PageContainer from '../../components/PageContainer.vue'
import { useListPage } from '../../composables/useListPage'

const { title, list } = useListPage(true)
</script>

<template>
  <PageContainer :title="title">
    <ContentListBody :list="list" news />
  </PageContainer>
</template>
