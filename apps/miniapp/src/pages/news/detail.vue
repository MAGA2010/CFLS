<script setup lang="ts">
import ArticleDetail from '../../components/ArticleDetail.vue'
import PageContainer from '../../components/PageContainer.vue'
import { useDetailPage } from '../../composables/useDetailPage'

const { state, load } = useDetailPage(true)
</script>

<template>
  <PageContainer title="新闻详情" back>
    <ArticleDetail :state="state" @retry="load" />
  </PageContainer>
</template>
