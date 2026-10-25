/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

const web = resolve(import.meta.dirname, 'web');
const pages = ['admin', 'overlay/starting-soon', 'overlay/draft', 'overlay/lineup', 'overlay/ingame', 'overlay/postgame', 'overlay/pause'];

export default defineConfig({
  root: web,
  base: '/',
  plugins: [svelte()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist/web'),
    emptyOutDir: true,
    rollupOptions: { input: Object.fromEntries(pages.map(p => [p, resolve(web, p, 'index.html')])) },
  },
  test: { root: import.meta.dirname, include: ['tests/**/*.test.ts'] },
});
