<script setup lang="ts">
import PageContainer from '../../components/PageContainer.vue'
import { catalogGroups, openList } from '../../lib/routes'
</script>

<template>
  <PageContainer title="栏目">
    <view class="catalog">
      <view v-for="group in catalogGroups" :key="group.type" class="catalog-group">
        <text class="group-title">{{ group.title }}</text>
        <view class="group-entries">
          <button
            v-for="entry in group.entries"
            :key="entry.category"
            class="catalog-link"
            hover-class="catalog-pressed"
            @tap="openList(entry)"
          >
            <text>{{ entry.title }}</text>
            <view class="catalog-chevron" aria-hidden="true" />
          </button>
        </view>
      </view>
    </view>
  </PageContainer>
</template>

<style scoped lang="scss">
.catalog { display: flex; flex-direction: column; gap: $space-4; }
.catalog-group { display: flex; flex-direction: column; gap: $space-2; }
.group-title {
  font-size: calc(#{$font-title} * var(--cfls-font-scale, 1));
  font-weight: 750;
}
.group-entries { overflow: hidden; background: $surface; border-radius: $radius-md; }
.catalog-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-3;
  width: 100%;
  min-height: $tap-min-height;
  padding: $space-2 $space-3;
  border-bottom: $border-hairline solid $border;
  background: $surface;
  color: $text-primary;
  font-size: calc(#{$font-body} * var(--cfls-font-scale, 1));
  line-height: 1.45;
  text-align: left;
  white-space: normal;
}
.catalog-link:last-child { border-bottom: 0; }
.catalog-pressed { background: $brand-wash; }
.catalog-chevron {
  flex: 0 0 $space-1;
  height: $space-1;
  border-top: 2px solid $brand-ink;
  border-right: 2px solid $brand-ink;
  transform: rotate(45deg);
}
</style>
