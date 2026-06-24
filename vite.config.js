import { defineConfig } from 'vite'

export default defineConfig({
  base: '/uncanny-garden/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    https: true,   // camera + MediaPipe require HTTPS even on localhost
    host: true,    // expose to LAN so you can test on phone directly
  },
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
})
