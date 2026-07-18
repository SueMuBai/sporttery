import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { defineConfig } from 'vite'

const externalProxy = process.env.HTTPS_PROXY ?? process.env.https_proxy

export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/sporttery-api': {
        target: 'https://webapi.sporttery.cn',
        changeOrigin: true,
        agent: externalProxy ? new HttpsProxyAgent(externalProxy) : undefined,
        headers: {
          Origin: 'https://www.sporttery.cn',
          Referer: 'https://www.sporttery.cn/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
        },
        rewrite: (path) => path.replace(/^\/sporttery-api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
})
