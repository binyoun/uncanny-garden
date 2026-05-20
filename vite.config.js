import { defineConfig } from 'vite'

export default defineConfig({
  base: '/uncanny-garden/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    https: true,  // WebXR requires HTTPS even on localhost
    host: true,
  },
})
