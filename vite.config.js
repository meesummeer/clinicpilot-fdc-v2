import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Custom domain deploy (app.faseehdentalclinic.com), not a GitHub project page,
  // so assets are served from the root — unlike YMDC's '/clinicpilot-ymdc/'.
  base: '/',
  build: {
    outDir: 'dist',
  },
});
