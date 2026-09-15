/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the same build works whether it's served from this
  // repo's own Pages site (/plot-log/) or nested inside Egg Tools
  // (/tools/plot-log/) — see PLAN.md.
  base: './',
  plugins: [preact()],
  test: {},
});
