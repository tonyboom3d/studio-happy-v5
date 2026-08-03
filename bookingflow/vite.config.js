import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'

// Plugin to copy index.html to 404.html for GitHub Pages
const copy404Plugin = () => {
  return {
    name: 'copy-404',
    closeBundle() {
      const distPath = path.resolve(__dirname, 'dist')
      const indexPath = path.join(distPath, 'index.html')
      const html404Path = path.join(distPath, '404.html')
      
      if (fs.existsSync(indexPath)) {
        fs.copyFileSync(indexPath, html404Path)
        console.log('✓ Copied index.html to 404.html')
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/studio-happy-bookingflow/',
  plugins: [
    react(),
    copy404Plugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Content hashes so GitHub Pages / browsers pick up new deploys
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
})