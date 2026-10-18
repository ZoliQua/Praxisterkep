import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // the release the footer names: package.json is the one place it is kept
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        embed: resolve(__dirname, 'embed.html'),
        analysis: resolve(__dirname, 'elemzo.html'),
        europe: resolve(__dirname, 'europa.html'),
        eeszt: resolve(__dirname, 'eeszt.html'),
        specialist: resolve(__dirname, 'szakellato.html'),
        method: resolve(__dirname, 'modszertan.html'),
        county: resolve(__dirname, 'megye.html'),
        district: resolve(__dirname, 'jaras.html'),
        privacy: resolve(__dirname, 'adatkezeles.html'),
        // not a page: the lazy street map the static settlement pages load
        streetmap: resolve(__dirname, 'src/streetmap.ts'),
      },
    },
  },
})
