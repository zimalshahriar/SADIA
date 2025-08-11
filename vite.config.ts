import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['sadia.png'],
      devOptions: {
        enabled: true,
      },
      manifest: {
        name: 'SADIA',
        short_name: 'SADIA',
        description: 'Study Abroad Digital Intelligent Assistant',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'sadia.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'sadia.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'sadia.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'sadia.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      }
    })
  ],
})
