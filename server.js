// This file is only used in development
// In production, Render should use: node dist/server.js
// If this file is called in production, redirect to compiled version

const fs = require('fs');
const path = require('path');
const distServerPath = path.join(__dirname, 'dist', 'server.js');

// Check if compiled version exists (production build)
if (fs.existsSync(distServerPath)) {
  console.log('Using compiled server from dist/server.js');
  require('./dist/server.js');
} else {
  // Development: Use ts-node
  console.log('Using TypeScript server with ts-node');
  require('ts-node/register');
  const { default: buildServer } = require('./server.ts');
  const { ensureDeveloper } = require('./services/auth.service');
  const { env } = require('./config/env');

  const server = buildServer();

  const start = async () => {
    try {
      await ensureDeveloper();
    } catch (error) {
      server.log.warn(
        `ensureDeveloper failed: ${error?.message || 'unknown error'}. Continuing startup.`
      );
    }

    try {
      await server.listen({ port: env.port, host: '0.0.0.0' });
      server.log.info(`Server listening on port ${env.port}`);
    } catch (error) {
      server.log.error(error);
      process.exit(1);
    }
  };

  start();
}
