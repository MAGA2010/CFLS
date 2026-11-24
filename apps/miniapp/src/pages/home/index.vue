<script setup lang="ts">
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import { canSubmitInquiry, publicApi } from '../../api'
import AppButton from '../../components/AppButton.vue'
import HomeSection from '../../components/HomeSection.vue'
import PageContainer from '../../components/PageContainer.vue'
import { useResource } from '../../composables/useResource'
import { openDetail, openList, route, type ContentFilter } from '../../lib/routes'

const homeSections: Array<{ title: string; link: string; filter: ContentFilter; size: number }> = [
  { title: '最新新闻', link: '全部新闻', filter: { type: 'news' }, size: 3 },
  { title: '学校介绍', link: '了解学校', filter: { type: 'school', category: 'overview' }, size: 1 },
  { title: '课程体系', link: '浏览课程', filter: { type: 'academics' }, size: 1 },
  { title: '升学指导', link: '查看升学', filter: { type: 'outcomes' }, size: 1 },
  { title: '校园生活', link: '探索校园', filter: { type: 'campus' }, size: 1 },
  { title: '学生会', link: '学生会动态', filter: { type: 'student_union' }, size: 1 },
  { title: '招生信息', link: '查看招生', filter: { type: 'admissions' }, size: 1 },
]
const sections = homeSections.map((section) => ({
  ...section,
  ...useResource(async () =>
    (await publicApi.list({ ...section.filter, page: 1, pageSize: section.size })).data),
}))

const load = () => Promise.all(sections.map((section) => section.load()))
onLoad(() => { void load() })
onPullDownRefresh(async () => {
  try { await load() } finally { uni.stopPullDownRefresh() }
})

const showCatalog = () => uni.switchTab({ url: route.catalog })
const showInquiry = () => uni.navigateTo({ url: route.inquiry })
</script>

<template>
  <PageContainer title="校园指南">
    <view class="home">
      <view class="school-intro">
        <view class="school-illustration" aria-hidden="true">
          <view class="hero-orbit hero-orbit-large" />
          <view class="hero-orbit hero-orbit-small" />
          <view class="hero-page hero-page-back" />
          <view class="hero-page hero-page-front">
            <view class="hero-rule hero-rule-long" />
            <view class="hero-rule" />
            <view class="hero-rule hero-rule-short" />
          </view>
        </view>
        <view class="school-intro-content">
          <view class="school-name">
            <text class="school-name-line">成都外国语学校</text>
            <text class="school-name-line">国际部</text>
          </view>
          <button class="school-link" hover-class="school-link-pressed" @tap="showCatalog">
            <text>浏览栏目</text><view class="school-link-arrow" aria-hidden="true" />
          </button>
        </view>
      </view>

      <HomeSection
        v-for="section in sections"
        :key="section.filter.type"
        :title="section.title"
        :link="section.link"
        :state="section.state.value"
        :empty="section.filter.type === 'news' ? 'no-content' : 'pending-school'"
        :hide-empty="section.filter.type === 'admissions'"
        @open="openList(section.filter)"
        @article="openDetail($event, section.filter.type === 'news')"
        @retry="section.load"
      >
        <!-- #ifdef CFLS_TEST_INQUIRY -->
        <AppButton
          v-if="section.filter.type === 'admissions' && canSubmitInquiry"
          text="测试咨询" type="plain" @tap="showInquiry"
        />
        <!-- #endif -->
      </HomeSection>
    </view>
  </PageContainer>
</template>

<style scoped lang="scss">
.home { display: flex; flex-direction: column; gap: $space-4; }
.school-intro {
  position: relative;
  min-height: 282rpx;
  overflow: hidden;
  border-radius: $radius-md;
  background: #183F9E;
  color: $surface;
}
.school-intro-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: $space-3;
  max-width: 80%;
  padding: $space-4;
}
.school-name {
  font-size: calc(46rpx * var(--cfls-font-scale, 1));
  font-weight: 750;
  line-height: 1.16;
  overflow-wrap: anywhere;
}
.school-name-line { display: block; }
.school-link {
  display: flex;
  align-items: center;
  gap: $space-2;
  min-height: $tap-min-height;
  margin: 0;
  padding: 0 $space-3;
  border: $border-hairline solid #A9C2FF;
  border-radius: $radius-md;
  background: #F2F5FF;
  color: $brand-ink;
  font-size: calc(#{$font-body} * var(--cfls-font-scale, 1));
  font-weight: 700;
  line-height: 1.25;
  text-align: left;
  white-space: normal;
}
.school-link-pressed { background: #D5E2FF; }
.school-link-arrow {
  flex: 0 0 $space-1;
  height: $space-1;
  border-top: 2px solid currentColor;
  border-right: 2px solid currentColor;
  transform: rotate(45deg);
}
.school-illustration { position: absolute; right: 0; bottom: 0; width: 48%; height: 100%; pointer-events: none; }
.hero-orbit { position: absolute; border: 1px solid #6C92EF; border-radius: 50%; }
.hero-orbit-large { width: 340rpx; height: 340rpx; right: -155rpx; top: -58rpx; }
.hero-orbit-small { width: 290rpx; height: 290rpx; right: -118rpx; top: -30rpx; opacity: 0.65; }
.hero-page {
  position: absolute;
  bottom: -42rpx;
  width: 147rpx;
  height: 206rpx;
  border: 1px solid #799AFF;
  border-radius: $radius-md;
}
.hero-page-back { right: 76rpx; transform: rotate(-20deg); background: #2F5BC6; }
.hero-page-front { right: 24rpx; transform: rotate(12deg); background: #426DDB; }
.hero-rule { width: 72rpx; height: 4rpx; margin: $space-2 auto 0; border-radius: 5rpx; background: #B2C7FF; }
.hero-rule-long { width: 88rpx; margin-top: $space-4; }
.hero-rule-short { width: 52rpx; }
</style>
