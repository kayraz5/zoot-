import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const STAMP_DIR = fileURLToPath(new URL('./public/stamps', import.meta.url))

/**
 * Expose the PNG filenames in public/stamps as the virtual module `virtual:stamps`.
 *
 * Stamp art is matched by filename at runtime (see model/services/stampArt.js), so
 * dropping a new PNG into the folder is enough — there is no hand-maintained list
 * to keep in sync. In dev, adding/removing a file reloads the page.
 */
function stampManifest() {
  const virtualId = 'virtual:stamps'
  const resolvedId = '\0' + virtualId

  return {
    name: 'zoot-stamp-manifest',
    resolveId(id) {
      if (id === virtualId) return resolvedId
    },
    load(id) {
      if (id !== resolvedId) return
      const files = existsSync(STAMP_DIR)
        ? readdirSync(STAMP_DIR)
            .filter((file) => file.toLowerCase().endsWith('.png'))
            .sort()
        : []
      return `export default ${JSON.stringify(files)}`
    },
    configureServer(server) {
      server.watcher.add(STAMP_DIR)
      const reloadForStamp = (file) => {
        if (file.startsWith(STAMP_DIR)) server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', reloadForStamp)
      server.watcher.on('unlink', reloadForStamp)
    }
  }
}

/**
 * Dev only: serve the Vercel functions in api/ from the Vite server, so /api/plan
 * and /api/summary work under `pnpm dev`. Server-only vars (GROQ_API_KEY) are read
 * from .env into process.env here and never reach the browser bundle.
 */
function vercelApiDev() {
  return {
    name: 'vercel-api-dev',
    apply: 'serve',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''))
      server.middlewares.use('/api', async (req, res, next) => {
        const name = req.url.split('?')[0].replace(/^\/+/, '')
        if (!/^[a-z-]+$/.test(name)) return next()
        let mod
        try {
          mod = await server.ssrLoadModule(`/api/${name}.js`)
        } catch {
          return next()
        }
        let raw = ''
        for await (const chunk of req) raw += chunk
        try { req.body = raw ? JSON.parse(raw) : {} } catch { req.body = {} }
        res.status = (code) => { res.statusCode = code; return res }
        res.json = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)) }
        try {
          await mod.default(req, res)
        } catch (err) {
          res.status(500).json({ error: String(err.message || err) })
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    vercelApiDev(),
    stampManifest(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
