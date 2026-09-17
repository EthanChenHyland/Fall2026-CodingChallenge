import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

// https://vite.dev/config/
export default defineConfig({
  envDir: '..',
  plugins: [react(), {
    name: 'versioned-offline-shell',
    closeBundle() {
      const dist = resolve(import.meta.dirname, 'dist')
      const html = readFileSync(resolve(dist, 'index.html'), 'utf8')
      const assets = readdirSync(resolve(dist, 'assets')).filter((file) => /\.(js|css)$/.test(file)).map((file) => `/assets/${file}`)
      const worker = readFileSync(resolve(import.meta.dirname, 'public/sw.js'), 'utf8')
        .replace('__BUILD_ID__', createHash('sha256').update(html).digest('hex').slice(0, 16))
        .replace('/* BUILD_ASSETS */', assets.map((file) => JSON.stringify(file)).join(','))
      writeFileSync(resolve(dist, 'sw.js'), worker)
    },
  }],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/media': 'http://127.0.0.1:3001',
    },
  },
})
