<script setup lang="ts">
import { useMock } from '../lib/config'
import { goBackOrHome } from '../lib/routes'

const props = defineProps<{ title: string; back?: boolean }>()
if (import.meta.env.DEV && !props.title) throw new Error('PageContainer requires a title.')

let top = 0
let trailing = 0
let minHeight = 44
let fontScale = 1
// #ifdef MP-WEIXIN
const windowInfo = wx.getWindowInfo()
const menu = wx.getMenuButtonBoundingClientRect()
top = menu.top || windowInfo.statusBarHeight || 0
trailing = menu.left > 0 ? windowInfo.windowWidth - menu.left + 8 : 0
minHeight = Math.max(44, menu.height)
const systemSize = wx.getAppBaseInfo().fontSizeSetting ?? 16
if (systemSize > 16) fontScale = Math.min(systemSize / 16, 2)
// #endif

const frameStyle = { '--cfls-font-scale': String(fontScale) }
const navStyle = { paddingTop: `${top}px` }
const rowStyle = { minHeight: `${minHeight}px`, marginRight: `${trailing}px` }
</script>

<template>
  <view class="page-frame" :style="frameStyle">
    <view class="page-head" :style="navStyle">
      <view class="nav-row" :style="rowStyle">
        <button v-if="back" class="back-button" aria-label="返回" hover-class="back-pressed" @tap="goBackOrHome">
          <view class="back-arrow" aria-hidden="true" />
        </button>
        <text class="page-title">{{ title }}</text>
      </view>
      <view class="environment">
        <view class="environment-dot" aria-hidden="true" />
        <text>测试环境·合成数据</text>
        <text v-if="useMock" class="environment-mode">接口模拟</text>
      </view>
    </view>
    <view class="page-body"><slot /></view>
  </view>
</template>

<style scoped lang="scss">
.page-frame {
  min-height: 100vh;
  font-size: calc(#{$font-body} * var(--cfls-font-scale, 1));
}
.page-head {
  position: sticky;
  top: 0;
  z-index: 5;
  box-sizing: border-box;
  background: $surface;
  border-bottom: $border-hairline solid $border;
}
.nav-row {
  display: flex;
  align-items: center;
  gap: $space-1;
  padding: 0 $space-4;
}
.page-title {
  overflow: hidden;
  color: $text-primary;
  font-size: calc(#{$font-title} * var(--cfls-font-scale, 1));
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.back-button {
  display: flex;
  flex: 0 0 $tap-min-height;
  align-items: center;
  justify-content: center;
  min-height: $tap-min-height;
  margin: 0 0 0 (-$space-4);
  padding: 0;
  color: $brand-ink;
  background: $surface;
  border-radius: $radius-md;
}
.back-button::after { border: 0; }
.back-pressed { background: $brand-wash; }
.back-arrow {
  width: $space-2;
  height: $space-2;
  border-bottom: 2px solid currentColor;
  border-left: 2px solid currentColor;
  transform: rotate(45deg);
}
.environment {
  display: flex;
  align-items: center;
  gap: $space-1;
  padding: $space-1 $space-4 $space-2;
  color: $brand-ink;
  font-size: calc(#{$font-caption} * var(--cfls-font-scale, 1));
  line-height: 1.35;
}
.environment-dot {
  flex: 0 0 $space-1;
  height: $space-1;
  border-radius: 50%;
  background: $brand;
}
.environment-mode { margin-left: $space-2; }
.page-body {
  box-sizing: border-box;
  width: 100%;
  max-width: 1040rpx;
  margin: 0 auto;
  padding: $space-3 $space-4 calc(#{$space-4} + env(safe-area-inset-bottom));
}
</style>
