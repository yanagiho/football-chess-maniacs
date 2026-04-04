import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      include: ['src/engine/**/*.ts'],
      exclude: ['src/engine/__tests__/**'],
    },
  },
});
