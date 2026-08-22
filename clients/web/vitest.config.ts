import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Test config kept separate from vite.config.ts so the build stays untouched.
// Default environment is node (fast); the logic under test is pure functions and
// fetch-based clients, so we stub `fetch` per-test rather than render components.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    // Deterministic Web Storage (localStorage/sessionStorage) on every Node
    // version — see src/test/setup.ts for the Node >= 25 shadowing rationale.
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    clearMocks: true,
    restoreMocks: true,
  },
})
