import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Run test files sequentially to avoid shared SQLite DB conflicts
    fileParallelism: false,
    testTimeout: 60000, // HEIC hashing is CPU-intensive
    hookTimeout: 30000,
    reporters: ['verbose'],
    sequence: {
      concurrent: false,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
