import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Expose only the same public build variables previously consumed by CRA.
  const source = loadEnv(mode, process.cwd(), 'REACT_APP_');
  const publicEnv = Object.fromEntries(Object.entries({ ...source, ...process.env })
    .filter(([name]) => name.startsWith('REACT_APP_')));
  publicEnv.NODE_ENV = mode === 'production' ? 'production' : 'development';
  return {
    plugins: [react()],
    define: { 'process.env': JSON.stringify(publicEnv) },
    build: { outDir: 'build', sourcemap: false },
    server: { host: '0.0.0.0', port: 3000 },
  };
});
