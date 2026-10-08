import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { host: 'localhost', port: 5173, strictPort: true,
  // Generated data (test camera videos, uploads, databases) is not source; watching it stalls startup.
  watch: { ignored: ['**/.cache/**', '**/test-data/**', '**/test-results/**', '**/data/**', '**/uploads/**', '**/backups/**', '**/demo-runtime/**', '**/.logs/**'] }, proxy: { '/api': 'http://localhost:3001', '/zone-codes': 'http://localhost:3001' } }, build: { outDir: 'dist' } });
