interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_API_MODE?: string
  readonly VITE_INQUIRY_ENABLED?: string
}

declare const wx: {
  getWindowInfo: typeof uni.getWindowInfo
  getMenuButtonBoundingClientRect: typeof uni.getMenuButtonBoundingClientRect
  getAppBaseInfo(): { fontSizeSetting?: number }
  getRandomValues(options: UniNamespace.GetRandomValuesOption): void
}
