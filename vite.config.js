import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'chart': ['chart.js'],
          'pdf': ['jspdf'],
          'react-vendor': ['react', 'react-dom']
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    chunkSizeWarningLimit: 1000,
    reportCompressedSize: true
  },
  server: {
    port: 5173,
    strictPort: true
  },
  optimizeDeps: {
    include: ['chart.js', 'jspdf', 'react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei']
  }
});
