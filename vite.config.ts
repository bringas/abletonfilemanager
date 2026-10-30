import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Los .als reales de prueba pueden descomprimir a XML de varios MB; jsdom
    // tarda más que un navegador real en analizarlo.
    testTimeout: 20000,
  },
})
