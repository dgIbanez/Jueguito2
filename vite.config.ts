import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths keep the build working under any GitHub Pages subpath.
  base: './',
  build: { outDir: 'dist', target: 'es2022' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
