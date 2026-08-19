import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',   // escucha en todas las interfaces (red local incluida)
    port: 5190,         // puerto fijo para Portal ERP
    strictPort: true,   // falla si el puerto está ocupado en vez de buscar otro
    allowedHosts: ['op-dash.com', 'www.op-dash.com'], // Permite peticiones desde el túnel de Cloudflare
    watch: {
      usePolling: true, // Necesario para detectar cambios por red (SMB/Carpeta Compartida)
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
      }
    }
  },
})
