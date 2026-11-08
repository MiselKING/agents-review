import { fileURLToPath } from 'node:url';
import { readPort } from '@agents-review/shared/env';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  // Load every variable (prefix '') from the repo-root .env; real env vars win.
  const env = loadEnv(mode, repoRoot, '');
  const apiPort = readPort('API_PORT', env);

  return {
    plugins: [react()],
    envDir: repoRoot,
    server: {
      port: readPort('WEB_PORT', env),
      // Exit with an error if the port is taken instead of silently picking another.
      strictPort: true,
      proxy: {
        '/graphql': `http://localhost:${apiPort}`,
      },
    },
  };
});
