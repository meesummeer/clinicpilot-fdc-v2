import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Right now this deploys to the default GitHub Pages project URL
  // (meesummeer.github.io/clinicpilot-fdc-v2/), which needs that path as
  // the base. Once the custom domain (clinicpilot.faseehdentalclinic.com)
  // is live, assets should be served from the root instead — set a repo
  // Actions *variable* (not secret) named VITE_BASE_PATH to "/" at that
  // point (Settings -> Secrets and variables -> Actions -> Variables) and
  // add a CNAME file; no code change needed here.
  base: process.env.VITE_BASE_PATH || '/clinicpilot-fdc-v2/',
  build: {
    outDir: 'dist',
  },
});
