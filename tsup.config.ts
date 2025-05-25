// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts'], // <--- Changed to include all TypeScript files in src
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: true, // <--- Set to true to allow separate files if needed
  treeshake: true,
  sourcemap: false,
  minify: true,
  bundle: false, // <--- Crucial: Set to false to output separate files
  platform: 'browser',
  // You might still want chunkNames if splitting is true and you have shared modules,
  // but let's keep it simple for now if bundle is false.
  // esbuildOptions(options) {
  //   options.chunkNames = 'chunks/[name]-[hash]';
  // },
  noExternal: ['vue'] // Keep this if you want vue to be a peer dependency
});