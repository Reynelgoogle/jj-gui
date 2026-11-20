import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // Relative asset paths so the same build works over HTTP and via
    // Electron's `loadFile()` (file://).
    base: './',
    plugins: [react(), tailwindcss()],
    define: {
      // Injected at build time so the browser bundle never relies on
      // `import.meta.env` inside shared Node modules.
      __JJ_DEFAULT_REPO__: JSON.stringify(env.VITE_DEFAULT_REPO || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR can be disabled with DISABLE_HMR=true when file watching is
      // unwanted (e.g. while an agent edits files).
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
