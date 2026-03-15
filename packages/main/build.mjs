// esbuild bundler for the Electron main process.
// Bundles everything (including @gui-bridge/shared, dockerode, and all other
// pure-JS deps) into two self-contained files -- no node_modules at runtime.
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

// Plugin: replace native .node bindings with empty stubs.
// ssh2 (via dockerode -> docker-modem) has a pure-JS fallback when its
// native crypto module is absent -- Docker socket connections don't use SSH.
const stubNativePlugin = {
  name: 'stub-native',
  setup(build) {
    build.onLoad({ filter: /\.node$/ }, () => ({
      contents: 'module.exports = {}',
      loader: 'js',
    }));
  },
};

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  // Only electron itself must stay external (provided by the runtime).
  external: ['electron'],
  plugins: [stubNativePlugin],
  minify: false,
  sourcemap: true,
};

await Promise.all([
  // Main process entry point
  esbuild.build({
    ...common,
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.js',
  }),

  // Preload script (contextBridge -- also imports @gui-bridge/shared)
  esbuild.build({
    ...common,
    entryPoints: ['src/preload.ts'],
    outfile: 'dist/preload.js',
  }),
]);

console.log('bundled main process');
