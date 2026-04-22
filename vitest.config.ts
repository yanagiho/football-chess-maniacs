import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
    environmentMatchGlobs: [
      ['src/client/**/__tests__/**', 'jsdom'],
    ],
    coverage: {
      include: ['src/engine/**/*.ts'],
      exclude: ['src/engine/__tests__/**'],
    },
  },
});
