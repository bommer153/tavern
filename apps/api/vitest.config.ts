import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: false, include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'], testTimeout: 60_000, hookTimeout: 120_000, fileParallelism: false },
  // SWC emits decorator metadata, which Nest DI needs (esbuild does not).
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
