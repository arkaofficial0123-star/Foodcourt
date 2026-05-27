import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'optional-firebase-config',
        enforce: 'pre',
        resolveId(id) {
          if (id.includes('firebase-applet-config.json')) {
            const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
            if (!fs.existsSync(configPath)) {
              return '\0firebase-applet-config.json';
            }
          }
          return null;
        },
        load(id) {
          if (id === '\0firebase-applet-config.json') {
            return 'export default {};';
          }
          return null;
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
