import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }
import { dataVersions } from './scripts/data-versions.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // the release the footer names: package.json is the one place it is kept
  // and the content hash of every data file, which src/lib/dataUrl.ts puts in
  // the query so a browser can cache the file until it changes
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __DATA_VERSIONS__: JSON.stringify(dataVersions(resolve(__dirname, 'public', 'data'))),
  },
  build: {
    rollupOptions: {
      // Two shared pieces kept in chunks of their own, so a release changes
      // only what it changed: the Hungarian dictionary (every page loads it)
      // and the data-file hashes (they change with every ETL run).
      output: {
        codeSplitting: {
          groups: [
            { name: 'i18n-hu', test: /src[\\/]i18n[\\/]hu\.json/ },
            { name: 'data-versions', test: /src[\\/]lib[\\/]dataUrl\.ts/ },
          ],
        },
      },
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
        media: resolve(__dirname, 'media.html'),
        nonterritorial: resolve(__dirname, 'tek-nelkul.html'),
        // not a page: the lazy street map the static settlement pages load
        streetmap: resolve(__dirname, 'src/streetmap.ts'),
        // not a page either: the PDF export button of the static settlement pages
        pdfexport: resolve(__dirname, 'src/pdfexport.ts'),
        // nor this: the light/dark and colour-scheme buttons of the static pages
        statictools: resolve(__dirname, 'src/navtoolsStatic.ts'),
        // nor this: the animated story of the static settlement pages (it loads
        // its canvas half lazily, see src/storyStatic.ts)
        staticstory: resolve(__dirname, 'src/storyStatic.ts'),
      },
    },
  },
})
