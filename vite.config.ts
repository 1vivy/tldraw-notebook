import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { config } from 'dotenv'
config()
process.env.VITE_TLDRAW_LICENSE_KEY = process.env.TLDRAW_LICENSE_KEY || ''
process.env.VITE_NOTEBOOK_ROOMS = process.env.NOTEBOOK_ROOMS || ''

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  plugins: [react()],
  root: fileURLToPath(new URL('./src/client', import.meta.url)),
  envDir: projectRoot,
  publicDir: '../../public',
  build: {
    outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5757,
    proxy: {
      '/connect': { target: 'http://127.0.0.1:5858', ws: true },
      '/uploads': { target: 'http://127.0.0.1:5858' },
    },
  },
})
