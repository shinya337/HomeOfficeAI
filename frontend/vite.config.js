/**
 * Vite Configuration for HomeOffice.ai Frontend
 *
 * Provides:
 * - Development server on port 5173
 * - API proxy to backend server (localhost:3001)
 * - Vitest configuration with jsdom for DOM testing
 *
 * Requirements: 5.2
 */

export default {
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ['firebase/app', 'firebase/auth'],
  },
  test: {
    environment: 'jsdom',
  },
};
