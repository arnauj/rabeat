import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Rutas relativas para poder servirse desde un subdirectorio (GitHub Pages)
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: { supabase: ['@supabase/supabase-js'], leaflet: ['leaflet'], react: ['react', 'react-dom'] },
      },
    },
  },
})
