import { createRequire } from 'node:module'
import { defineConfig, loadEnv } from 'vite'
import { initPreContext } from '@dcloudio/uni-cli-shared'
import type uniPlugin from '@dcloudio/vite-plugin-uni'
import { inquiryEnabledFor } from './src/lib/inquiryEnabled'
import { tokens } from './src/styles/tokens'

const require = createRequire(import.meta.url)
const { default: uni } = require('@dcloudio/vite-plugin-uni') as { default: typeof uniPlugin }
const sassTokens = Object.entries(tokens)
  .map(([name, value]) => `$${name}: ${value};`)
  .join('\n')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const mock = mode === 'development' && env.VITE_API_MODE === 'mock'
  initPreContext(process.env.UNI_PLATFORM === 'mp-weixin' ? 'mp-weixin' : 'h5', {
    CFLS_TEST_INQUIRY: inquiryEnabledFor(mode, env.VITE_INQUIRY_ENABLED) && !mock,
  })

  return {
    plugins: [uni()],
    css: {
      preprocessorOptions: {
        scss: { additionalData: `${sassTokens}\n`, silenceDeprecations: ['legacy-js-api'] },
      },
    },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  }
})
