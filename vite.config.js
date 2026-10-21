import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Rutas relativas para poder servirse desde un subdirectorio (GitHub Pages)
  base: './',
  plugins: [react(), tailwindcss()],
})
