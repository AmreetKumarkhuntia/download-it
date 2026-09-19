import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import manifest from './manifest.json';
import pkg from './package.json';

export default defineConfig({
  plugins: [
    {
      name: 'extension-manifest',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'manifest.json',
          source: JSON.stringify({ ...manifest, version: pkg.version }, null, 2),
        });
        this.emitFile({
          type: 'asset',
          fileName: 'icon.png',
          source: readFileSync(new URL('../desktop/src-tauri/icons/128x128.png', import.meta.url)),
        });
      },
    },
  ],
  build: {
    rollupOptions: {
      input: { popup: 'popup.html', background: 'src/background.ts' },
      output: { entryFileNames: '[name].js' },
    },
  },
});
