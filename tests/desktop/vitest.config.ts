import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(
  readFileSync(new URL('../../apps/desktop/package.json', import.meta.url), 'utf8'),
);
export default defineConfig({
  root,
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    name: 'desktop',
    environment: 'jsdom',
    include: ['desktop/**/*.test.{ts,tsx}'],
    setupFiles: ['desktop/setup.ts'],
    css: false,
  },
});
