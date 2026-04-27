import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const uiRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: uiRoot,
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5175,
    proxy: {
      '/voicevox': {
        target: 'http://127.0.0.1:50021',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/voicevox/, ''),
      },
    },
  },
})
