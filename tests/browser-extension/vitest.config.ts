import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    name: 'browser-extension',
    environment: 'node',
    include: ['browser-extension/**/*.test.ts'],
  },
});
