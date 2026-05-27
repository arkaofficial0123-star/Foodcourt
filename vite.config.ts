import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const hasPlatformConfig = fs.existsSync(path.resolve(__dirname, 'firebase-applet-config.json'));
  const platformConfigPath = hasPlatformConfig
    ? path.resolve(__dirname, 'firebase-applet-config.json')
    : path.resolve(__dirname, 'src/firebase-fallback-config.json');

  return {
    plugins: [
      react(), 
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '../firebase-applet-config.json': platformConfigPath,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
