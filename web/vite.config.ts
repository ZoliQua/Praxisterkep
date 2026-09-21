import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        embed: resolve(__dirname, 'embed.html'),
        analysis: resolve(__dirname, 'elemzo.html'),
        eeszt: resolve(__dirname, 'eeszt.html'),
        specialist: resolve(__dirname, 'szakellato.html'),
      },
    },
  },
})
