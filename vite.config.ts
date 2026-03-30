import { defineConfig } from 'vite';

export default defineConfig({
  base: '/render-test/',
  build: {
    target: ['es2022', 'chrome107', 'safari16'],
  },
});
